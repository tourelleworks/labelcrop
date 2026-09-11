// ============================================================
// LabelCrop – profiles.js
//
// Daten statt Code: Hier steht das Wissen über Label-Layouts
// (wo sitzt das Etikett auf der A4-Seite?) und über Zielformate
// (welche Etikettengröße hat der Drucker?). Ein neuer Anbieter oder
// ein neuer Drucker ist ein neuer Eintrag – kein neuer Code.
//
// Alle Maße in Millimetern. Quellkoordinaten zählen von der linken
// oberen Ecke der Seite, so wie man sie mit dem Lineal auf dem
// Ausdruck messen würde. Die Umrechnung in PDF-Punkte (y von unten)
// passiert erst in cropper.js.
// ============================================================

const LabelCropProfiles = (function () {

  // --- Label-Profile: wo liegt das Etikett auf der Quellseite? ---
  const PROFILES = [
    {
      id: "post-internetmarke-ebay",
      name: "Deutsche Post Internetmarke (eBay)",
      description: "A4 hochkant, Etikett links oben; Ausschnitt eng um den Inhalt (76,2 × 40,2 mm).",
      // Erwartete Seitengröße in mm. Weicht die Datei ab, zeigt die
      // Oberfläche einen Hinweis – dann passt vermutlich das Profil nicht.
      page: { width: 210, height: 297, tolerance: 2 },
      // Enger Ausschnitt um den Inhalt, gemessen an einem echten Label vom
      // September 2026: Absenderzeile beginnt 2,3 mm rechts und 2,2 mm unter
      // der Kante, der Data-Matrix-Code endet 4 mm vor der rechten Kante, die
      // Adresse 3,6 mm über der unteren. Entspricht dem Referenz-Zuschnitt
      // (36/85 pt, 216 × 114 pt). Der Bereich zwischen den Passkreuzen wäre
      // 90 × 47 mm – siehe nächstes Profil; hier wären rechts 16 mm und unten
      // 8 mm Leerraum, was auf dem Etikett nur Platz verschenkt.
      source: { x: 12.7, y: 30.0, width: 76.2, height: 40.2 },
      trim: 0,
      // Erkennung: "Deutsche Post" ist im PDF ein Logo (Pfad), kein Text.
      // Eine Internetmarke erkennt man stattdessen an "IM" plus Datum und
      // Preis in derselben Zeile ("IM 09.09.26 1,80"). Alle Muster müssen passen.
      detect: {
        textAll: [/\bIM\b/, /\d{2}\.\d{2}\.\d{2}\s+\d+,\d{2}/],
      },
    },
    {
      id: "post-internetmarke-ebay-marks",
      name: "Deutsche Post Internetmarke (eBay) – Passkreuz-Bereich",
      description: "Voller Bereich zwischen den vier Passkreuzen (90 × 47 mm), falls eine sehr lange Absenderzeile rechts abgeschnitten würde.",
      page: { width: 210, height: 297, tolerance: 2 },
      // Rechteck zwischen den Mittelpunkten der vier Passkreuze: x 33,165 pt,
      // y 82,36 pt von oben, 255,12 × 133,23 pt – exakt 90 × 47 mm.
      source: { x: 11.7, y: 29.05, width: 90, height: 47 },
      // Die Passkreuze ragen 2,4 mm in das Rechteck hinein. 1 mm Beschnitt
      // rundum lässt ihre Reste am Rand verschwinden.
      trim: 1,
      // Gleiche Erkennung wie oben; bei "Automatisch" gewinnt das erste
      // passende Profil, also der enge Ausschnitt.
      detect: {
        textAll: [/\bIM\b/, /\d{2}\.\d{2}\.\d{2}\s+\d+,\d{2}/],
      },
    },
    {
      id: "custom",
      name: "Eigener Bereich …",
      description: "Bereich von Hand angeben (mm ab der linken oberen Ecke der Seite).",
      page: null,
      source: { x: 12.7, y: 30.0, width: 76.2, height: 40.2 },
      trim: 0,
      detect: null,
      custom: true,
    },
  ];

  // --- Zielformate: welche Seitengröße soll die Label-PDF haben? ---
  // width/height in mm. height null = Endlosrolle (Höhe ergibt sich aus dem
  // Inhalt); beides null = Seite genau so groß wie der Ausschnitt (1:1).
  const TARGETS = [
    { id: "source", name: "Wie Ausschnitt (Originalgröße)", width: null, height: null },
    { id: "brother-62-endless", name: "Brother 62 mm Endlos (DK-22205)", width: 62, height: null },
    { id: "brother-62x100", name: "Brother 62 × 100 mm (DK-11202)", width: 62, height: 100 },
    { id: "brother-102x152", name: "Brother 102 × 152 mm (DK-11241)", width: 102, height: 152 },
    { id: "dymo-36x89", name: "DYMO 36 × 89 mm (99012)", width: 36, height: 89 },
    { id: "dymo-54x101", name: "DYMO 54 × 101 mm (99014)", width: 54, height: 101 },
    { id: "thermo-100x150", name: "Thermodrucker 100 × 150 mm (4 × 6 Zoll)", width: 100, height: 150 },
    { id: "a6", name: "A6 (105 × 148 mm)", width: 105, height: 148 },
    { id: "custom", name: "Eigene Größe …", width: 100, height: 50, custom: true },
  ];

  function findById(list, id) {
    for (const entry of list) {
      if (entry.id === id) { return entry; }
    }
    return null;
  }

  return {
    PROFILES: PROFILES,
    TARGETS: TARGETS,
    findProfile: function (id) { return findById(PROFILES, id); },
    findTarget: function (id) { return findById(TARGETS, id); },
  };
})();

// In Node (Tests) als Modul bereitstellen; im Browser genügt die globale Konstante.
if (typeof module !== "undefined" && module.exports) {
  module.exports = LabelCropProfiles;
}
