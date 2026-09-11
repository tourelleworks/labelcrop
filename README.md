# LabelCrop ✂️

Schneidet Versandetiketten aus A4-PDFs aus und liefert eine druckfertige
Label-PDF – im Browser, ohne Upload, ohne Installation.

**Live:** https://labelcrop.tourelleworks.de

## Das Problem

Versandetiketten (z. B. eBay-Label mit Internetmarke der Deutschen Post) kommen
als A4-PDF, auf der das eigentliche Label nur einen kleinen Bereich links oben
belegt. Für den Etikettendrucker ist das unbrauchbar: Papierverschwendung,
falscher Maßstab, Zuschneiden per Hand.

Ein CropBox-Trick (nur den sichtbaren Bereich im Viewer verkleinern) hilft nicht:
Druckertreiber ignorieren die CropBox gern und drucken doch die ganze A4-Seite.

## Die Lösung

LabelCrop legt eine **neue Seite in Etikettengröße** an und zeichnet den
Label-Bereich der Quellseite als Form-XObject hinein. Das Ergebnis hat eine
echte MediaBox in Labelgröße; Text und Data-Matrix-Code bleiben vektoriell.

## Funktionen

- **Drag & Drop** oder Dateiauswahl, mehrere PDFs gleichzeitig
- **Label-Typ** erkennen (derzeit: Deutsche Post Internetmarke über eBay) oder
  Bereich von Hand angeben
- **Drucker-Profil:** Etikettenformat (100 × 150 mm Thermodrucker, Brother,
  DYMO, A6, Endlosrolle, eigene Größe), Drehung 0/90/180/270° oder automatisch,
  Einpassen oder 100 %, Lage zentriert oder oben bündig, Rand – wird gemerkt
- **Testdruck** zum Kalibrieren: Rahmen, Pfeil zum Seitenanfang, 50-mm-Linien
- **Vorschau** des Ausschnitts im Original und des Ergebnisses
- **Drucken** über den Browser-Druckdialog – das Papierformat ist dabei schon
  die Etikettengröße (jede Seite wird mit 600 dpi gerastert und als HTML-Seite
  mit `@page`-Größe gedruckt); oder **speichern**, einzeln oder alle Labels
  in einer PDF. Ohne Dialog: Chrome mit `--kiosk-printing` starten
- **Direktdruck ohne Dialog:** [LabelCrop Desktop](desktop/README.md) (Java +
  PDFBox) druckt direkt an den eingestellten Etikettendrucker
- **PWA**: installierbar als Desktop-App, offline nutzbar, öffnet PDFs per
  „Öffnen mit“ (Chrome/Edge)
- **Datenschutz**: alles läuft lokal im Browser, nichts verlässt das Gerät

## Projektstruktur

Die App liegt im Wurzelverzeichnis, damit GitHub Pages sie direkt unter der
eigenen Domain ausliefert.

```
.
├── index.html          # Grundgerüst, Formular, Ergebnis-Vorlage
├── style.css           # Styling (Look wie tourelleworks.de)
├── app.js              # Oberfläche: Dateien, Einstellungen, Vorschau, Download, PWA
├── cropper.js          # Kern: Geometrie + Zuschneiden mit pdf-lib (DOM-frei, in Node testbar)
├── profiles.js         # Daten: Label-Profile (Koordinaten) und Zielformate
├── vendor/             # pdf-lib und pdf.js als Kopie (kein CDN), siehe vendor/README.md
├── icons/              # App-Icons, Favicon
├── manifest.json       # PWA-Manifest inkl. file_handlers für PDFs
├── service-worker.js   # Offline-Cache, automatische Updates
├── test/               # Node-Tests (layout.test.js) und Skript für echte Dateien
├── desktop/            # LabelCrop Desktop: Java + PDFBox, Direktdruck ohne Dialog (eigene README)
└── CNAME               # eigene Domain für GitHub Pages
```

## Lokal starten

Service Worker und pdf.js-Worker funktionieren nicht über `file://`, es
braucht einen Webserver. Im Projektordner:

```
python -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Tests

Ohne Abhängigkeiten, nur Node (≥ 20):

```
node --test test/layout.test.js
node test/crop-sample.js "test/samples/<label>.pdf" out.pdf brother-62-endless
```

Beispiel-PDFs mit echten Adressen liegen nur lokal in `test/samples/`
(gitignored).

## Neues Label-Profil anlegen

In `profiles.js` einen Eintrag ergänzen: Position und Größe des Labels in mm
ab der linken oberen Ecke der Seite, erwartete Seitengröße und – falls
möglich – Textmuster zur Erkennung. Kein weiterer Code nötig.

## Deployment

Repository `cdrcltr/repo_labelcrop`, GitHub Pages mit „Deploy from a branch“
(Branch `master`, Ordner `/ (root)`). `CNAME` bindet `labelcrop.tourelleworks.de`;
dafür bei Cloudflare einen CNAME-Eintrag `labelcrop` auf `cdrcltr.github.io`
anlegen (das Ziel ist immer `<github-benutzer>.github.io`, nicht der Repo-Name).

Bei jedem Release hochzählen:

- `APP_VERSION` in `app.js` – sichtbare Versionsnummer in der Fußzeile
- `CACHE_VERSION` in `service-worker.js` – damit der Cache sicher erneuert wird
