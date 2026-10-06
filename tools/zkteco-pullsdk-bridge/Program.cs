using System.Runtime.InteropServices;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

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
    var pwd = CommPassword();
    if (!string.IsNullOrWhiteSpace(pwd)) sb.Append(",password=").Append(pwd);
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

int Connect()
{
    var conn = Native.AllocZ(ConnString(), out var pin);
    try
    {
        var handle = Native.Connect(conn);
        if (handle <= 0)
        {
            var err = Native.PullLastError();
            throw new InvalidOperationException($"PullSDK Connect falló: handle={handle}, lastError={err}");
        }
        return handle;
    }
    finally
    {
        if (pin.IsAllocated) pin.Free();
    }
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

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "zkteco-pullsdk-bridge" }));

app.MapPost("/api/users", (HttpRequest req, UserProvisionRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    int handle = 0;
    try
    {
        handle = Connect();
        try { Native.EnableDevice(handle, 0); } catch { }

        var start = Date8(body.startDate);
        var end = Date8(body.endDate);
        var fields = new List<string>
        {
            $"Pin={EscapeValue(body.pin)}",
            $"CardNo={EscapeValue(body.cardNo)}",
            $"Name={EscapeValue(body.name)}",
            "Group=1"
        };
        if (!string.IsNullOrWhiteSpace(start)) fields.Add($"StartTime={start}");
        if (!string.IsNullOrWhiteSpace(end)) fields.Add($"EndTime={end}");

        var userRow = string.Join("\t", fields) + "\r\n";
        SetData(handle, "user", userRow);

        var authRow =
            $"Pin={EscapeValue(body.pin)}\tAuthorizeTimezoneId={Math.Max(1, body.timezoneId)}\tAuthorizeDoorId={Math.Max(1, body.doorMask)}\r\n";
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
        return Results.Json(new { ok = false, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
    }
});

app.MapPost("/api/users/validity", (HttpRequest req, UserValidityRequest body) =>
{
    if (!Authorized(req)) return Results.Unauthorized();
    int handle = 0;
    try
    {
        handle = Connect();
        try { Native.EnableDevice(handle, 0); } catch { }

        var start = Date8(body.startDate);
        var end = Date8(body.endDate);
        var fields = new List<string>();
        if (!string.IsNullOrWhiteSpace(body.pin)) fields.Add($"Pin={EscapeValue(body.pin)}");
        if (!string.IsNullOrWhiteSpace(body.cardNo)) fields.Add($"CardNo={EscapeValue(body.cardNo)}");
        if (!string.IsNullOrWhiteSpace(start)) fields.Add($"StartTime={start}");
        if (!string.IsNullOrWhiteSpace(end)) fields.Add($"EndTime={end}");
        if (fields.Count < 2) throw new InvalidOperationException("Datos insuficientes para actualizar vigencia");

        SetData(handle, "user", string.Join("\t", fields) + "\r\n");
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Json(new { ok = false, error = ex.Message }, statusCode: 502);
    }
    finally
    {
        if (handle > 0)
        {
            try { Native.EnableDevice(handle, 1); } catch { }
            try { Native.Disconnect(handle); } catch { }
        }
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

    [DllImport("plcommpro.dll", EntryPoint = "EnableDevice", CallingConvention = CallingConvention.StdCall)]
    public static extern int EnableDevice(int handle, int enable);

    public static IntPtr AllocZ(string value, out GCHandle handle)
    {
        var bytes = Encoding.Latin1.GetBytes((value ?? "") + "\0");
        handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        return handle.AddrOfPinnedObject();
    }
}
