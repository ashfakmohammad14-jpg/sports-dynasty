@echo off
title Sports Dynasty Domain Setup
color 0A

:: Self-Elevate to Administrator
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting Administrator permission to link domain...
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0""", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    if exist "%temp%\getadmin.vbs" del "%temp%\getadmin.vbs"
    exit /B
)

pushd "%CD%"
cd /d "%~dp0"

echo ================================================================
echo       LINKING WWW.SPORTSDYNASTY.COM TO LOCAL PLATFORM
echo ================================================================
echo.

set "HOSTS_FILE=%WINDIR%\System32\drivers\etc\hosts"

findstr /i "sportsdynasty.com" "%HOSTS_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] www.sportsdynasty.com is already configured!
) else (
    echo 127.0.0.1 www.sportsdynasty.com sportsdynasty.com >> "%HOSTS_FILE%"
    echo [SUCCESS] Successfully linked 127.0.0.1 to www.sportsdynasty.com!
)

ipconfig /flushdns >nul 2>&1

echo.
echo ================================================================
echo   SUCCESS! Domain is now active!
echo   Open in browser: http://www.sportsdynasty.com:8000
echo ================================================================
echo.
pause
