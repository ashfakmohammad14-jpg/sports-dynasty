@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title Cricket Live Analytics Dashboard
color 0A

echo ================================================================
echo           🏏 CRICKET LIVE ANALYTICS DASHBOARD
echo             Powered by ESPN Live Data APIs
echo ================================================================
echo.

cd /d "%~dp0"

:: ---------------------------------------------------------------
:: 1. DETECT PYTHON ENVIRONMENT
:: ---------------------------------------------------------------
echo [1/3] Checking Python installation...

set "PYTHON_EXE="

:: Search common Windows installation paths first
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "%ProgramFiles%\Python313\python.exe"
    "%ProgramFiles%\Python312\python.exe"
    "%ProgramFiles%\Python311\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
) do (
    if exist "%%~P" (
        set "PYTHON_EXE=%%~P"
        goto :PYTHON_FOUND
    )
)

:: Check 'py' launcher
py -0 >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=py"
    goto :PYTHON_FOUND
)

:: Check if 'python' in PATH actually executes
python -c "import sys" >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python"
    goto :PYTHON_FOUND
)

:PYTHON_NOT_FOUND
color 0C
echo.
echo [ERROR] Python was not found on your system!
echo Please install Python 3.9+ from https://www.python.org/downloads/
echo (Make sure to check "Add Python to PATH" during installation)
echo.
echo Opening Python download page in your browser...
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:PYTHON_FOUND
echo Python detected: %PYTHON_EXE%
%PYTHON_EXE% --version

:: ---------------------------------------------------------------
:: 2. AUTO-CHECK & INSTALL MISSING PACKAGES
:: ---------------------------------------------------------------
echo.
echo [2/3] Checking and auto-installing required dependencies...
%PYTHON_EXE% -m pip install -r requirements.txt --quiet --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [WARNING] Pip encountered an issue, but we will continue...
) else (
    echo [OK] All required libraries are ready.
)

:: ---------------------------------------------------------------
:: 3. LAUNCH SERVER & BROWSER
:: ---------------------------------------------------------------
echo.
echo [3/3] Starting Sports Dynasty Web Platform Server...
echo.
echo ================================================================
echo   🌐 Web Address : http://www.sportsdynasty.com:8000
echo   🏠 Local Backup: http://127.0.0.1:8000
echo ================================================================
echo.

:: Open default browser
start "" "http://127.0.0.1:8000"

:: Start the application
%PYTHON_EXE% app.py

pause
