# LabelCrop Desktop

Druckt Versandetiketten **direkt an den Etikettendrucker – ohne Druckdialog**.
Dieselbe Logik wie die Browser-Version (gleiche Profile, gleiche Geometrie),
aber mit Java und PDFBox, weil der Browser weder Drucker noch Papierformat
vorgeben kann (Konzept, Abschnitt 6).

## Voraussetzungen

- Java 17 oder neuer ([Adoptium](https://adoptium.net/), „JDK“ zum Bauen, „JRE“ reicht zum Ausführen)
- Einmalig Internet zum Laden von PDFBox (13 MB, landet in `lib/`)

## Bauen und starten

```
build.cmd          (Windows)   bzw.   ./build.sh   (Git Bash, Linux, macOS)
run.cmd            startet die Oberfläche
```

Ergebnis ist `labelcrop-desktop.jar`. Weitergeben: die Jar-Datei zusammen mit
dem Ordner `lib/` kopieren, auf dem Zielrechner `java -jar labelcrop-desktop.jar`.

## Oberfläche

1. **Etiketten:** A4-PDFs in die Liste ziehen oder „Dateien hinzufügen“.
2. **Drucker-Profil:** Drucker, Etikettenformat, Drehung, Größe, Lage, Rand.
   Wird nach jedem Drucken gespeichert (`~/.labelcrop/printer.properties`).
3. **Drucken** – fertig. „Als PDF speichern“ legt `…_label.pdf` neben jede Quelle.

Beim ersten Drucker zuerst **Testdruck**: Rahmen, Pfeil und 50-mm-Linie zeigen,
ob Papierformat, Skalierung und Drehung stimmen (siehe unten).

## Kommandozeile

```
java -jar labelcrop-desktop.jar printers
java -jar labelcrop-desktop.jar print  label.pdf --printer "Label Printer"
java -jar labelcrop-desktop.jar crop   label.pdf --format 62x --rotate 90
java -jar labelcrop-desktop.jar test   --printer "Label Printer" --format 100x150
java -jar labelcrop-desktop.jar test-pdf testdruck.pdf
```

Optionen: `--printer "Name"`, `--format 100x150 | 62x (Endlos) | source | thermo-100x150`,
`--rotate 0|90|180|270|auto`, `--scale fit|none`, `--place center|top`, `--margin 2`,
`--profile post-internetmarke-ebay | post-internetmarke-ebay-marks | auto`,
`--to-file ausgabe.pdf` (Druckausgabe in eine Datei, z. B. mit „Microsoft Print to PDF“).
Ohne Optionen gilt das gespeicherte Profil; Optionen auf der Kommandozeile werden nicht gespeichert.

## Drucker einrichten (einmalig)

1. Im Windows-Druckertreiber ein Papierformat anlegen oder wählen, das **genau** dem
   Etikett entspricht (z. B. 100 × 150 mm). Skalierung im Treiber auf 100 %.
2. In LabelCrop dasselbe Format wählen, „Testdruck“ drücken.
3. Testdruck lesen:
   - Rahmen abgeschnitten → Papierformat im Treiber stimmt nicht.
   - Linie nicht 50 mm → Treiber skaliert; auf „Tatsächliche Größe“ stellen.
   - Pfeil zeigt nicht zum Etikettenanfang → Drehung im Profil ändern (0/90/180/270).
4. Danach läuft es – die Werte bleiben gespeichert.

## Wenn der Direktdruck mit dem Treiber zickt

Rückfall aus dem Konzept: [SumatraPDF](https://www.sumatrapdfreader.org/) (portable, ohne Installation)
druckt die von LabelCrop erzeugte `…_label.pdf` ohne Skalierung:

```
SumatraPDF.exe -print-to "Label Printer" -print-settings "noscale" label_label.pdf
```

## Aufbau

| Datei | Zweck |
|---|---|
| `LabelProfile.java` | Label-Profile (Quelle), dieselben Werte wie `profiles.js` |
| `PaperFormat.java`, `PrinterProfile.java` | Drucker-Profil (Ziel) mit Speichern/Laden |
| `Geometry.java` | Quellbereich, Maßstab, Drehung, Lage, Matrix – Spiegel von `cropper.js` |
| `Cropper.java` | Zuschnitt mit PDFBox (`LayerUtility.importPageAsForm`, BBox, Matrix) |
| `TestPrint.java` | Kalibrier-Etikett |
| `Printing.java` | Direktdruck über `java.awt.print` und `PDFPageable` (Hochformat, 100 %) |
| `Main.java`, `App.java` | Kommandozeile und Swing-Oberfläche |
