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

  const DEFAULT_OPTIONS = {
    scaleMode: "fit",   // "fit" = auf Zielformat einpassen, "none" = 1:1
    rotate: "auto",     // "auto", "none" oder "rotate" (90° im Uhrzeigersinn)
    margin: 0,          // Abstand zum Seitenrand in mm
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

  function rotationsFor(mode) {
    if (mode === "none") { return [0]; }
    if (mode === "rotate") { return [90]; }
    return [0, 90];
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
      const candidate = layoutFor(box, target, opts.scaleMode, margin, rotation);
      if (best === null || isBetter(candidate, best)) { best = candidate; }
    }
    return best;
  }

  function layoutFor(box, target, scaleMode, margin, rotation) {
    let contentWidth = box.width;
    let contentHeight = box.height;
    if (rotation === 90) {
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
    const x = (pageWidth - placedWidth) / 2;   // zentriert auf der Zielseite
    const y = (pageHeight - placedHeight) / 2;

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
    outputFileName: outputFileName,
  };
})();

// In Node (Tests) als Modul bereitstellen; im Browser genügt die globale Konstante.
if (typeof module !== "undefined" && module.exports) {
  module.exports = LabelCrop;
}
