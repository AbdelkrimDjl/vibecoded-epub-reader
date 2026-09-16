param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $projectRoot "scripts\local-epub-server.mjs"
$resolvedFile = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).Path

if (-not (Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  Start-Process -WindowStyle Hidden -FilePath $node -ArgumentList @($serverScript) -WorkingDirectory $projectRoot
  Start-Sleep -Milliseconds 1200
}

$encodedPath = [Uri]::EscapeDataString($resolvedFile)
Start-Process "http://127.0.0.1:3000/?file=$encodedPath"
