@echo off
echo ===================================================
echo     Electro Hub - Quick Installer Fix
echo ===================================================
echo.

echo 1. Closing any background processes...
taskkill /F /IM "app.exe" /T >nul 2>&1
taskkill /F /IM "Electro Hub.exe" /T >nul 2>&1
taskkill /F /IM "uninstall.exe" /T >nul 2>&1
taskkill /F /IM "Au_.exe" /T >nul 2>&1

echo 2. Removing old application files...
rmdir /s /q "%LOCALAPPDATA%\Electro Hub" >nul 2>&1

echo 3. Cleaning registry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Electro Hub" /f >nul 2>&1

echo.
echo ===================================================
echo   SUCCESS! Old files cleaned up.
echo   Your business database is 100% safe.
echo   You can now run Electro Hub Setup installer!
echo ===================================================
echo.
pause
