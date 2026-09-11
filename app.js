// ============================================================
// LabelCrop – app.js
//
// Die Oberfläche: Dateien entgegennehmen, Einstellungen einlesen,
// Vorschau zeichnen (pdf.js), Ergebnis erzeugen (cropper.js),
// drucken und speichern. Alles bleibt im Browser – nichts wird
// hochgeladen, denn Versandetiketten enthalten Adressen.
// ============================================================

const APP_VERSION = "0.3";   // bei jedem Release hochzählen (CACHE_VERSION im Service Worker ebenso)

// pdf.js zeichnet nur die Vorschau; das Zuschneiden macht pdf-lib in cropper.js.
// Der Worker parst im Hintergrund, damit die Oberfläche flüssig bleibt.
pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const PREVIEW_PX_PER_MM = 5;    // Vorschau-Auflösung in CSS-Pixeln je Millimeter
const PREVIEW_CONTEXT_MM = 8;   // so viel Umgebung um den Ausschnitt zeigt die Original-Vorschau
const AUTO_PROFILE_ID = "auto";
const DEFAULT_MARGIN_MM = 2;    // Vorgabe bei festen Formaten: Drucker lassen den Rand meist frei
// pdf.js zeichnet mit intent "display" in requestAnimationFrame-Häppchen, die
// in einem Hintergrund-Tab pausieren – die Vorschau bliebe dann bei
// "Wird verarbeitet" stehen. "print" zeichnet per setTimeout, also immer.
const RENDER_INTENT = "print";
const SETTINGS_KEY = "labelcrop-settings";   // Schlüssel im localStorage dieses Browsers
const PRINT_FRAME_LIFETIME_MS = 120000;      // so lange bleibt der unsichtbare Druck-Rahmen bestehen
const PRINT_DPI = 600;                        // Rasterauflösung für den Druck (Etikettendrucker haben 203–300 dpi)
const PRINT_MAX_PX = 4200;                    // Obergrenze je Seite, damit große Formate nicht zu viel Speicher brauchen

// Welche Formularfelder gemerkt werden. Die Vorgaben stehen hier und nicht im
// HTML, damit "Zurücksetzen" und der erste Start dieselben Werte liefern.
const SETTINGS_DEFAULTS = {
  profile: "auto",
  sourceX: "12.7",
  sourceY: "30.0",
  sourceWidth: "76.2",
  sourceHeight: "40.2",
  target: "source",
  targetWidth: "100",
  targetHeight: "50",
  scaleMode: "fit",
  rotate: "auto",
  placement: "center",
  margin: "0",
};

// --- Zustand ---
const entries = [];        // eine geladene Datei je Eintrag, siehe createEntry()
let nextEntryId = 1;
let reprocessTimer = null;
let marginTouched = false; // hat der Nutzer den Rand selbst geändert? Dann nicht mehr automatisch setzen.

// --- DOM ---
function byId(id) { return document.getElementById(id); }

const dom = {
  dropzone: byId("dropzone"),
  fileInput: byId("file-input"),
  form: byId("settings"),
  profile: byId("profile"),
  customSource: byId("custom-source"),
  sourceX: byId("source-x"),
  sourceY: byId("source-y"),
  sourceWidth: byId("source-width"),
  sourceHeight: byId("source-height"),
  target: byId("target"),
  customTarget: byId("custom-target"),
  targetWidth: byId("target-width"),
  targetHeight: byId("target-height"),
  scaleMode: byId("scale-mode"),
  rotate: byId("rotate"),
  placement: byId("placement"),
  margin: byId("margin"),
  profileSummary: byId("profile-summary"),
  resultsBar: byId("results-bar"),
  resultList: byId("result-list"),
  resultCount: byId("result-count"),
  printAll: byId("print-all"),
  saveAll: byId("save-all"),
  saveMerged: byId("save-merged"),
  clearAll: byId("clear-all"),
  testPrint: byId("test-print"),
  testPrintSave: byId("test-print-save"),
  resetSettings: byId("reset-settings"),
  settingsStatus: byId("settings-status"),
  template: byId("result-template"),
  message: byId("message"),
  pwaStatus: byId("pwa-status"),
};

// Zuordnung Einstellungsname → Formularfeld; Reihenfolge ist egal.
const SETTINGS_FIELDS = {
  profile: dom.profile,
  sourceX: dom.sourceX,
  sourceY: dom.sourceY,
  sourceWidth: dom.sourceWidth,
  sourceHeight: dom.sourceHeight,
  target: dom.target,
  targetWidth: dom.targetWidth,
  targetHeight: dom.targetHeight,
  scaleMode: dom.scaleMode,
  rotate: dom.rotate,
  placement: dom.placement,
  margin: dom.margin,
};

// ============================================================
// Einstellungen
// ============================================================

function fillSelect(select, items, firstOption) {
  if (firstOption !== null) {
    const option = document.createElement("option");
    option.value = firstOption.id;
    option.textContent = firstOption.name;
    select.appendChild(option);
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

function numberValue(input, fallback) {
  const value = parseFloat(input.value);
  if (isNaN(value)) { return fallback; }
  return value;
}

// Liest das Formular in ein Einstellungs-Objekt. Für "Eigener Bereich" bzw.
// "Eigene Größe" entsteht daraus ein Profil bzw. Zielformat mit den
// eingegebenen Werten – der Kern kennt keine Formularfelder.
function readSettings() {
  let profile = null;   // null = automatisch erkennen
  if (dom.profile.value !== AUTO_PROFILE_ID) {
    profile = LabelCropProfiles.findProfile(dom.profile.value);
    if (profile !== null && profile.custom) {
      profile = Object.assign({}, profile, {
        source: {
          x: numberValue(dom.sourceX, 0),
          y: numberValue(dom.sourceY, 0),
          width: Math.max(1, numberValue(dom.sourceWidth, 1)),
          height: Math.max(1, numberValue(dom.sourceHeight, 1)),
        },
      });
    }
  }

  let target = LabelCropProfiles.findTarget(dom.target.value);
  if (target !== null && target.custom) {
    let height = null;   // leer = Endlosrolle
    if (dom.targetHeight.value.trim() !== "" && numberValue(dom.targetHeight, 0) > 0) {
      height = numberValue(dom.targetHeight, 0);
    }
    target = Object.assign({}, target, {
      width: Math.max(1, numberValue(dom.targetWidth, 1)),
      height: height,
    });
  }

  return {
    profile: profile,
    target: target,
    options: {
      scaleMode: dom.scaleMode.value,
      rotate: dom.rotate.value,
      placement: dom.placement.value,
      margin: Math.max(0, numberValue(dom.margin, 0)),
    },
  };
}

function isSourceSizeTarget() {
  return dom.target.value === "source";
}

function updateSettingsVisibility() {
  const profile = LabelCropProfiles.findProfile(dom.profile.value);
  dom.customSource.hidden = !(profile !== null && profile.custom);
  const target = LabelCropProfiles.findTarget(dom.target.value);
  dom.customTarget.hidden = !(target !== null && target.custom);
  // Bei "Wie Ausschnitt" gibt es nichts einzupassen und nichts zu platzieren.
  dom.scaleMode.disabled = isSourceSizeTarget();
  dom.placement.disabled = isSourceSizeTarget();
  updateProfileSummary();
}

// Eine Zeile, die auch bei eingeklappten Feineinstellungen zeigt, was gilt.
function updateProfileSummary() {
  const settings = readSettings();
  const described = LabelCrop.describeOptions(settings.options);
  const parts = [];
  if (!isSourceSizeTarget()) {
    parts.push(described.scale);
    parts.push(described.placement);
  }
  parts.push("Drehung " + described.rotation);
  parts.push("Rand " + String(settings.options.margin).replace(".", ",") + " mm");
  dom.profileSummary.textContent = parts.join(" · ");
}

function onTargetChanged() {
  if (!marginTouched) {
    if (isSourceSizeTarget()) {
      dom.margin.value = "0";
    } else {
      dom.margin.value = String(DEFAULT_MARGIN_MM);
    }
  }
  updateSettingsVisibility();
  scheduleReprocess();
}

function scheduleReprocess() {
  // Kurz warten: beim Tippen in ein Zahlenfeld nicht bei jedem Zeichen neu rechnen.
  if (reprocessTimer !== null) { clearTimeout(reprocessTimer); }
  reprocessTimer = setTimeout(function () {
    reprocessTimer = null;
    for (const entry of entries) { processEntry(entry); }
  }, 150);
}

// ============================================================
// Einstellungen merken (localStorage, nur auf diesem Gerät)
// ============================================================

// Prüft, ob ein gespeicherter Wert für ein Auswahlfeld noch existiert –
// ein Profil könnte in einer neuen Version umbenannt worden sein.
function selectHasOption(select, value) {
  for (const option of select.options) {
    if (option.value === value) { return true; }
  }
  return false;
}

// Alte gespeicherte Werte aus Version 0.2 auf die neuen Auswahlwerte abbilden.
function migrateSettingValue(key, value) {
  if (key === "rotate" && value === "none") { return "0"; }
  if (key === "rotate" && value === "rotate") { return "90"; }
  return value;
}

function applySettings(values) {
  for (const key in SETTINGS_FIELDS) {
    const field = SETTINGS_FIELDS[key];
    let value = SETTINGS_DEFAULTS[key];
    if (typeof values[key] === "string") { value = migrateSettingValue(key, values[key]); }
    if (field.tagName === "SELECT" && !selectHasOption(field, value)) {
      value = SETTINGS_DEFAULTS[key];
    }
    field.value = value;
  }
  marginTouched = values.marginTouched === true;
}

function saveSettings() {
  const values = { marginTouched: marginTouched };
  for (const key in SETTINGS_FIELDS) {
    values[key] = SETTINGS_FIELDS[key].value;
  }
  // localStorage kann fehlen oder gesperrt sein (privates Fenster, Speicher voll) –
  // dann läuft die App einfach ohne Merken weiter.
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
    showSettingsStatus("Gespeichert – gilt beim nächsten Öffnen auf diesem Gerät.");
  } catch (error) {
    console.warn("Einstellungen konnten nicht gespeichert werden:", error);
    showSettingsStatus("Konnte nicht gespeichert werden (Browser-Speicher gesperrt).");
  }
}

function loadSettings() {
  let values = {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw !== null) { values = JSON.parse(raw); }
  } catch (error) {
    console.warn("Gespeicherte Einstellungen unlesbar, Vorgaben werden verwendet:", error);
    values = {};
  }
  if (values === null || typeof values !== "object") { values = {}; }
  applySettings(values);
  if (Object.keys(values).length > 0) {
    showSettingsStatus("Gespeicherte Einstellungen geladen.");
  } else {
    showSettingsStatus("Änderungen werden automatisch auf diesem Gerät gemerkt.");
  }
}

function resetSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
  } catch (error) {
    console.warn("Einstellungen konnten nicht gelöscht werden:", error);
  }
  applySettings({});
  updateSettingsVisibility();
  showSettingsStatus("Auf Vorgaben zurückgesetzt.");
  scheduleReprocess();
}

function showSettingsStatus(text) {
  dom.settingsStatus.textContent = text;
}

// ============================================================
// Dateien laden
// ============================================================

function isPdf(file) {
  if (file.type === "application/pdf") { return true; }
  return /\.pdf$/i.test(file.name);
}

async function addFiles(fileList) {
  const files = Array.from(fileList);
  const rejected = [];
  hideMessage();
  for (const file of files) {
    if (!isPdf(file)) {
      rejected.push(file.name);
      continue;
    }
    await addFile(file);
  }
  if (rejected.length > 0) {
    showMessage("Keine PDF, übersprungen: " + rejected.join(", "), "warn");
  }
}

async function addFile(file) {
  const entry = createEntry(file.name);
  entries.push(entry);
  dom.resultList.appendChild(entry.element);
  updateResultsBar();
  setEntryStatus(entry, "Wird gelesen …");
  try {
    const buffer = await file.arrayBuffer();
    entry.sourceBytes = new Uint8Array(buffer);
    await loadSource(entry);
    await processEntry(entry);
  } catch (error) {
    console.error(error);
    setEntryError(entry, "Datei konnte nicht gelesen werden: " + error.message);
  }
}

function createEntry(name) {
  const fragment = dom.template.content.cloneNode(true);
  const element = fragment.querySelector(".result");
  const entry = {
    id: nextEntryId,
    name: name,
    sourceBytes: null,
    pdf: null,               // pdf.js-Dokument (nur für die Vorschau)
    page: null,              // pdf.js-Seite 1
    pageCount: 0,
    mediaBox: null,          // aus pdf-lib: {x, y, width, height} in pt
    rotation: 0,             // /Rotate der Quellseite
    text: "",                // Text der Seite 1 für die Profil-Erkennung
    detected: null,          // erkanntes Profil oder null
    result: null,            // { bytes, pages } aus cropper.js
    generation: 0,           // zählt Verarbeitungen; veraltete Ergebnisse werden verworfen
    sourceRenderTask: null,  // laufende pdf.js-Renderings, damit sie abgebrochen werden können
    resultRenderTask: null,
    element: element,
  };
  nextEntryId += 1;
  element.querySelector(".result-name").textContent = name;
  element.querySelector(".result-print").addEventListener("click", function () { printEntry(entry); });
  element.querySelector(".result-save").addEventListener("click", function () { saveEntry(entry); });
  element.querySelector(".result-remove").addEventListener("click", function () { removeEntry(entry); });
  return entry;
}

// Metadaten mit pdf-lib (MediaBox, Drehung), Text und Seite mit pdf.js.
// Warum beides: pdf.js kennt nur die sichtbare Box (CropBox), das Profil
// bezieht sich aber auf die echte Seite (MediaBox) – wie pdf-lib beim Zuschneiden.
async function loadSource(entry) {
  const doc = await PDFLib.PDFDocument.load(entry.sourceBytes, { ignoreEncryption: true });
  entry.pageCount = doc.getPageCount();
  const first = doc.getPage(0);
  entry.mediaBox = first.getMediaBox();
  entry.rotation = first.getRotation().angle;

  // pdf.js übergibt den Puffer an den Worker (Transfer) – deshalb eine Kopie.
  entry.pdf = await pdfjsLib.getDocument({ data: new Uint8Array(entry.sourceBytes) }).promise;
  entry.page = await entry.pdf.getPage(1);
  const textContent = await entry.page.getTextContent();
  const parts = [];
  for (const item of textContent.items) {
    if (item.str) { parts.push(item.str); }
  }
  entry.text = parts.join(" ");
  entry.detected = LabelCrop.detectProfile(LabelCropProfiles.PROFILES, entry.mediaBox, entry.text);
}

// ============================================================
// Verarbeiten: zuschneiden + Vorschau
// ============================================================

async function processEntry(entry) {
  if (entry.sourceBytes === null || entry.mediaBox === null) { return; }
  entry.generation += 1;
  const generation = entry.generation;
  const settings = readSettings();
  const warnings = [];

  let profile = settings.profile;
  let profileNote = "";
  if (profile === null) {
    if (entry.detected !== null) {
      profile = entry.detected;
      profileNote = "erkannt: " + profile.name;
    } else {
      profile = LabelCropProfiles.PROFILES[0];
      profileNote = "nicht erkannt, angenommen: " + profile.name;
      warnings.push("Das Label wurde nicht als bekannter Typ erkannt. Bitte in der Vorschau prüfen, ob der Ausschnitt stimmt.");
    }
  } else {
    profileNote = "Profil: " + profile.name;
    if (!LabelCrop.pageSizeMatches(profile, entry.mediaBox)) {
      warnings.push("Die Seitengröße passt nicht zum Profil – der Ausschnitt sitzt womöglich falsch.");
    }
  }
  if (entry.rotation !== 0) {
    warnings.push("Die Quellseite ist um " + entry.rotation + "° gedreht; die Profil-Koordinaten könnten nicht passen.");
  }

  setEntryStatus(entry, "Wird verarbeitet …");
  try {
    const result = await LabelCrop.cropPdf(entry.sourceBytes, profile, settings.target, settings.options);
    if (generation !== entry.generation) { return; }   // inzwischen neue Einstellungen
    entry.result = result;
    entry.element.classList.remove("has-error");
    const first = result.pages[0];
    if (!first.layout.fits) {
      warnings.push("Der Ausschnitt passt nicht auf das Etikett und würde abgeschnitten – „Einpassen“ wählen oder ein größeres Format nehmen.");
    }
    renderEntryInfo(entry, profileNote, first, settings, warnings);
    await drawSourcePreview(entry, first.box, generation);
    await drawResultPreview(entry, generation);
    if (generation === entry.generation) { setEntryStatus(entry, ""); }
  } catch (error) {
    console.error(error);
    if (generation === entry.generation) {
      setEntryError(entry, "Zuschneiden fehlgeschlagen: " + error.message);
    }
  }
  updateResultsBar();
}

function formatMm(value) {
  return value.toFixed(1).replace(".", ",");
}

function describeSize(widthPt, heightPt) {
  return formatMm(LabelCrop.ptToMm(widthPt)) + " × " + formatMm(LabelCrop.ptToMm(heightPt)) + " mm";
}

function renderEntryInfo(entry, profileNote, pageInfo, settings, warnings) {
  const element = entry.element;
  let meta = "Quelle " + describeSize(entry.mediaBox.width, entry.mediaBox.height);
  if (entry.pageCount > 1) { meta += ", " + entry.pageCount + " Seiten"; }
  meta += " · " + profileNote;
  element.querySelector(".result-meta").textContent = meta;

  const layout = pageInfo.layout;
  let text = "Ergebnis " + describeSize(layout.pageWidth, layout.pageHeight);
  text += " · Maßstab " + Math.round(layout.scale * 100) + " %";
  if (layout.rotation === 0) {
    text += " · nicht gedreht";
  } else {
    text += " · " + layout.rotation + "° gedreht";
  }
  if (typeof settings.target.width === "number") {
    if (settings.options.placement === "top") {
      text += " · oben bündig";
    } else {
      text += " · zentriert";
    }
  }
  if (entry.pageCount > 1) { text += " · " + entry.pageCount + " Seiten"; }
  element.querySelector(".result-layout").textContent = text;

  const list = element.querySelector(".result-warnings");
  list.textContent = "";
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    list.appendChild(item);
  }
  list.hidden = warnings.length === 0;
}

function previewScale() {
  // pdf.js-Maßstab ist "Pixel je pt"; 1 mm sind 72/25,4 pt.
  return PREVIEW_PX_PER_MM / LabelCrop.mmToPt(1);
}

// Canvas auf CSS-Größe × Gerätepixel bringen, damit Text auch auf
// hochauflösenden Bildschirmen scharf bleibt. Angezeigt wird es in CSS-Pixeln.
function prepareCanvas(canvas, widthCss, heightCss) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(widthCss * dpr));
  canvas.height = Math.max(1, Math.round(heightCss * dpr));
  canvas.style.width = Math.round(widthCss) + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { ctx: ctx, dpr: dpr };
}

function isRenderCancelled(error) {
  return error !== null && typeof error === "object" && error.name === "RenderingCancelledException";
}

// Zeigt den Ausschnitt im Original samt Umgebung: außerhalb des Bereichs wird
// abgedunkelt. So sieht man sofort, ob etwas Wichtiges abgeschnitten würde.
async function drawSourcePreview(entry, box, generation) {
  const scale = previewScale();
  const context = LabelCrop.mmToPt(PREVIEW_CONTEXT_MM);
  const media = entry.mediaBox;
  const regionLeft = Math.max(media.x, box.left - context);
  const regionRight = Math.min(media.x + media.width, box.right + context);
  const regionTop = Math.min(media.y + media.height, box.top + context);
  const regionBottom = Math.max(media.y, box.bottom - context);

  // Viewport so verschieben, dass die linke obere Ecke der Region bei (0, 0) liegt;
  // dann reicht ein Canvas in Regionsgröße statt der ganzen A4-Seite.
  const base = entry.page.getViewport({ scale: scale });
  const origin = base.convertToViewportPoint(regionLeft, regionTop);
  const viewport = entry.page.getViewport({ scale: scale, offsetX: -origin[0], offsetY: -origin[1] });

  const widthCss = (regionRight - regionLeft) * scale;
  const heightCss = (regionTop - regionBottom) * scale;
  const canvas = entry.element.querySelector(".source-canvas");

  if (entry.sourceRenderTask !== null) { entry.sourceRenderTask.cancel(); }
  const prepared = prepareCanvas(canvas, widthCss, heightCss);
  const ctx = prepared.ctx;
  const dpr = prepared.dpr;
  const task = entry.page.render({ canvasContext: ctx, viewport: viewport, transform: [dpr, 0, 0, dpr, 0, 0], intent: RENDER_INTENT });
  entry.sourceRenderTask = task;
  try {
    await task.promise;
  } catch (error) {
    if (isRenderCancelled(error)) { return; }
    throw error;
  } finally {
    if (entry.sourceRenderTask === task) { entry.sourceRenderTask = null; }
  }
  if (generation !== entry.generation) { return; }

  const topLeft = viewport.convertToViewportPoint(box.left, box.top);
  const bottomRight = viewport.convertToViewportPoint(box.right, box.bottom);
  const boxWidth = bottomRight[0] - topLeft[0];
  const boxHeight = bottomRight[1] - topLeft[1];
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.beginPath();
  ctx.rect(0, 0, widthCss, heightCss);
  ctx.rect(topLeft[0], topLeft[1], boxWidth, boxHeight);
  ctx.fillStyle = "rgba(15, 27, 51, 0.45)";
  ctx.fill("evenodd");
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0f1b33";
  ctx.strokeRect(topLeft[0], topLeft[1], boxWidth, boxHeight);
  ctx.restore();
}

// Zeichnet die erste Seite der erzeugten PDF – das, was der Drucker bekommt.
async function drawResultPreview(entry, generation) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(entry.result.bytes) }).promise;
  try {
    if (generation !== entry.generation) { return; }
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: previewScale() });
    const canvas = entry.element.querySelector(".result-canvas");

    if (entry.resultRenderTask !== null) { entry.resultRenderTask.cancel(); }
    const prepared = prepareCanvas(canvas, viewport.width, viewport.height);
    const task = page.render({ canvasContext: prepared.ctx, viewport: viewport, transform: [prepared.dpr, 0, 0, prepared.dpr, 0, 0], intent: RENDER_INTENT });
    entry.resultRenderTask = task;
    try {
      await task.promise;
    } catch (error) {
      if (isRenderCancelled(error)) { return; }
      throw error;
    } finally {
      if (entry.resultRenderTask === task) { entry.resultRenderTask = null; }
    }

    let caption = "Ergebnis";
    if (entry.result.pages.length > 1) { caption += " (Seite 1 von " + entry.result.pages.length + ")"; }
    entry.element.querySelector(".result-caption").textContent = caption;
  } finally {
    doc.destroy();
  }
}

// ============================================================
// Drucken und speichern
// ============================================================

// Im Browser führt kein Weg am Druckdialog vorbei – aber man kann ihm das
// Papierformat vorgeben. Druckt man eine PDF, nimmt Chrome das Standardpapier
// des Druckers (A4) und legt das kleine Label oben links ab. Druckt man eine
// HTML-Seite mit @page-Größe, übernimmt Chrome diese Größe als Papierformat,
// sobald der Drucker das Format kennt. Deshalb wird jede Label-Seite mit
// 600 dpi gerastert und als HTML-Seite in exakter Etikettengröße gedruckt;
// der Data-Matrix-Code bleibt dabei für jeden Etikettendrucker scharf genug.
async function renderPagesForPrint(bytes) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      let scale = PRINT_DPI / 72;
      const longest = Math.max(base.width, base.height) * scale;
      if (longest > PRINT_MAX_PX) { scale = scale * PRINT_MAX_PX / longest; }
      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport, intent: RENDER_INTENT }).promise;
      pages.push({
        widthMm: LabelCrop.ptToMm(base.width),
        heightMm: LabelCrop.ptToMm(base.height),
        dataUrl: canvas.toDataURL("image/png"),
      });
    }
    return pages;
  } finally {
    doc.destroy();
  }
}

function mmText(value) {
  return value.toFixed(2) + "mm";
}

// HTML-Druckvorlage: @page in Etikettengröße ohne Rand, je Seite ein Bild in
// exakter Größe. Der Rahmen ist 0,2 mm niedriger als die Seite, damit
// Rundungen keine leere Folgeseite erzeugen.
function buildPrintHtml(pages) {
  const first = pages[0];
  let html = "<!DOCTYPE html><html lang=\"de\"><head><meta charset=\"utf-8\"><title>LabelCrop</title><style>"
    + "@page { size: " + mmText(first.widthMm) + " " + mmText(first.heightMm) + "; margin: 0; }"
    + " html, body { margin: 0; padding: 0; background: #fff; }"
    + " .page { display: block; overflow: hidden; break-after: page; page-break-after: always; }"
    + " .page:last-child { break-after: auto; page-break-after: auto; }"
    + " img { display: block; }"
    + "</style></head><body>";
  for (const page of pages) {
    html += "<div class=\"page\" style=\"width:" + mmText(page.widthMm) + ";height:" + mmText(page.heightMm - 0.2) + "\">"
      + "<img src=\"" + page.dataUrl + "\" alt=\"\" style=\"width:" + mmText(page.widthMm) + ";height:" + mmText(page.heightMm) + "\">"
      + "</div>";
  }
  return html + "</body></html>";
}

function removeFrameLater(frame, url) {
  // Der Druckdialog braucht den Rahmen noch eine Weile; danach aufräumen.
  setTimeout(function () {
    frame.remove();
    if (url !== null) { URL.revokeObjectURL(url); }
  }, PRINT_FRAME_LIFETIME_MS);
}

function createPrintFrame() {
  const frame = document.createElement("iframe");
  frame.className = "print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Druckvorlage";
  return frame;
}

function printHtml(html) {
  const frame = createPrintFrame();
  frame.addEventListener("load", function () {
    const win = frame.contentWindow;
    // Erst drucken, wenn alle Bilder entschlüsselt sind – sonst druckt Chrome leere Seiten.
    const images = Array.from(win.document.images);
    const decoded = images.map(function (image) {
      if (typeof image.decode === "function") { return image.decode().catch(function () { return null; }); }
      return Promise.resolve(null);
    });
    Promise.all(decoded).then(function () {
      win.focus();
      win.print();
      removeFrameLater(frame, null);
    });
  });
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

// Rückfall (z. B. Safari): die PDF selbst in einem unsichtbaren Rahmen drucken.
function printPdfDirect(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const frame = createPrintFrame();
  frame.addEventListener("load", function () {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      console.warn("Direktes Drucken nicht möglich, öffne die PDF stattdessen:", error);
      window.open(url, "_blank");
    }
    removeFrameLater(frame, url);
  });
  frame.src = url;
  document.body.appendChild(frame);
}

async function printPdf(bytes) {
  showMessage("Druck wird vorbereitet …", "info");
  try {
    const pages = await renderPagesForPrint(bytes);
    printHtml(buildPrintHtml(pages));
    hideMessage();
  } catch (error) {
    console.warn("Druckvorlage konnte nicht gebaut werden, drucke die PDF direkt:", error);
    hideMessage();
    printPdfDirect(bytes);
  }
}

function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Der Browser braucht die URL noch kurz für den Download, danach freigeben.
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}

function printEntry(entry) {
  if (entry.result === null) { return; }
  printPdf(entry.result.bytes);
}

function saveEntry(entry) {
  if (entry.result === null) { return; }
  downloadBytes(entry.result.bytes, LabelCrop.outputFileName(entry.name));
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Mehrere Downloads nacheinander; der Browser fragt beim ersten Mal, ob
// die Seite mehrere Dateien speichern darf.
async function saveAll() {
  for (const entry of entries) {
    if (entry.result !== null) {
      saveEntry(entry);
      await wait(400);
    }
  }
}

function pad2(value) {
  if (value < 10) { return "0" + value; }
  return String(value);
}

function dateStamp() {
  const now = new Date();
  return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
}

// Alle fertigen Labels als eine PDF, eine Seite je Label – für Stapel am Etikettendrucker.
async function mergedResults() {
  const list = [];
  for (const entry of entries) {
    if (entry.result !== null) { list.push(entry.result.bytes); }
  }
  if (list.length === 0) { return null; }
  return LabelCrop.mergePdfs(list);
}

async function saveMerged() {
  try {
    const bytes = await mergedResults();
    if (bytes === null) { return; }
    downloadBytes(bytes, "labels_" + dateStamp() + ".pdf");
  } catch (error) {
    console.error(error);
    showMessage("Zusammenführen fehlgeschlagen: " + error.message, "error");
  }
}

async function printAll() {
  try {
    const bytes = await mergedResults();
    if (bytes === null) { return; }
    printPdf(bytes);
  } catch (error) {
    console.error(error);
    showMessage("Drucken fehlgeschlagen: " + error.message, "error");
  }
}

// Testdruck (Konzept 6.4): einmal pro Drucker, um Format, Drehung und Skalierung zu prüfen.
async function testPrint(saveInstead) {
  const settings = readSettings();
  try {
    const bytes = await LabelCrop.testPrintPdf(settings.target, settings.options);
    if (saveInstead) {
      downloadBytes(bytes, "labelcrop-testdruck.pdf");
    } else {
      printPdf(bytes);
    }
  } catch (error) {
    console.error(error);
    showMessage("Testdruck fehlgeschlagen: " + error.message, "error");
  }
}

// ============================================================
// Liste verwalten, Meldungen
// ============================================================

function removeEntry(entry) {
  const index = entries.indexOf(entry);
  if (index >= 0) { entries.splice(index, 1); }
  entry.generation += 1;   // laufende Verarbeitung ins Leere laufen lassen
  if (entry.pdf !== null) { entry.pdf.destroy(); }
  entry.element.remove();
  updateResultsBar();
}

function clearAll() {
  for (const entry of entries.slice()) { removeEntry(entry); }
  hideMessage();
}

function updateResultsBar() {
  dom.resultsBar.hidden = entries.length === 0;
  let ready = 0;
  for (const entry of entries) {
    if (entry.result !== null) { ready += 1; }
  }
  let text = entries.length + " Datei";
  if (entries.length !== 1) { text += "en"; }
  if (ready !== entries.length) { text += " (" + ready + " fertig)"; }
  dom.resultCount.textContent = text;
  dom.printAll.disabled = ready === 0;
  dom.saveAll.disabled = ready === 0;
  dom.saveMerged.disabled = ready === 0;
}

function showMessage(text, kind) {
  dom.message.textContent = text;
  dom.message.className = "message " + kind;
  dom.message.hidden = false;
}

function hideMessage() {
  dom.message.hidden = true;
}

function setEntryStatus(entry, text) {
  const status = entry.element.querySelector(".result-status");
  status.textContent = text;
  status.hidden = text === "";
}

function setEntryError(entry, text) {
  entry.result = null;
  entry.element.classList.add("has-error");
  setEntryStatus(entry, text);
  updateResultsBar();
}

// ============================================================
// Ereignisse
// ============================================================

function openFileDialog() {
  dom.fileInput.click();
}

function bindEvents() {
  dom.dropzone.addEventListener("click", openFileDialog);
  dom.dropzone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFileDialog();
    }
  });
  dom.fileInput.addEventListener("change", function () {
    addFiles(dom.fileInput.files);
    dom.fileInput.value = "";   // dieselbe Datei soll erneut wählbar sein
  });

  // Ablegen überall auf der Seite: Sonst würde der Browser die PDF selbst öffnen.
  document.addEventListener("dragover", function (event) {
    event.preventDefault();
    document.body.classList.add("dragging");
  });
  document.addEventListener("dragleave", function (event) {
    if (event.relatedTarget === null) { document.body.classList.remove("dragging"); }
  });
  document.addEventListener("drop", function (event) {
    event.preventDefault();
    document.body.classList.remove("dragging");
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  });

  dom.profile.addEventListener("change", function () {
    updateSettingsVisibility();
    scheduleReprocess();
  });
  dom.target.addEventListener("change", onTargetChanged);
  dom.margin.addEventListener("input", function () { marginTouched = true; });
  dom.form.addEventListener("input", function () {
    updateProfileSummary();
    scheduleReprocess();
  });
  // "input" feuert bei Tastatureingaben, "change" bei Auswahlfeldern – beides
  // soll gemerkt werden. Erst nach onTargetChanged, damit der automatische
  // Rand mitgespeichert wird.
  dom.form.addEventListener("input", saveSettings);
  dom.form.addEventListener("change", saveSettings);
  dom.form.addEventListener("submit", function (event) { event.preventDefault(); });
  dom.resetSettings.addEventListener("click", resetSettings);
  dom.testPrint.addEventListener("click", function () { testPrint(false); });
  dom.testPrintSave.addEventListener("click", function () { testPrint(true); });

  dom.printAll.addEventListener("click", printAll);
  dom.saveAll.addEventListener("click", saveAll);
  dom.saveMerged.addEventListener("click", saveMerged);
  dom.clearAll.addEventListener("click", clearAll);
}

// ============================================================
// PWA: offline nutzbar, als App installierbar, PDFs per "Öffnen mit"
// ============================================================

function registerPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("service-worker.js")
        .then(function () { dom.pwaStatus.textContent = "v" + APP_VERSION + " ✓"; })
        .catch(function (error) { console.error("Service Worker Fehler:", error); });
    });
  }
  // Als installierte App bekommt LabelCrop Dateien direkt vom System
  // (siehe file_handlers im Manifest).
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async function (launchParams) {
      if (!launchParams.files || launchParams.files.length === 0) { return; }
      const files = [];
      for (const handle of launchParams.files) {
        files.push(await handle.getFile());
      }
      addFiles(files);
    });
  }
}

// ============================================================
// Start
// ============================================================

function init() {
  fillSelect(dom.profile, LabelCropProfiles.PROFILES, { id: AUTO_PROFILE_ID, name: "Automatisch erkennen" });
  fillSelect(dom.target, LabelCropProfiles.TARGETS, null);
  dom.pwaStatus.textContent = "v" + APP_VERSION;
  loadSettings();   // erst wenn die Auswahlfelder gefüllt sind
  updateSettingsVisibility();
  bindEvents();
  registerPwa();
}

init();

// Kleiner Haken für Tests und Automatisierung (z. B. Dateien per Skript hineingeben).
window.LabelCropApp = {
  addFiles: addFiles,
  entries: entries,
  readSettings: readSettings,
  printPdf: printPdf,
  renderPagesForPrint: renderPagesForPrint,
  buildPrintHtml: buildPrintHtml,
};
