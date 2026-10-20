@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python install.py %*
  goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 install.py %*
  goto :end
)
echo Python 3 was not found.
echo Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then run this file again.
:end
echo.
pause
