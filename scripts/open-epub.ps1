param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $projectRoot "scripts\local-epub-server.mjs"
$resolvedFile = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).Path

if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  Start-Process -WindowStyle Hidden -FilePath $node -ArgumentList @((('"{0}"' -f $serverScript))) -WorkingDirectory $projectRoot
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 150
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { break }
  }
}

$encodedPath = [Uri]::EscapeDataString($resolvedFile)
Start-Process "http://127.0.0.1:3000/?file=$encodedPath"
