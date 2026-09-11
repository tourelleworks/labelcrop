@echo off
rem Startet LabelCrop Desktop (Oberfläche). Vorher einmal build.cmd ausführen.
cd /d "%~dp0"
if not exist labelcrop-desktop.jar call build.cmd || exit /b 1
start "LabelCrop" javaw -jar labelcrop-desktop.jar
