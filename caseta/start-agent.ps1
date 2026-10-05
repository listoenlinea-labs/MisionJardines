param([Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
foreach ($property in $config.PSObject.Properties) {
    if ($property.Name -like 'CASETA_*') {
        [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
    }
}
Set-Location $PSScriptRoot
& $PythonPath -u (Join-Path $PSScriptRoot 'agent.py')
exit $LASTEXITCODE
