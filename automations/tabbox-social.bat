@echo off
title TabBox Social Automation & Radar
color 0B
cd /d "%~dp0"

echo ================================================================
echo    TABBOX SOCIAL MEDIA MARKETING & RADAR ENGINE
echo ================================================================
echo.

node scheduler.js

echo.
echo Press any key to exit this window (scheduler will repeat on next cycle).
pause >nul
