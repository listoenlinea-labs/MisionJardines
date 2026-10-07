using System.Runtime.InteropServices;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
var sdkGate = new SemaphoreSlim(1, 1);

string Host() => Environment.GetEnvironmentVariable("ZKTECO_HOST")?.Trim()
                 ?? throw new InvalidOperationException("Falta ZKTECO_HOST");
int Port() => int.TryParse(Environment.GetEnvironmentVariable("ZKTECO_PORT"), out var p) ? p : 4370;
string CommPassword() => Environment.GetEnvironmentVariable("ZKTECO_COMM_PASSWORD")?.Trim() ?? "";
string Token() => Environment.GetEnvironmentVariable("BRIDGE_TOKEN")?.Trim() ?? "";

bool Authorized(HttpRequest req)
{
    var expected = Token();
    if (string.IsNullOrWhiteSpace(expected)) return true;
    var auth = req.Headers.Authorization.ToString();
    return auth == "Bearer " + expected;
}

string ConnString()
{
    var sb = new StringBuilder();
    sb.Append("protocol=TCP");
    sb.Append(",ipaddress=").Append(Host());
    sb.Append(",port=").Append(Port());
    sb.Append(",timeout=5000");
    // PullSDK expects the parameter name "passwd" (not "password").
    // Include it even when empty; the official examples use passwd= for
    // controllers without a communication password.
    sb.Append(",passwd=").Append(CommPassword());
    return sb.ToString();
}

static string Date8(string? value)
{
    if (string.IsNullOrWhiteSpace(value)) return "";
    if (DateTime.TryParse(value, out var dt)) return dt.ToString("yyyyMMdd");
    var digits = new string(value.Where(char.IsDigit).ToArray());
    return digits.Length >= 8 ? digits[..8] : "";
}

static string EscapeValue(string? value)
{
    return (value ?? "")
        .Replace("\t", " ")
        .Replace("\r", " ")
        .Replace("\n", " ")
        .Trim();
}

static bool IsTransientConnectError(int error)
{
    // -10053/-10054/-10060 are Windows socket abort/reset/timeout conditions.
    // -107 is also seen transiently by this C3 when sessions are opened close together.
    return error is -107 or -10053 or -10054 or -10060;
}

async Task<int> ConnectAsync()
{
    for (var attempt = 1; attempt <= 3; attempt++)
    {
        var conn = Native.AllocZ(ConnString(), out var pin);
        try
        {
            var handle = Native.Connect(conn);
            if (handle > 0) return handle;

            var err = Native.PullLastError();
            if (IsTransientConnectError(err) && attempt < 3)
            {
                Console.WriteLine($"[PullSDK] Connect transitorio lastError={err}; reintento {attempt + 1}/3");
                await Task.Delay(900 * attempt);
                continue;
            }

            throw new InvalidOperationException($"PullSDK Connect falló: handle={handle}, lastError={err}");
        }
        finally
        {
            if (pin.IsAllocated) pin.Free();
        }
    }

    throw new InvalidOperationException("PullSDK Connect falló después de varios intentos");
}

int SetData(int handle, string table, string data)
{
    var pTable = Native.AllocZ(table, out var hTable);
    var pData = Native.AllocZ(data, out var hData);
    var pOpt = Native.AllocZ("", out var hOpt);
    try
    {
        var rc = Native.SetDeviceData(handle, pTable, pData, pOpt);
        if (rc < 0)
        {
            var err = Native.PullLastError();
            throw new InvalidOperationException($"SetDeviceData({table}) falló: rc={rc}, lastError={err}");
        }
        return rc;
    }
    finally
    {
        if (hTable.IsAllocated) hTable.Free();
        if (hData.IsAllocated) hData.Free();
        if (hOpt.IsAllocated) hOpt.Free();
    }
}

int DeleteData(int handle, string table, string filter)
{
    var pTable = Native.AllocZ(table, out var hTable);
    var pFilter = Native.AllocZ(filter, out var hFilter);
    var pOpt = Native.AllocZ("", out var hOpt);
    try
    {
        var rc = Native.DeleteDeviceData(handle, pTable, pFilter, pOpt);
        if (rc < 0)
        {
            var err = Native.PullLastError();
            throw new InvalidOperationException($"DeleteDeviceData({table}) falló: rc={rc}, lastError={err}");
        }
        return rc;
    }
    finally
    {
        if (hTable.IsAllocated) hTable.Free();
        if (hFilter.IsAllocated) hFilter.Free();
        if (hOpt.IsAllocated) hOpt.Free();
    }
}

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "zkteco-pullsdk-bridge" }));

app.MapGet("/health/auth", (HttpRequest req) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    return Results.Ok(new { ok = true, authenticated = true });
});

app.MapGet("/health/controller", async (HttpRequest req) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    await sdkGate.WaitAsync();
    int handle = 0;
    try
    {
        handle = await ConnectAsync();
        return Results.Ok(new
        {
            ok = true,
            controller = true,
            host = Host(),
            port = Port()
        });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[PullSDK] /health/controller: {ex.Message}");
        return Results.Json(new { ok = false, controller = false, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.Disconnect(handle); } catch { }
        }
        await Task.Delay(300);
        sdkGate.Release();
    }
});

app.MapPost("/api/users", async (HttpRequest req, UserProvisionRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    await sdkGate.WaitAsync();
    int handle = 0;
    var stage = "connect";
    try
    {
        handle = await ConnectAsync();
        try { Native.EnableDevice(handle, 0); } catch { }

        var start = Date8(body.startDate);
        var end = Date8(body.endDate);
        // Keep the user row to fields documented by the Pull SDK for C3 panels.
        // Some C3 firmware variants reject unknown/unsupported fields with rc=-101.
        var fields = new List<string>
        {
            $"Pin={EscapeValue(body.pin)}",
            $"CardNo={EscapeValue(body.cardNo)}",
            "Password=",
            "Group=1"
        };
        if (!string.IsNullOrWhiteSpace(start)) fields.Add($"StartTime={start}");
        if (!string.IsNullOrWhiteSpace(end)) fields.Add($"EndTime={end}");

        var userRow = string.Join("\t", fields) + "\r\n";
        stage = "set-user";
        SetData(handle, "user", userRow);

        var authRow =
            $"Pin={EscapeValue(body.pin)}\tAuthorizeTimezoneId={Math.Max(1, body.timezoneId)}\tAuthorizeDoorId={Math.Max(1, body.doorMask)}\r\n";
        stage = "set-userauthorize";
        SetData(handle, "userauthorize", authRow);

        return Results.Ok(new
        {
            ok = true,
            cardNo = body.cardNo,
            pin = body.pin,
            doorMask = body.doorMask,
            timezoneId = body.timezoneId
        });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[PullSDK] /api/users falló en {stage}: {ex.Message}");
        return Results.Json(new { ok = false, stage, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
        await Task.Delay(300);
        sdkGate.Release();
    }
});

app.MapPost("/api/users/delete", async (HttpRequest req, DeleteUserRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();

    var pin = EscapeValue(body.pin);
    if (string.IsNullOrWhiteSpace(pin))
        return Results.BadRequest(new { ok = false, error = "Falta Pin para eliminar el usuario" });

    await sdkGate.WaitAsync();
    int handle = 0;
    var stage = "connect";
    try
    {
        handle = await ConnectAsync();
        try { Native.EnableDevice(handle, 0); } catch { }

        stage = "delete-userauthorize";
        var authRc = DeleteData(handle, "userauthorize", $"Pin={pin}");

        stage = "delete-user";
        var userRc = DeleteData(handle, "user", $"Pin={pin}");

        return Results.Ok(new
        {
            ok = true,
            pin,
            cardNo = body.cardNo,
            authRc,
            userRc
        });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[PullSDK] /api/users/delete falló en {stage}: {ex.Message}");
        return Results.Json(new { ok = false, stage, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
        await Task.Delay(300);
        sdkGate.Release();
    }
});

app.MapPost("/api/users/access", async (HttpRequest req, UserAccessRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();

    var pin = EscapeValue(body.pin);
    if (string.IsNullOrWhiteSpace(pin))
        return Results.BadRequest(new { ok = false, error = "Falta Pin para modificar el acceso" });

    await sdkGate.WaitAsync();
    int handle = 0;
    var stage = "connect";
    try
    {
        handle = await ConnectAsync();
        try { Native.EnableDevice(handle, 0); } catch { }

        if (body.authorized)
        {
            stage = "set-userauthorize";
            var timezoneId = Math.Max(1, body.timezoneId);
            var doorMask = Math.Max(1, body.doorMask);
            var authRow =
                $"Pin={pin}\tAuthorizeTimezoneId={timezoneId}\tAuthorizeDoorId={doorMask}\r\n";
            var rc = SetData(handle, "userauthorize", authRow);

            return Results.Ok(new
            {
                ok = true,
                authorized = true,
                pin,
                timezoneId,
                doorMask,
                rc
            });
        }

        stage = "delete-userauthorize";
        var deleteRc = DeleteData(handle, "userauthorize", $"Pin={pin}");

        return Results.Ok(new
        {
            ok = true,
            authorized = false,
            pin,
            rc = deleteRc
        });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[PullSDK] /api/users/access falló en {stage}: {ex.Message}");
        return Results.Json(new { ok = false, stage, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
        await Task.Delay(300);
        sdkGate.Release();
    }
});

app.MapPost("/api/users/validity", async (HttpRequest req, UserValidityRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    await sdkGate.WaitAsync();
    int handle = 0;
    var stage = "connect";
    try
    {
        handle = await ConnectAsync();
        try { Native.EnableDevice(handle, 0); } catch { }

        var pin = EscapeValue(body.pin);
        var cardNo = EscapeValue(body.cardNo);
        if (string.IsNullOrWhiteSpace(pin) || string.IsNullOrWhiteSpace(cardNo))
            throw new InvalidOperationException("Pin y CardNo son obligatorios para actualizar vigencia");

        var start = Date8(body.startDate);
        var end = Date8(body.endDate);

        // This C3 firmware is more reliable when SetDeviceData(user) receives
        // the same complete base row used during provisioning, instead of a
        // partial update containing only dates.
        var fields = new List<string>
        {
            $"Pin={pin}",
            $"CardNo={cardNo}",
            "Password=",
            "Group=1"
        };
        if (!string.IsNullOrWhiteSpace(start)) fields.Add($"StartTime={start}");
        if (!string.IsNullOrWhiteSpace(end)) fields.Add($"EndTime={end}");

        stage = "set-user-validity";
        var rc = SetData(handle, "user", string.Join("\t", fields) + "\r\n");
        return Results.Ok(new { ok = true, pin, cardNo, startDate = start, endDate = end, rc });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[PullSDK] /api/users/validity falló en {stage}: {ex.Message}");
        return Results.Json(new { ok = false, stage, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
        await Task.Delay(300);
        sdkGate.Release();
    }
});

app.Run();

record UserProvisionRequest(
    string cardNo,
    string pin,
    string? name,
    string? startDate,
    string? endDate,
    int doorMask = 3,
    int timezoneId = 1
);

record UserValidityRequest(
    string? pin,
    string? cardNo,
    string? startDate,
    string? endDate
);

record UserAccessRequest(
    string pin,
    bool authorized,
    int doorMask = 3,
    int timezoneId = 1
);

record DeleteUserRequest(
    string pin,
    string? cardNo
);

static class Native
{
    [DllImport("plcommpro.dll", EntryPoint = "PullLastError", CallingConvention = CallingConvention.StdCall)]
    public static extern int PullLastError();

    [DllImport("plcommpro.dll", EntryPoint = "Connect", CallingConvention = CallingConvention.StdCall)]
    public static extern int Connect(IntPtr connStr);

    [DllImport("plcommpro.dll", EntryPoint = "Disconnect", CallingConvention = CallingConvention.StdCall)]
    public static extern void Disconnect(int handle);

    [DllImport("plcommpro.dll", EntryPoint = "SetDeviceData", CallingConvention = CallingConvention.StdCall)]
    public static extern int SetDeviceData(int handle, IntPtr table, IntPtr data, IntPtr options);

    [DllImport("plcommpro.dll", EntryPoint = "DeleteDeviceData", CallingConvention = CallingConvention.StdCall)]
    public static extern int DeleteDeviceData(int handle, IntPtr table, IntPtr data, IntPtr options);

    [DllImport("plcommpro.dll", EntryPoint = "EnableDevice", CallingConvention = CallingConvention.StdCall)]
    public static extern int EnableDevice(int handle, int enable);

    public static IntPtr AllocZ(string value, out GCHandle handle)
    {
        var bytes = Encoding.Latin1.GetBytes((value ?? "") + "\0");
        handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        return handle.AddrOfPinnedObject();
    }
}
