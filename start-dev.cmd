@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto directory_error

where node >nul 2>&1
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_missing

if exist "node_modules\vite\package.json" goto start_dev

echo Installing project dependencies...
call npm.cmd ci
set "run_status=%errorlevel%"
if not "%run_status%"=="0" goto install_error

:start_dev
echo Starting development server at http://127.0.0.1:5173
echo Open this address in your browser.
echo Keep this window open. Press Ctrl+C to stop.
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
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

:npm_missing
echo ERROR: npm.cmd was not found.
echo Reinstall Node.js 24 with npm from https://nodejs.org/.
pause
exit /b 1

:install_error
echo ERROR: Dependency installation exited with code %run_status%.
echo Check your network connection and the message above.
pause
exit /b %run_status%

:start_error
echo ERROR: Development server exited with code %run_status%.
echo Check the message above. Port 5173 may already be in use.
pause
exit /b %run_status%
