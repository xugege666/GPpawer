@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto directory_error

where node >nul 2>&1
if errorlevel 1 goto node_missing

if not exist "dist\index.html" goto build_missing

echo Starting Alpha Lab at http://127.0.0.1:5173
echo Keep this window open. Press Ctrl+C to stop.
node scripts\serve-local.mjs --open --port 5173
set "run_status=%errorlevel%"
if not "%run_status%"=="0" goto start_error
exit /b 0

:directory_error
echo ERROR: Could not open the project directory.
pause
exit /b 1

:node_missing
echo ERROR: Node.js was not found.
echo Install Node.js 24 from https://nodejs.org/ and reopen this script.
pause
exit /b 1

:build_missing
echo ERROR: dist\index.html was not found.
echo For development, run start-dev.cmd.
echo To build the local version, run: npm ci ^&^& npm run build
pause
exit /b 1

:start_error
echo ERROR: Local server exited with code %run_status%.
echo Check the message above. Port 5173 may already be in use.
pause
exit /b %run_status%
