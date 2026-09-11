// ============================================================
// LabelCrop – test/layout.test.js
//
// Prüft die reine Geometrie in cropper.js ohne PDF: Quellbereich,
// Zielformate, Einpassen, automatische Drehung, Matrix, Erkennung.
//
// Aufruf (Node ≥ 20, keine Abhängigkeiten):
//   node --test test/layout.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert/strict");

const profiles = require("../profiles.js");
const LabelCrop = require("../cropper.js");

const A4 = { x: 0, y: 0, width: 595.275, height: 841.889 };
const POST = profiles.findProfile("post-internetmarke-ebay");
const POST_MARKS = profiles.findProfile("post-internetmarke-ebay-marks");

// Maße des engen Standard-Ausschnitts in mm (siehe profiles.js).
const W = 76.2;
const H = 40.2;

function mm(pt) { return LabelCrop.ptToMm(pt); }

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ": " + actual + " statt " + expected);
}

test("Standardprofil: enger Ausschnitt ab 36/85 pt, 216 × 114 pt (Referenz-Zuschnitt)", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  assertClose(box.left, 36, 0.05, "links");
  assertClose(A4.height - box.top, 85.04, 0.05, "oben (von oben)");
  assertClose(box.width, 216, 0.05, "Breite in pt");
  assertClose(box.height, 113.95, 0.1, "Höhe in pt");
  assertClose(mm(box.width), W, 0.01, "Breite in mm");
  assertClose(mm(box.height), H, 0.01, "Höhe in mm");
});

test("Passkreuz-Profil: Bereich zwischen den Kreuzen, 1 mm eingerückt → 88 × 45 mm", () => {
  const box = LabelCrop.sourceBox(POST_MARKS, A4);
  // Passkreuz-Mittelpunkte (gemessen): x 33,165 / 288,282 pt, y 82,36 / 215,59 pt von oben.
  assertClose(box.left, 33.165 + LabelCrop.mmToPt(1), 0.1, "links");
  assertClose(box.right, 288.282 - LabelCrop.mmToPt(1), 0.1, "rechts");
  assertClose(A4.height - box.top, 82.359 + LabelCrop.mmToPt(1), 0.1, "oben (von oben)");
  assertClose(A4.height - box.bottom, 215.586 - LabelCrop.mmToPt(1), 0.1, "unten (von oben)");
  assertClose(mm(box.width), 88, 0.01, "Breite in mm");
  assertClose(mm(box.height), 45, 0.01, "Höhe in mm");
});

test("Beide Post-Profile beginnen an derselben Ecke links oben", () => {
  const tight = LabelCrop.sourceBox(POST, A4);
  const marks = LabelCrop.sourceBox(POST_MARKS, A4);
  assertClose(tight.left, marks.left, 0.1, "linke Kante");
  assertClose(tight.top, marks.top, 0.3, "obere Kante");
});

test("Wie Ausschnitt: Seite genau so groß wie der Bereich, Maßstab 1:1", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("source"), { margin: 0 });
  assertClose(mm(layout.pageWidth), W, 0.01, "Seitenbreite");
  assertClose(mm(layout.pageHeight), H, 0.01, "Seitenhöhe");
  assert.equal(layout.scale, 1);
  assert.equal(layout.rotation, 0);
  assert.equal(layout.fits, true);
  // Die Matrix schiebt die linke untere Ecke des Bereichs auf den Ursprung.
  assert.deepEqual(layout.matrix.slice(0, 4), [1, 0, 0, 1]);
  assertClose(layout.matrix[4], -box.left, 1e-9, "Verschiebung x");
  assertClose(layout.matrix[5], -box.bottom, 1e-9, "Verschiebung y");
});

test("Rand vergrößert bei 'Wie Ausschnitt' die Seite rundum", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("source"), { margin: 2 });
  assertClose(mm(layout.pageWidth), W + 4, 0.01, "Seitenbreite");
  assertClose(mm(layout.pageHeight), H + 4, 0.01, "Seitenhöhe");
  assertClose(mm(layout.x), 2, 0.01, "Abstand links");
});

test("Endlosrolle 62 mm: automatisch drehen, weil das mehr Maßstab bringt", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("brother-62-endless"), { margin: 0 });
  // Ungedreht: 62/76,2 = 0,81 · Gedreht: 62/40,2 = 1,54 → gedreht gewinnt.
  assert.equal(layout.rotation, 90);
  assertClose(layout.scale, 62 / H, 1e-6, "Maßstab");
  assertClose(mm(layout.pageWidth), 62, 0.01, "Seitenbreite = Rollenbreite");
  assertClose(mm(layout.pageHeight), W * (62 / H), 0.01, "Seitenhöhe aus dem Inhalt");
  assert.equal(layout.fits, true);
});

test("Endlosrolle ohne Drehen: Breite 62, Höhe aus dem Inhalt", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("brother-62-endless"), { margin: 0, rotate: "none" });
  assert.equal(layout.rotation, 0);
  assertClose(layout.scale, 62 / W, 1e-6, "Maßstab");
  assertClose(mm(layout.pageHeight), H * (62 / W), 0.01, "Seitenhöhe");
});

test("Festes Format 62 × 100 mm: gedreht passt mehr hinein", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("brother-62x100"), { margin: 0 });
  // Ungedreht: min(62/76,2, 100/40,2) = 0,81 · Gedreht: min(62/40,2, 100/76,2) = 1,31.
  assert.equal(layout.rotation, 90);
  assertClose(layout.scale, 100 / W, 1e-6, "Maßstab");
  assertClose(mm(layout.pageWidth), 62, 0.01, "Seitenbreite");
  assertClose(mm(layout.pageHeight), 100, 0.01, "Seitenhöhe");
  // Zentriert: der Inhalt ist 40,2 · 1,312 = 52,8 mm breit → 4,6 mm Luft je Seite.
  assertClose(mm(layout.x), (62 - H * (100 / W)) / 2, 0.01, "x zentriert");
  assertClose(mm(layout.y), 0, 0.01, "y bündig");
});

test("Originalgröße (1:1) auf 100 × 150 mm: passt ungedreht, wird zentriert", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("thermo-100x150"), { margin: 2, scaleMode: "none" });
  assert.equal(layout.scale, 1);
  assert.equal(layout.rotation, 0);
  assert.equal(layout.fits, true);
  assertClose(mm(layout.x), (100 - W) / 2, 0.01, "x zentriert");
  assertClose(mm(layout.y), (150 - H) / 2, 0.01, "y zentriert");
});

test("Originalgröße auf zu kleinem Format meldet fits = false", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("dymo-36x89"), { margin: 0, scaleMode: "none" });
  assert.equal(layout.fits, false);
});

test("Rand wird beim Einpassen abgezogen", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("brother-62-endless"), { margin: 2, rotate: "none" });
  assertClose(layout.scale, 58 / W, 1e-6, "Maßstab auf 58 mm nutzbare Breite");
  assertClose(mm(layout.pageHeight), H * (58 / W) + 4, 0.01, "Höhe = Inhalt + 2 × Rand");
});

test("Matrix bei 90°: Ecken des Bereichs landen innerhalb der Zielseite", () => {
  const box = LabelCrop.sourceBox(POST, A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget("brother-62-endless"), { margin: 0 });
  const m = layout.matrix;
  function map(px, py) { return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]]; }
  const corners = [map(box.left, box.bottom), map(box.right, box.bottom), map(box.left, box.top), map(box.right, box.top)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  assertClose(Math.min(...xs), 0, 1e-6, "min x");
  assertClose(Math.max(...xs), layout.pageWidth, 1e-6, "max x");
  assertClose(Math.min(...ys), 0, 1e-6, "min y");
  assertClose(Math.max(...ys), layout.pageHeight, 1e-6, "max y");
  // Uhrzeigersinn: die linke obere Ecke der Quelle wird zur rechten oberen Ecke.
  const topLeft = map(box.left, box.top);
  assertClose(topLeft[0], layout.pageWidth, 1e-6, "oben links → rechts");
  assertClose(topLeft[1], layout.pageHeight, 1e-6, "oben links → oben");
});

test("Erkennung: Internetmarke an 'IM' plus Datum/Preis, nur bei A4, enges Profil zuerst", () => {
  // Erfundene Daten im Aufbau eines echten Labels: Absenderzeile, Frankier-ID, "IM" mit Datum und Preis, Empfänger.
  const text = "Erika Mustermann, Am Beispielweg 1, 12345 Musterstadt A0 1234 5678 00 0000 9ABC IM 09.09.26 1,80 MAX MUSTER";
  assert.equal(LabelCrop.detectProfile(profiles.PROFILES, A4, text), POST);
  assert.equal(LabelCrop.detectProfile(profiles.PROFILES, A4, "irgendein Brief"), null);
  const letter = { x: 0, y: 0, width: 612, height: 792 };
  assert.equal(LabelCrop.detectProfile(profiles.PROFILES, letter, text), null);
});

test("Ausgabename hängt _label an", () => {
  assert.equal(LabelCrop.outputFileName("eBay label 01-12345-67890.pdf"), "eBay label 01-12345-67890_label.pdf");
  assert.equal(LabelCrop.outputFileName("label.PDF"), "label_label.pdf");
  assert.equal(LabelCrop.outputFileName("ohne-endung"), "ohne-endung_label.pdf");
});
