@echo off
title Le Thermometre - Serveur local
cd /d "%~dp0"

echo.
echo  ====================================
echo    LE THERMOMETRE - Lancement...
echo  ====================================
echo.

:: Verifier si node est installe
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe !
    echo Telechargez-le sur https://nodejs.org
    pause
    exit /b 1
)

:: Verifier si les dependances sont installees
if not exist "node_modules" (
    echo [INFO] Installation des dependances npm...
    npm install
    echo.
)

:: Tuer tout process qui utilise le port 3000
echo [INFO] Liberation du port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo [INFO] Arret du process %%a sur le port 3000...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 >nul

echo [INFO] Serveur sur http://localhost:3000
echo [INFO] Appuie sur CTRL+C pour arreter
echo.

:: Ouvrir le navigateur apres 2 secondes
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

:: Lancer le serveur
node server.js

pause
