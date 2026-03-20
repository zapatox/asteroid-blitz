@echo off
title Asteroid Blitz Server
taskkill /F /IM bun.exe >nul 2>&1
echo Starting Asteroid Blitz...
cd /d "%~dp0"
bun run server/index.js
pause
