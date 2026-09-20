// ============================================================
// LabelCrop – profiles.js
//
// Daten statt Code: Hier steht das Wissen über Label-Layouts
// (wo sitzt das Etikett auf der A4-Seite?) und über Zielformate
// (welche Etikettengröße hat der Drucker?). Ein neuer Anbieter oder
// ein neuer Drucker ist ein neuer Eintrag – kein neuer Code.
//
// Zusätzlich verwaltet dieses Modul die eigenen Einträge des Nutzers
// (Label-Typen aus dem Ausschnitt-Editor, eigene Etikettenformate).
// Sie liegen im localStorage des Browsers; die Oberfläche übergibt den
// Speicher über load(), damit der Rest hier DOM-frei und in Node testbar bleibt.
//
// Alle Maße in Millimetern. Quellkoordinaten zählen von der linken
// oberen Ecke der Seite, so wie man sie mit dem Lineal auf dem
// Ausdruck messen würde. Die Umrechnung in PDF-Punkte (y von unten)
// passiert erst in cropper.js.
// ============================================================

const LabelCropProfiles = (function () {

  // --- Eingebaute Label-Profile: wo liegt das Etikett auf der Quellseite? ---
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
  ];

  // "Eigener Bereich": Maße werden im Formular eingetippt oder im Editor gezogen.
  const CUSTOM_PROFILE = {
    id: "custom",
    name: "Eigener Bereich …",
    description: "Bereich von Hand angeben (mm ab der linken oberen Ecke der Seite).",
    page: null,
    source: { x: 12.7, y: 30.0, width: 76.2, height: 40.2 },
    trim: 0,
    detect: null,
    custom: true,
  };

  // --- Eingebaute Zielformate: welche Seitengröße soll die Label-PDF haben? ---
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
  ];

  const CUSTOM_TARGET = { id: "custom", name: "Eigene Größe …", width: 100, height: 50, custom: true };

  // --- Eigene Einträge des Nutzers ---
  const STORAGE_KEY = "labelcrop-custom-formats";
  const USER_ID_PREFIX = "user-";
  let storage = null;       // localStorage-ähnliches Objekt (getItem/setItem), von load() gesetzt
  let userProfiles = [];
  let userTargets = [];

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function isUserId(value) {
    return typeof value === "string" && value.indexOf(USER_ID_PREFIX) === 0;
  }

  // Prüft und normalisiert einen gespeicherten oder neu angelegten Label-Typ.
  // Kaputte Einträge (z. B. aus einer alten Version) werden still verworfen.
  function cleanProfile(raw) {
    if (!raw || typeof raw !== "object") { return null; }
    if (!isUserId(raw.id)) { return null; }
    if (typeof raw.name !== "string" || raw.name.trim() === "") { return null; }
    const source = raw.source;
    if (!source || !isNumber(source.x) || !isNumber(source.y) || !isNumber(source.width) || !isNumber(source.height)) {
      return null;
    }
    if (source.width <= 0 || source.height <= 0) { return null; }
    // Seitengröße merken: Damit wird der Typ bei "Automatisch erkennen" für
    // Dateien mit dieser Seitengröße vorgeschlagen, wenn kein eingebautes Profil passt.
    let page = null;
    if (raw.page && isNumber(raw.page.width) && isNumber(raw.page.height) && raw.page.width > 0 && raw.page.height > 0) {
      page = { width: raw.page.width, height: raw.page.height, tolerance: 2 };
    }
    return {
      id: raw.id,
      name: raw.name.trim(),
      description: "Eigener Label-Typ",
      page: page,
      source: { x: source.x, y: source.y, width: source.width, height: source.height },
      trim: 0,
      detect: null,
      userDefined: true,
    };
  }

  function cleanTarget(raw) {
    if (!raw || typeof raw !== "object") { return null; }
    if (!isUserId(raw.id)) { return null; }
    if (typeof raw.name !== "string" || raw.name.trim() === "") { return null; }
    if (!isNumber(raw.width) || raw.width <= 0) { return null; }
    let height = null;   // null = Endlosrolle
    if (isNumber(raw.height) && raw.height > 0) { height = raw.height; }
    return { id: raw.id, name: raw.name.trim(), width: raw.width, height: height, userDefined: true };
  }

  // Eigene Einträge aus dem übergebenen Speicher laden (Browser: localStorage).
  function load(storageLike) {
    storage = storageLike;
    userProfiles = [];
    userTargets = [];
    if (!storage) { return; }
    let data = null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== null) { data = JSON.parse(raw); }
    } catch (error) {
      console.warn("Eigene Formate unlesbar, werden ignoriert:", error);
      data = null;
    }
    if (!data || typeof data !== "object") { return; }
    if (Array.isArray(data.profiles)) {
      for (const raw of data.profiles) {
        const profile = cleanProfile(raw);
        if (profile !== null) { userProfiles.push(profile); }
      }
    }
    if (Array.isArray(data.targets)) {
      for (const raw of data.targets) {
        const target = cleanTarget(raw);
        if (target !== null) { userTargets.push(target); }
      }
    }
  }

  function persist() {
    if (!storage) { return false; }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ profiles: userProfiles, targets: userTargets }));
      return true;
    } catch (error) {
      console.warn("Eigene Formate konnten nicht gespeichert werden:", error);
      return false;
    }
  }

  function newId() {
    return USER_ID_PREFIX + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  function findById(list, id) {
    for (const entry of list) {
      if (entry.id === id) { return entry; }
    }
    return null;
  }

  // Reihenfolge: eingebaute Einträge, dann eigene, zuletzt "Eigener Bereich"/"Eigene Größe".
  // Die Reihenfolge ist auch die Rangfolge bei "Automatisch erkennen".
  function allProfiles() {
    return PROFILES.concat(userProfiles, [CUSTOM_PROFILE]);
  }

  function allTargets() {
    return TARGETS.concat(userTargets, [CUSTOM_TARGET]);
  }

  function addProfile(input) {
    const profile = cleanProfile({ id: newId(), name: input.name, source: input.source, page: input.page });
    if (profile === null) { throw new Error("Ungültige Werte für den Label-Typ."); }
    userProfiles.push(profile);
    persist();
    return profile;
  }

  function removeProfile(id) {
    const index = userProfiles.indexOf(findById(userProfiles, id));
    if (index < 0) { return false; }   // eingebaute Einträge lassen sich nicht löschen
    userProfiles.splice(index, 1);
    persist();
    return true;
  }

  function addTarget(input) {
    const target = cleanTarget({ id: newId(), name: input.name, width: input.width, height: input.height });
    if (target === null) { throw new Error("Ungültige Werte für das Format."); }
    userTargets.push(target);
    persist();
    return target;
  }

  function removeTarget(id) {
    const index = userTargets.indexOf(findById(userTargets, id));
    if (index < 0) { return false; }
    userTargets.splice(index, 1);
    persist();
    return true;
  }

  function isUserDefined(entry) {
    return entry !== null && entry !== undefined && entry.userDefined === true;
  }

  return {
    PROFILES: PROFILES,
    TARGETS: TARGETS,
    STORAGE_KEY: STORAGE_KEY,
    load: load,
    allProfiles: allProfiles,
    allTargets: allTargets,
    userProfiles: function () { return userProfiles.slice(); },
    userTargets: function () { return userTargets.slice(); },
    findProfile: function (id) { return findById(allProfiles(), id); },
    findTarget: function (id) { return findById(allTargets(), id); },
    addProfile: addProfile,
    removeProfile: removeProfile,
    addTarget: addTarget,
    removeTarget: removeTarget,
    isUserDefined: isUserDefined,
  };
})();

// In Node (Tests) als Modul bereitstellen; im Browser genügt die globale Konstante.
if (typeof module !== "undefined" && module.exports) {
  module.exports = LabelCropProfiles;
}
