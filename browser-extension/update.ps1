# Updates this extension folder in place, so nobody has to find the download,
# unzip it, and copy files over the old ones.
#
# Chrome does not hold locks on an unpacked extension's files, so overwriting
# while the browser is open is safe — the new code is picked up on the next
# reload of the extension.
#
# Launched by update.bat, which sits beside it. $PSScriptRoot is this folder,
# which is exactly the folder that needs updating.
#
# This file must be saved with a UTF-8 BOM: Windows PowerShell 5.1 reads a
# BOM-less .ps1 as the system ANSI codepage and the Hebrew below turns to
# nonsense. scripts/build-extension.mjs asserts the BOM is present.

$ErrorActionPreference = 'Stop'

$dir = $PSScriptRoot
$zip = Join-Path $env:TEMP 'RES-BMBY.zip'
$tmp = Join-Path $env:TEMP ('res-ext-' + [guid]::NewGuid())

function Say($text, $colour) { Write-Host "  $text" -ForegroundColor $colour }

try {
    $before = '?'
    $manifest = Join-Path $dir 'manifest.json'
    if (Test-Path $manifest) {
        $before = (Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
    }

    Write-Host ''
    Say 'מוריד את הגרסה האחרונה...' Cyan

    Invoke-WebRequest -Uri 'https://res-meetings.vercel.app/ext/RES-BMBY.zip' `
                      -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $after = (Get-Content (Join-Path $tmp 'manifest.json') -Raw -Encoding UTF8 |
              ConvertFrom-Json).version

    # Everything except this script pair, which is running right now. Windows
    # tolerates replacing a running .ps1, but there is no reason to risk it —
    # and the launcher never changes anyway.
    Get-ChildItem $tmp -Force |
        Where-Object { $_.Name -notin @('update.ps1', 'update.bat') } |
        ForEach-Object { Copy-Item $_.FullName $dir -Recurse -Force }

    # Windows brands anything that came from a browser download as untrusted
    # ("mark of the web"), and Smart App Control then refuses to run it — which
    # is exactly how this folder gets blocked in the first place. Files written
    # here came through Invoke-WebRequest and carry no such mark, but a folder
    # that someone once unzipped by hand still might, so the mark is stripped
    # from the whole folder. One manual unblock, then never again.
    Get-ChildItem $dir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

    Write-Host ''
    if ($before -eq $after) {
        Say "כבר הייתם על הגרסה האחרונה ($after)" Green
    } else {
        Say "עודכן: $before  ->  $after" Green
    }
    Write-Host ''
    Say 'נשאר רק לרענן:' Yellow
    Say '1. פתחו chrome://extensions' Gray
    Say '2. לחצו על כפתור הרענון בכרטיס של R.E.S' Gray
    Write-Host ''
}
catch {
    Write-Host ''
    Say "העדכון נכשל: $($_.Exception.Message)" Red
    Say 'בדקו חיבור לאינטרנט ונסו שוב.' Gray
    Write-Host ''
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
}
