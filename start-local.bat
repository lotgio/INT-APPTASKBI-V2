@echo off
setlocal

REM Launch app on http://localhost:8000
cd /d "%~dp0"

REM Build frontend
call npm run build
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

REM Copy jobs.json to dist
copy /Y "public\jobs.json" "dist\jobs.json" >nul
if errorlevel 1 (
  echo Failed to copy jobs.json.
  exit /b 1
)

REM Start server using venv Python
".\.venv\Scripts\python.exe" server-api.py
