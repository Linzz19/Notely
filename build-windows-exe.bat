@echo off
setlocal
title Building Notely Windows Application (.exe)

echo ==================================================
echo   Notely - Windows Desktop (.exe) Builder
echo ==================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js LTS from https://nodejs.org/ and re-run this script.
  pause
  exit /b 1
)

echo [1/3] Installing dependencies (including Electron)...
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Building Notely UI bundle...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Packaging standalone Windows .exe files...
call npx electron-builder --win --config electron-builder.yml
if %errorlevel% neq 0 (
  echo [ERROR] Packaging Windows .exe failed.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo   SUCCESS! Your Windows .exe files are ready in:
echo   %~dp0release\
echo   - Notely-1.0.0-Portable.exe (No install needed)
echo   - Notely-Setup-1.0.0.exe (Windows Installer)
echo ==================================================
echo.
explorer "%~dp0release"
pause
