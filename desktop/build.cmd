@echo off
rem ============================================================
rem LabelCrop Desktop bauen (Windows). Braucht nur ein JDK 17+,
rem kein Maven, kein Gradle. PDFBox wird einmalig als fertiges
rem "pdfbox-app"-Jar (enthält alle Abhängigkeiten) geladen.
rem Ergebnis: labelcrop-desktop.jar, Start mit run.cmd
rem ============================================================
setlocal
cd /d "%~dp0"
set PDFBOX_VERSION=3.0.8
set PDFBOX_JAR=lib\pdfbox-app-%PDFBOX_VERSION%.jar

if not exist lib mkdir lib
if not exist "%PDFBOX_JAR%" (
  echo Lade PDFBox %PDFBOX_VERSION% ...
  curl -L --fail -o "%PDFBOX_JAR%" https://repo1.maven.org/maven2/org/apache/pdfbox/pdfbox-app/%PDFBOX_VERSION%/pdfbox-app-%PDFBOX_VERSION%.jar || goto :error
)

if exist out rmdir /s /q out
mkdir out\classes
dir /s /b src\*.java > out\sources.txt
javac -encoding UTF-8 --release 17 -d out\classes -cp "%PDFBOX_JAR%" @out\sources.txt || goto :error

(
  echo Main-Class: de.tourelleworks.labelcrop.Main
  echo Class-Path: %PDFBOX_JAR:\=/%
) > out\MANIFEST.MF
jar --create --file labelcrop-desktop.jar --manifest out\MANIFEST.MF -C out\classes . || goto :error

echo Fertig: labelcrop-desktop.jar  (Start: run.cmd oder java -jar labelcrop-desktop.jar)
exit /b 0

:error
echo Build fehlgeschlagen.
exit /b 1
