# SEO ACE - instalacia lokalneho MCP servera (Windows)
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfDir = Join-Path $env:USERPROFILE '.seo-ace'

Write-Host 'SEO ACE - instalacia lokalneho MCP servera' -ForegroundColor Cyan
Write-Host '=========================================='

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error 'Node.js nie je nainstalovany. Nainstaluj Node 20+ z https://nodejs.org'
  exit 1
}
$major = [int](& node -p 'process.versions.node.split(".")[0]')
if ($major -lt 20) { Write-Error "Node $major je prilis stary, treba 20+."; exit 1 }
Write-Host "  Node $(& node -v) OK"

if (-not (Test-Path $ConfDir)) { New-Item -ItemType Directory -Path $ConfDir | Out-Null }

$clientPath = Join-Path $ConfDir 'gsc-client.json'
if (-not (Test-Path $clientPath)) {
  @'
{
  "_comment": "Vyplnte client_id a client_secret z Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID -> Desktop app. V projekte zapnite 'Google Search Console API'.",
  "client_id": "",
  "client_secret": ""
}
'@ | Set-Content -Path $clientPath -Encoding UTF8
  Write-Host "  Vytvoreny $clientPath - treba doplnit OAuth udaje"
} else {
  Write-Host "  $clientPath uz existuje"
}

Write-Host ''
Write-Host 'Selftest servera:'
& node (Join-Path $Here 'selftest.mjs')

Write-Host ''
Write-Host 'Registracia v Claude Code:'
$claude = Get-Command claude -ErrorAction SilentlyContinue
$indexPath = (Join-Path $Here 'index.mjs')
if ($claude) {
  try {
    & claude mcp add seo-ace -- node $indexPath
    Write-Host "  Zaregistrovane ako 'seo-ace'."
  } catch {
    Write-Host '  Uz zaregistrovane alebo pridaj rucne (nizsie).'
  }
} else {
  Write-Host '  Claude Code CLI sa nenaslo. Pridaj rucne do %USERPROFILE%\.claude.json:'
}
$jsonPath = $indexPath -replace '\\', '\\'
Write-Host @"

  "mcpServers": {
    "seo-ace": {
      "command": "node",
      "args": ["$jsonPath"]
    }
  }
"@

Write-Host ''
Write-Host "Dalsi krok: doplnte OAuth udaje do $clientPath,"
Write-Host 'potom v Claude Code spustite nastroj gsc_login.'
