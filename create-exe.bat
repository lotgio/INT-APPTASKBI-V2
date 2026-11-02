@echo off
REM Script per convertire start-app.ps1 in exe usando ps2exe
REM Questo script scarica ps2exe e converte lo script PowerShell

cd /d "%~dp0"

echo.
echo ============================================================
echo    Conversione PowerShell Script in EXE
echo ============================================================
echo.

REM Check if ps2exe exists
if exist "ps2exe.ps1" (
    echo ps2exe.ps1 gia' trovato
    goto :convert
)

REM Download ps2exe
echo Scaricamento ps2exe da GitHub...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/MScholtes/PS2EXE/releases/download/v1.0.11.0/ps2exe.ps1' -OutFile 'ps2exe.ps1'" >nul 2>&1

if not exist "ps2exe.ps1" (
    echo [91m ERRORE: Non riesco a scaricare ps2exe [0m
    echo Scarica manualmente da: https://github.com/MScholtes/PS2EXE/releases
    echo Posiziona ps2exe.ps1 in questa cartella e riprova.
    pause
    exit /b 1
)

echo [92m ps2exe.ps1 scaricato [0m
echo.

:convert
REM Convert PowerShell script to EXE
echo Conversione start-app.ps1 in start-app.exe...
echo Questo potrebbe richiedere qualche minuto...
echo.

powershell -ExecutionPolicy Bypass -Command "& {. .\ps2exe.ps1; Out-Exe -inputfile '.\start-app.ps1' -outputfile '.\start-app.exe' -icon 'start-app.ico' -noConsole -requireAdmin}"

if exist "start-app.exe" (
    echo.
    echo [92m ============================================================ [0m
    echo [92m         CONVERSIONE COMPLETATA! [0m
    echo [92m ============================================================ [0m
    echo.
    echo [92m File creato: start-app.exe [0m
    echo.
    echo Puoi ora usare start-app.exe per avviare l'app.
    echo.
) else (
    echo [91m ERRORE: Conversione fallita [0m
    pause
    exit /b 1
)

pause
