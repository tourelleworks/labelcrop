// ============================================================
// LabelCrop – cropper.js
//
// Der Kern: schneidet den Label-Bereich wirklich aus der Seite aus.
// Kein DOM, keine Oberfläche – nur Geometrie und pdf-lib. Dadurch
// lässt sich dieser Teil auch mit Node testen (siehe test/).
//
// Warum kein CropBox-Trick: Eine CropBox ist nur ein Anzeige-Hinweis
// für den Viewer; Druckertreiber ignorieren sie gern und drucken die
// volle A4-Seite. Hier wird stattdessen eine neue Seite in Zielgröße
// angelegt und der Inhalt der Quellseite als Form-XObject hinein-
// gezeichnet – vektoriell, verlustfrei, mit echter MediaBox in
// Labelgröße. Es bleibt nichts übrig, das ein Drucker ignorieren könnte.
// ============================================================

const LabelCrop = (function () {

  const PT_PER_MM = 72 / 25.4;
  const EPSILON = 0.01; // Toleranz in pt für "passt gerade so"

  // Das "Drucker-Profil" aus dem Konzept: Zielformat (target) plus diese Optionen.
  const DEFAULT_OPTIONS = {
    scaleMode: "fit",     // "fit" = auf Zielformat einpassen, "none" = 1:1
    rotate: "auto",       // "auto" (0° oder 90°, je nachdem, was passt) oder fest "0", "90", "180", "270"
    placement: "center",  // "center" = mittig auf der Zielseite, "top" = oben bündig (Etikettenanfang)
    margin: 0,            // Abstand zum Seitenrand in mm
  };

  function mmToPt(mm) { return mm * PT_PER_MM; }
  function ptToMm(pt) { return pt / PT_PER_MM; }

  // pdf-lib wird im Browser als globales Skript geladen, in Node legt der
  // Test es auf globalThis. Der späte Zugriff macht cropper.js unabhängig
  // von der Ladereihenfolge.
  function pdfLib() {
    if (typeof PDFLib === "undefined") {
      throw new Error("pdf-lib ist nicht geladen.");
    }
    return PDFLib;
  }

  function withDefaults(options) {
    const result = {};
    for (const key in DEFAULT_OPTIONS) {
      result[key] = DEFAULT_OPTIONS[key];
    }
    if (options) {
      for (const key in options) {
        if (options[key] !== undefined) { result[key] = options[key]; }
      }
    }
    return result;
  }

  // ------------------------------------------------------------
  // Geometrie
  // ------------------------------------------------------------

  // Quellbereich in PDF-Punkten (Ursprung links unten), abgeleitet aus dem
  // Profil (mm ab links oben) und der MediaBox der Seite {x, y, width, height}.
  // Hier passiert die einzige Umrechnung "von oben" nach "von unten".
  function sourceBox(profile, mediaBox) {
    let trim = 0;
    if (typeof profile.trim === "number") { trim = profile.trim; }
    const src = profile.source;
    const pageTop = mediaBox.y + mediaBox.height;
    const left = mediaBox.x + mmToPt(src.x + trim);
    const right = mediaBox.x + mmToPt(src.x + src.width - trim);
    const top = pageTop - mmToPt(src.y + trim);
    const bottom = pageTop - mmToPt(src.y + src.height - trim);
    return { left: left, bottom: bottom, right: right, top: top, width: right - left, height: top - bottom };
  }

  // Drehung laut Konzept bewusst ein fester Wert je Drucker (0/90/180/270);
  // "auto" bleibt als Komfort für "Wie Ausschnitt" und Endlosrollen.
  // "none"/"rotate" sind alte gespeicherte Werte aus Version 0.2.
  function rotationsFor(mode) {
    const value = String(mode);
    if (value === "auto") { return [0, 90]; }
    if (value === "none" || value === "0") { return [0]; }
    if (value === "rotate" || value === "90") { return [90]; }
    if (value === "180") { return [180]; }
    if (value === "270") { return [270]; }
    return [0, 90];
  }

  function isSideways(rotation) {
    return rotation === 90 || rotation === 270;
  }

  // Bei "auto" gewinnt die Drehung, mit der das Label auf die Seite passt –
  // und bei gleichem Ergebnis die mit dem größeren Maßstab (lesbarer).
  function isBetter(candidate, current) {
    if (candidate.fits !== current.fits) { return candidate.fits; }
    return candidate.scale > current.scale + 1e-9;
  }

  // Berechnet Seitengröße, Maßstab, Drehung und Position des Ausschnitts
  // auf der Zielseite. Reine Geometrie – ohne PDF testbar.
  function computeLayout(box, target, options) {
    const opts = withDefaults(options);
    const margin = mmToPt(opts.margin);
    let best = null;
    for (const rotation of rotationsFor(opts.rotate)) {
      const candidate = layoutFor(box, target, opts.scaleMode, margin, rotation, opts.placement);
      if (best === null || isBetter(candidate, best)) { best = candidate; }
    }
    return best;
  }

  function layoutFor(box, target, scaleMode, margin, rotation, placement) {
    let contentWidth = box.width;
    let contentHeight = box.height;
    if (isSideways(rotation)) {
      contentWidth = box.height;
      contentHeight = box.width;
    }

    const hasWidth = typeof target.width === "number";
    const hasHeight = typeof target.height === "number";
    let scale = 1;
    let pageWidth;
    let pageHeight;
    let fits = true;

    if (!hasWidth) {
      // "Wie Ausschnitt": Die Seite wächst um den Inhalt herum, Maßstab 1:1.
      pageWidth = contentWidth + 2 * margin;
      pageHeight = contentHeight + 2 * margin;
    } else {
      pageWidth = mmToPt(target.width);
      const availableWidth = pageWidth - 2 * margin;
      if (hasHeight) {
        pageHeight = mmToPt(target.height);
        const availableHeight = pageHeight - 2 * margin;
        if (scaleMode === "fit") {
          scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
        }
        fits = contentWidth * scale <= availableWidth + EPSILON
            && contentHeight * scale <= availableHeight + EPSILON;
      } else {
        // Endlosrolle: Breite fest, Höhe ergibt sich aus dem Inhalt.
        if (scaleMode === "fit") {
          scale = availableWidth / contentWidth;
        }
        pageHeight = contentHeight * scale + 2 * margin;
        fits = contentWidth * scale <= availableWidth + EPSILON;
      }
    }

    const placedWidth = contentWidth * scale;
    const placedHeight = contentHeight * scale;
    const x = (pageWidth - placedWidth) / 2;   // waagerecht immer zentriert
    let y = (pageHeight - placedHeight) / 2;
    if (placement === "top" && hasWidth) {
      // Oben bündig: das Label beginnt am Etikettenanfang, der Rest bleibt frei.
      y = pageHeight - margin - placedHeight;
    }

    return {
      rotation: rotation,
      scale: scale,
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      x: x,
      y: y,
      placedWidth: placedWidth,
      placedHeight: placedHeight,
      fits: fits,
      matrix: matrixFor(box, scale, rotation, x, y),
    };
  }

  // Affine Matrix [a b c d e f], die den Quellbereich (Koordinaten der
  // Quellseite) auf die Zielseite abbildet:
  //   (px, py) -> (a*px + c*py + e, b*px + d*py + f)
  // Sie wird als /Matrix des Form-XObjects eingetragen, der Inhalt landet
  // also ohne weitere Verschiebung an der richtigen Stelle.
  function matrixFor(box, s, rotation, x, y) {
    if (rotation === 90) {
      // 90° im Uhrzeigersinn: (px, py) -> (s*py, -s*px). Danach so verschieben,
      // dass die linke untere Ecke des gedrehten Bereichs bei (x, y) liegt.
      return [0, -s, s, 0, x - s * box.bottom, y + s * box.right];
    }
    if (rotation === 180) {
      // Kopfüber: (px, py) -> (-s*px, -s*py).
      return [-s, 0, 0, -s, x + s * box.right, y + s * box.top];
    }
    if (rotation === 270) {
      // 90° gegen den Uhrzeigersinn: (px, py) -> (-s*py, s*px).
      return [0, s, -s, 0, x + s * box.top, y - s * box.left];
    }
    return [s, 0, 0, s, x - s * box.left, y - s * box.bottom];
  }

  // ------------------------------------------------------------
  // Profil-Erkennung
  // ------------------------------------------------------------

  function pageSizeMatches(profile, mediaBox) {
    if (!profile.page) { return true; }
    const widthMm = ptToMm(mediaBox.width);
    const heightMm = ptToMm(mediaBox.height);
    const tolerance = profile.page.tolerance;
    return Math.abs(widthMm - profile.page.width) <= tolerance
        && Math.abs(heightMm - profile.page.height) <= tolerance;
  }

  function textMatches(profile, text) {
    if (!profile.detect || !profile.detect.textAll) { return true; }
    for (const pattern of profile.detect.textAll) {
      if (!pattern.test(text)) { return false; }
    }
    return true;
  }

  // Liefert das erste Profil, dessen Seitengröße und Textmuster passen, sonst null.
  function detectProfile(profiles, mediaBox, text) {
    for (const profile of profiles) {
      if (profile.custom) { continue; }
      if (pageSizeMatches(profile, mediaBox) && textMatches(profile, text)) {
        return profile;
      }
    }
    return null;
  }

  // ------------------------------------------------------------
  // PDF-Operationen
  // ------------------------------------------------------------

  // Schneidet alle Seiten der Quell-PDF zu und liefert eine neue PDF mit
  // einer Seite je Quellseite (ein Label pro Seite). Ergebnis:
  // { bytes: Uint8Array, pages: [{ index, mediaBox, box, layout }] }
  async function cropPdf(sourceBytes, profile, target, options) {
    const lib = pdfLib();
    const sourceDoc = await lib.PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const outputDoc = await lib.PDFDocument.create();
    outputDoc.setProducer("LabelCrop");
    outputDoc.setCreator("LabelCrop (labelcrop.tourelleworks.de)");

    const pages = [];
    const count = sourceDoc.getPageCount();
    for (let i = 0; i < count; i++) {
      const sourcePage = sourceDoc.getPage(i);
      const mediaBox = sourcePage.getMediaBox();
      const box = sourceBox(profile, mediaBox);
      const layout = computeLayout(box, target, options);

      // embedPage kopiert Inhalt, Schriften und Bilder der Quellseite in ein
      // Form-XObject; die BBox schneidet alles außerhalb des Bereichs ab.
      const embedded = await outputDoc.embedPage(
        sourcePage,
        { left: box.left, bottom: box.bottom, right: box.right, top: box.top },
        layout.matrix
      );
      const page = outputDoc.addPage([layout.pageWidth, layout.pageHeight]);
      page.drawPage(embedded);

      pages.push({ index: i, mediaBox: mediaBox, box: box, layout: layout });
    }

    const bytes = await outputDoc.save();
    return { bytes: bytes, pages: pages };
  }

  // Hängt mehrere PDFs zu einer zusammen (z. B. alle Labels eines Stapels).
  async function mergePdfs(list) {
    const lib = pdfLib();
    const outputDoc = await lib.PDFDocument.create();
    outputDoc.setProducer("LabelCrop");
    for (const bytes of list) {
      const doc = await lib.PDFDocument.load(bytes);
      const copied = await outputDoc.copyPages(doc, doc.getPageIndices());
      for (const page of copied) { outputDoc.addPage(page); }
    }
    return outputDoc.save();
  }

  // ------------------------------------------------------------
  // Testdruck (Konzept 6.4): ein Etikett mit Rahmen am Rand, Pfeil zum
  // Seitenanfang, 50-mm-Maßlinien und den aktuellen Profilwerten. Nach dem
  // Druck sieht man sofort, ob Papierformat, Skalierung und Drehung stimmen.
  // ------------------------------------------------------------

  function testPrintPageSize(target) {
    // Ohne festes Format (Wie Ausschnitt) 100 × 150 mm annehmen; bei
    // Endlosrollen die Breite der Rolle und 100 mm Länge.
    let widthMm = 100;
    let heightMm = 150;
    if (typeof target.width === "number") {
      widthMm = target.width;
      heightMm = 100;
      if (typeof target.height === "number") { heightMm = target.height; }
    }
    return { widthMm: widthMm, heightMm: heightMm };
  }

  function describeOptions(opts) {
    let rotation = "automatisch";
    if (String(opts.rotate) !== "auto") {
      rotation = String(opts.rotate).replace("none", "0").replace("rotate", "90") + "°";
    }
    let scale = "Einpassen";
    if (opts.scaleMode === "none") { scale = "100 % (1:1)"; }
    let placement = "zentriert";
    if (opts.placement === "top") { placement = "oben bündig"; }
    return { rotation: rotation, scale: scale, placement: placement };
  }

  async function testPrintPdf(target, options) {
    const lib = pdfLib();
    const opts = withDefaults(options);
    const size = testPrintPageSize(target);
    const W = mmToPt(size.widthMm);
    const H = mmToPt(size.heightMm);
    const doc = await lib.PDFDocument.create();
    doc.setProducer("LabelCrop");
    doc.setTitle("LabelCrop Testdruck");
    const page = doc.addPage([W, H]);
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
    const ink = lib.rgb(0, 0, 0);
    const mm = mmToPt;

    // Schriftgröße an die Etikettbreite anpassen (schmale Rollen, große Etiketten).
    const base = Math.max(5, Math.min(9, size.widthMm / 11));
    const lineWidth = 0.6;

    // Rahmen 1 mm innerhalb der Kante: fehlt eine Seite, schneidet der Treiber ab.
    page.drawRectangle({ x: mm(1), y: mm(1), width: W - mm(2), height: H - mm(2), borderColor: ink, borderWidth: lineWidth });

    // Kopf
    page.drawText("LabelCrop Testdruck", { x: mm(5), y: H - mm(5) - base * 1.2, size: base * 1.3, font: bold, color: ink });
    const today = new Date();
    const stamp = today.getFullYear() + "-" + pad2(today.getMonth() + 1) + "-" + pad2(today.getDate());
    page.drawText(stamp, { x: W - mm(5) - font.widthOfTextAtSize(stamp, base), y: H - mm(5) - base * 1.2, size: base, font: font, color: ink });

    // Schmale Etiketten (z. B. 36 mm): Pfeil kürzer, Profilwerte darunter statt daneben.
    const narrow = size.widthMm < 60;

    // Pfeil zum Seitenanfang: Wo zeigt er nach dem Druck hin? Danach die Drehung wählen.
    let ax = mm(12);
    let aTop = H - mm(16);
    let aBottom = mm(28);
    if (narrow) {
      ax = mm(6);
      aTop = H - mm(14);
      aBottom = aTop - mm(20);
    }
    page.drawLine({ start: { x: ax, y: aBottom }, end: { x: ax, y: aTop }, thickness: lineWidth * 2, color: ink });
    page.drawLine({ start: { x: ax, y: aTop }, end: { x: ax - mm(3), y: aTop - mm(5) }, thickness: lineWidth * 2, color: ink });
    page.drawLine({ start: { x: ax, y: aTop }, end: { x: ax + mm(3), y: aTop - mm(5) }, thickness: lineWidth * 2, color: ink });
    page.drawText("OBEN", { x: ax + mm(4), y: aTop - mm(5), size: base, font: bold, color: ink });
    page.drawText("Seitenanfang", { x: ax + mm(4), y: aTop - mm(5) - base * 1.3, size: base * 0.85, font: font, color: ink });

    // Waagerechte Maßlinie: 50 mm (kürzer, wenn das Etikett schmaler ist).
    const hLen = Math.min(50, size.widthMm - 10);
    const hx = (W - mm(hLen)) / 2;
    const hy = mm(12);
    page.drawLine({ start: { x: hx, y: hy }, end: { x: hx + mm(hLen), y: hy }, thickness: lineWidth, color: ink });
    page.drawLine({ start: { x: hx, y: hy - mm(2) }, end: { x: hx, y: hy + mm(2) }, thickness: lineWidth, color: ink });
    page.drawLine({ start: { x: hx + mm(hLen), y: hy - mm(2) }, end: { x: hx + mm(hLen), y: hy + mm(2) }, thickness: lineWidth, color: ink });
    const hLabel = hLen + " mm";
    page.drawText(hLabel, { x: (W - font.widthOfTextAtSize(hLabel, base)) / 2, y: hy + mm(3), size: base, font: font, color: ink });

    // Senkrechte Maßlinie am rechten Rand – auf schmalen Etiketten weglassen.
    if (!narrow) {
      const vLen = Math.min(50, size.heightMm - 40);
      const vx = W - mm(8);
      const vy = mm(28);
      page.drawLine({ start: { x: vx, y: vy }, end: { x: vx, y: vy + mm(vLen) }, thickness: lineWidth, color: ink });
      page.drawLine({ start: { x: vx - mm(2), y: vy }, end: { x: vx + mm(2), y: vy }, thickness: lineWidth, color: ink });
      page.drawLine({ start: { x: vx - mm(2), y: vy + mm(vLen) }, end: { x: vx + mm(2), y: vy + mm(vLen) }, thickness: lineWidth, color: ink });
      page.drawText(vLen + " mm", { x: vx - mm(3), y: vy + mm(vLen / 2) - base * 1.5, size: base, font: font, rotate: lib.degrees(90), color: ink });
    }

    // Profilwerte: rechts neben dem Pfeil, auf schmalen Etiketten darunter.
    const described = describeOptions(opts);
    const lines = [
      "Format: " + formatMm(size.widthMm) + " × " + formatMm(size.heightMm) + " mm",
      "Drehung: " + described.rotation,
      "Skalierung: " + described.scale,
      "Lage: " + described.placement,
      "Rand: " + formatMm(opts.margin) + " mm",
    ];
    let tx = mm(24);
    let ty = H - mm(24);
    if (narrow) {
      tx = mm(5);
      ty = aBottom - mm(4);
    }
    for (const line of lines) {
      if (ty < hy + mm(8)) { break; }   // lieber weglassen als über die Maßlinie schreiben
      page.drawText(line, { x: tx, y: ty, size: base, font: font, color: ink });
      ty -= base * 1.5;
    }

    // Prüfhinweise unten – nur wenn Platz ist.
    const hints = [
      "Rahmen abgeschnitten? Papierformat im Treiber = " + formatMm(size.widthMm) + " × " + formatMm(size.heightMm) + " mm.",
      "Linie nicht " + hLen + " mm lang? Skalierung im Treiber auf 100 %.",
      "Pfeil zeigt nicht zum Etikettenanfang? Drehung im Profil ändern.",
    ];
    let hy2 = ty - base;
    for (const hint of hints) {
      if (hy2 < hy + mm(8) || font.widthOfTextAtSize(hint, base * 0.8) > W - tx - mm(5)) { break; }
      page.drawText(hint, { x: tx, y: hy2, size: base * 0.8, font: font, color: ink });
      hy2 -= base * 1.3;
    }

    return doc.save();
  }

  function pad2(value) {
    if (value < 10) { return "0" + value; }
    return String(value);
  }

  function formatMm(value) {
    return String(Math.round(value * 10) / 10).replace(".", ",");
  }

  // "eBay label 123.pdf" -> "eBay label 123_label.pdf"
  function outputFileName(inputName) {
    let base = inputName;
    if (/\.pdf$/i.test(base)) { base = base.slice(0, -4); }
    return base + "_label.pdf";
  }

  return {
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    mmToPt: mmToPt,
    ptToMm: ptToMm,
    sourceBox: sourceBox,
    computeLayout: computeLayout,
    pageSizeMatches: pageSizeMatches,
    textMatches: textMatches,
    detectProfile: detectProfile,
    cropPdf: cropPdf,
    mergePdfs: mergePdfs,
    testPrintPdf: testPrintPdf,
    testPrintPageSize: testPrintPageSize,
    describeOptions: describeOptions,
    outputFileName: outputFileName,
  };
})();

// In Node (Tests) als Modul bereitstellen; im Browser genügt die globale Konstante.
if (typeof module !== "undefined" && module.exports) {
  module.exports = LabelCrop;
}
