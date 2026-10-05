param(
    [Parameter(Mandatory = $true)]
    [string]$Uri
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show(
            $Message,
            'Misión Jardines · Llamada WhatsApp',
            'OK',
            'Warning'
        ) | Out-Null
    } catch {}
    exit 1
}

if ($Uri -notmatch '^misionjardines-call://') {
    Fail 'Solicitud de llamada no válida.'
}

$match = [regex]::Match($Uri, '(?:\?|&)phone=([^&]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if (-not $match.Success) {
    Fail 'No se recibió un número de teléfono.'
}

$rawPhone = [System.Uri]::UnescapeDataString($match.Groups[1].Value)
$digits = ($rawPhone -replace '\D', '')

if ($digits.Length -eq 13 -and $digits.StartsWith('521')) {
    $digits = '52' + $digits.Substring(3)
}
if ($digits.Length -eq 10) {
    $digits = '52' + $digits
}

if ($digits -notmatch '^52\d{10}$') {
    Fail 'El número no tiene un formato válido de México.'
}

$whatsAppUri = "whatsapp://send?phone=$digits"

try {
    Start-Process $whatsAppUri | Out-Null
} catch {
    Fail 'No se pudo abrir WhatsApp para Windows. Verifica que esté instalado.'
}

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
} catch {
    Fail 'Windows no pudo cargar la automatización de interfaz necesaria.'
}

$allowedNames = @(
    'Llamada de voz',
    'Llamar',
    'Iniciar llamada',
    'Llamada',
    'Voice call',
    'Voice Call',
    'Audio call',
    'Audio Call',
    'Start call',
    'Call'
)

$deadline = (Get-Date).AddSeconds(15)
$invoked = $false

while ((Get-Date) -lt $deadline -and -not $invoked) {
    Start-Sleep -Milliseconds 450

    $processes = Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.MainWindowHandle -ne 0 -and
            ($_.ProcessName -like 'WhatsApp*')
        }

    foreach ($process in $processes) {
        try {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            if ($null -eq $root) { continue }

            $buttons = $root.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.PropertyCondition]::new(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Button
                )
            )

            foreach ($button in $buttons) {
                $name = [string]$button.Current.Name
                if ([string]::IsNullOrWhiteSpace($name)) { continue }

                $isAllowed = $false
                foreach ($allowed in $allowedNames) {
                    if ($name.Trim().Equals($allowed, [System.StringComparison]::OrdinalIgnoreCase)) {
                        $isAllowed = $true
                        break
                    }
                }

                if (-not $isAllowed) { continue }

                $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                if ($null -ne $pattern) {
                    $pattern.Invoke()
                    $invoked = $true
                    break
                }
            }
        } catch {}

        if ($invoked) { break }
    }
}

if (-not $invoked) {
    Fail 'WhatsApp abrió el chat, pero Windows no encontró el botón de llamada. Deja WhatsApp actualizado, abierto y con el chat cargado, y vuelve a intentar.'
}

exit 0
