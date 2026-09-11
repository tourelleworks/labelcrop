# Eingebundene Bibliotheken

Beide Bibliotheken liegen bewusst als Kopie hier (kein CDN, kein Build):
die App läuft damit offline, als installierte PWA und ohne dass Etiketten-
Daten je eine fremde Adresse berühren.

| Datei | Bibliothek | Version | Lizenz | Zweck |
|---|---|---|---|---|
| `pdf-lib.min.js` | [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | MIT (`LICENSE-pdf-lib.md`) | Zuschneiden: Seite als Form-XObject in eine neue PDF einbetten |
| `pdf.min.js`, `pdf.worker.min.js` | [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache 2.0 (`LICENSE-pdfjs.txt`) | Vorschau zeichnen, Text für die Erkennung lesen |

Aktualisieren: `npm pack pdf-lib@<version>` bzw. `pdfjs-dist@<version>`, die
Dateien aus `dist/` bzw. `build/` hierher kopieren, Version in dieser Tabelle
und `CACHE_VERSION` im Service Worker hochzählen. pdf.js ab Version 4 liefert
nur noch ES-Module (`.mjs`); dann müssten die `<script>`-Tags in `index.html`
auf `type="module"` umgestellt werden.
