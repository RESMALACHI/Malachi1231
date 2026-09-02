@echo off
:: Double-click to update this extension folder in place.
:: The real work is in update.ps1 beside this file.
:: Kept strictly ASCII: cmd reads a .bat byte-by-byte in the console codepage,
:: and non-ASCII characters here get mis-parsed as stray commands.
chcp 65001 >nul
title R.E.S - update
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
pause
