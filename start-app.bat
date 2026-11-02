@echo off
REM Script per avviare automaticamente l'app AppTask
REM Salva come start-app.bat e esegui direttamente

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Colori (solo per Windows 10+)
for /F %%A in ('echo prompt $H ^| cmd') do set "BS=%%A"

echo.
echo ============================================================
echo    ^[1;36m APP TASK - Avvio Automatico ^[0m
echo ============================================================
echo.

REM Check Node.js
echo Verifico Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [91m ERRORE: Node.js non trovato. Installa da https://nodejs.org/ [0m
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [92m ok - %NODE_VERSION% trovato [0m
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo ============================================================
    echo    Installazione dipendenze NPM...
    echo ============================================================
    call npm install
    if errorlevel 1 (
        echo [91m ERRORE: Installazione fallita [0m
        pause
        exit /b 1
    )
    echo [92m Dipendenze installate [0m
    echo.
)

REM Sincronizza commesse da Azure
echo ============================================================
echo    Sincronizzazione commesse da Azure...
echo ============================================================

if exist ".\.venv\Scripts\python.exe" (
    ".\.venv\Scripts\python.exe" sync-jobs.py
) else (
    python sync-jobs.py
)
echo.

REM Build frontend
echo ============================================================
echo    Build del frontend...
echo ============================================================
call npm run build
if errorlevel 1 (
    echo [91m ERRORE: Build fallita [0m
    pause
    exit /b 1
)
echo [92m Build completata [0m
echo.

REM Copy jobs.json
if exist "public\jobs.json" (
    copy /Y "public\jobs.json" "dist\jobs.json" >nul
    echo [92m jobs.json copiato [0m
)
echo.

REM Start server
echo ============================================================
echo    Avvio server...
echo ============================================================

REM Check if Python venv exists
if exist ".\.venv\Scripts\python.exe" (
    echo Avvio con server-api.py ^(Python^)...
    start "" ".\.venv\Scripts\python.exe" server-api.py
) else (
    echo Avvio con server.ts ^(Node.js^)...
    start "" node dist\server\server.js
)

echo [92m Server avviato [0m
echo.

REM Wait e open browser
echo Attesa che il server sia pronto...
timeout /t 3 /nobreak >nul

echo [92m Apertura browser... [0m
start http://localhost:8000
echo.

echo ============================================================
echo    ^[92m App AppTask in esecuzione ^[0m
echo ============================================================
echo.
echo URL: http://localhost:8000
echo.
echo Per fermare: Chiudi questa finestra o premi Ctrl+C nel server
echo.
pause
