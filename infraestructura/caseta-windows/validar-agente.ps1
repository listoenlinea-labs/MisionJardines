# Validacion de sintaxis sin ejecutar el agente, sin red ni equipos.
param([string]$Path = (Join-Path $PSScriptRoot 'agente.ps1'))
$tokens = $null
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_.Message }
    exit 1
}
Write-Host 'Sintaxis PowerShell correcta.'
exit 0
