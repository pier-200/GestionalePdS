@echo off
cd /d %~dp0
start "Gestionale PdS server" /min cmd /c npm run dev -- --open
