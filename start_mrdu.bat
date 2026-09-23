@echo off
setlocal EnableDelayedExpansion
title MRDU College Chatbot - One-Click Startup
color 0A

set "PROJECT=C:\Users\HP\OneDrive\Desktop\Chatbot_for_College-main"
set "NODE_READY=NO"
set "KOKORO_READY=NO"

echo.
echo ==============================================================
echo   MRDU College Chatbot - One-Click Startup
echo   Node/Express chatbot.. http://localhost:3000
echo   Kokoro WSL TTS......... http://127.0.0.1:5001
echo ==============================================================
echo.

REM ------------------------------------------------------------
REM 1) Check port 3000 -> start Node/Express ONLY if NOT listening.
REM ------------------------------------------------------------
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [START]  Node/Express is NOT running on port 3000 - starting npm run dev ...
    start "MRDU Node/Express" cmd /k "cd /d ""%PROJECT%"" && npm run dev"
) else (
    echo [OK]     Node/Express already listening on localhost:3000 - skipping.
    set "NODE_READY=YES"
)

REM ------------------------------------------------------------
REM 2) Check port 5001 -> start Kokoro in WSL ONLY if NOT listening.
REM ------------------------------------------------------------
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [START]  Kokoro WSL is NOT running on port 5001 - starting WSL server ...
    start "MRDU Kokoro WSL" wsl.exe bash -lc "cd /mnt/c/Users/HP/OneDrive/Desktop/Chatbot_for_College-main && source .kokoro-venv-linux/bin/activate && python kokoro_server.py; echo; echo Kokoro server stopped - window kept open; exec bash"
) else (
    echo [OK]     Kokoro WSL already listening on 127.0.0.1:5001 - skipping.
    set "KOKORO_READY=YES"
)

REM ------------------------------------------------------------
REM 3) Poll BOTH ports until ready - max 120s - check every 2s.
REM ------------------------------------------------------------
echo.
echo [WAIT]   Waiting for both services to become ready ...
set /a wait_secs=0

:WAIT_LOOP
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (set "NODE_READY=NO") else (set "NODE_READY=YES")
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (set "KOKORO_READY=NO") else (set "KOKORO_READY=YES")

if "!NODE_READY!"=="YES" (
    if "!KOKORO_READY!"=="YES" (
        echo [READY]  Both services are up and ready.
        echo [READY]  Opening http://localhost:3000 ...
        start "" "http://localhost:3000"
        goto :STOP_INFO
    )
)

if !wait_secs! geq 120 goto :STARTUP_TIMEOUT

echo [WAIT]   Not ready yet - elapsed !wait_secs!s - checking again in 2 seconds ...
ping -n 3 127.0.0.1 >nul
set /a wait_secs+=2
goto :WAIT_LOOP

:STARTUP_TIMEOUT
echo.
echo [ERROR]  Startup timed out after 120 seconds - browser was NOT opened.
if "!NODE_READY!"=="NO" (
    echo [ERROR]  Node/Express did NOT become ready on port 3000.
)
if "!KOKORO_READY!"=="NO" (
    echo [ERROR]  Kokoro WSL did NOT become ready on port 5001.
)
echo [ERROR]  Server terminal windows are kept open - review the output above.
goto :STOP_INFO

:STOP_INFO
echo.
echo ==============================================================
echo  HOW TO STOP BOTH SERVICES
echo  - Node window:   press Ctrl+C in the Node window.
echo  - Kokoro window: press Ctrl+C in the Kokoro window.
echo ==============================================================
echo.
pause
exit /b
