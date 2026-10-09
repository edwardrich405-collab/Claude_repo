@echo off
rem Installs libraries when package.json changed, then starts Allison.
cd /d "%~dp0"
fc /b package.json node_modules\.package.json.stamp >nul 2>&1 || (call npm install && copy /y package.json node_modules\.package.json.stamp >nul)
call npm start
