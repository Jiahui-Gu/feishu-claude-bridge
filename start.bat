@echo off
title Feishu Claude Code Bridge
echo ====================================
echo   Feishu Claude Code Bridge
echo ====================================
echo.

cd /d "%~dp0"

echo Starting bridge service...
echo Press Ctrl+C to stop.
echo.

node src\index.js

echo.
echo Bridge stopped.
pause
