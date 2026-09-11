#!/usr/bin/env bash
# LabelCrop Desktop bauen (Git Bash, Linux, macOS). Braucht nur ein JDK 17+.
# PDFBox wird einmalig als fertiges "pdfbox-app"-Jar geladen (enthält alle Abhängigkeiten).
set -euo pipefail
cd "$(dirname "$0")"
PDFBOX_VERSION=3.0.8
PDFBOX_JAR="lib/pdfbox-app-${PDFBOX_VERSION}.jar"

mkdir -p lib
if [ ! -f "$PDFBOX_JAR" ]; then
  echo "Lade PDFBox ${PDFBOX_VERSION} ..."
  curl -L --fail -o "$PDFBOX_JAR" "https://repo1.maven.org/maven2/org/apache/pdfbox/pdfbox-app/${PDFBOX_VERSION}/pdfbox-app-${PDFBOX_VERSION}.jar"
fi

rm -rf out
mkdir -p out/classes
find src -name '*.java' > out/sources.txt
javac -encoding UTF-8 --release 17 -d out/classes -cp "$PDFBOX_JAR" @out/sources.txt

printf 'Main-Class: de.tourelleworks.labelcrop.Main\nClass-Path: %s\n' "$PDFBOX_JAR" > out/MANIFEST.MF
jar --create --file labelcrop-desktop.jar --manifest out/MANIFEST.MF -C out/classes .

echo "Fertig: labelcrop-desktop.jar  (Start: java -jar labelcrop-desktop.jar)"
