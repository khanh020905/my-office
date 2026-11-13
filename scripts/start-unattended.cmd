@echo off
setlocal
cd /d "D:\somehting code\my-office"

:: Ensure logs directory exists
if not exist "data\trial-monitor" mkdir "data\trial-monitor"

:: Verify node is available
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [%date% %time%] [ERROR] Node.js executable not found in PATH. >> "data\trial-monitor\server-startup.log"
  exit /b 1
)

:: Check if port 4310 is already in use (prevent duplicate instance)
netstat -ano | findstr /R /C:":4310 " >nul 2>&1
if %errorlevel% equ 0 (
  echo [%date% %time%] [INFO] Port 4310 is already in use. My Office is already running. Skipping startup. >> "data\trial-monitor\server-startup.log"
  exit /b 0
)

echo ====================================================================== >> "data\trial-monitor\server-startup.log"
echo [%date% %time%] [STARTUP] Starting My Office unattended server session >> "data\trial-monitor\server-startup.log"
echo [%date% %time%] [INFO] Working directory: %cd% >> "data\trial-monitor\server-startup.log"

:: Start My Office server
node server\index.mjs >> "data\trial-monitor\server-startup.log" 2>&1
