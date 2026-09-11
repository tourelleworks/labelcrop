// ============================================================
// LabelCrop – test/crop-sample.js
//
// Schneidet eine echte Label-PDF mit dem Kern (cropper.js) zu und prüft
// das Ergebnis – ohne Browser, direkt mit Node und derselben pdf-lib aus
// vendor/. Beispieldateien enthalten Adressen und gehören NICHT ins
// Repository (test/samples/ steht in .gitignore).
//
// Aufruf:
//   node test/crop-sample.js "test/samples/eBay label 01-15158-57952.pdf"
//   node test/crop-sample.js <eingabe.pdf> [ausgabe.pdf] [ziel-id] [profil-id]
//
// ziel-id z. B. source, brother-62-endless, brother-62x100 (siehe profiles.js)
// ============================================================

const fs = require("fs");
const path = require("path");

globalThis.PDFLib = require("../vendor/pdf-lib.min.js");
const profiles = require("../profiles.js");
const LabelCrop = require("../cropper.js");

function mm(pt) {
  return LabelCrop.ptToMm(pt).toFixed(2);
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  if (!inputPath) {
    console.error("Aufruf: node test/crop-sample.js <eingabe.pdf> [ausgabe.pdf] [ziel-id] [profil-id]");
    process.exit(2);
  }

  let targetId = "source";
  if (args[2]) { targetId = args[2]; }
  let profileId = profiles.PROFILES[0].id;
  if (args[3]) { profileId = args[3]; }

  const profile = profiles.findProfile(profileId);
  const target = profiles.findTarget(targetId);
  if (profile === null || target === null) {
    console.error("Unbekanntes Profil oder Zielformat:", profileId, targetId);
    process.exit(2);
  }

  let outputPath = args[1];
  if (!outputPath) {
    outputPath = path.join(path.dirname(inputPath), LabelCrop.outputFileName(path.basename(inputPath)));
  }

  const sourceBytes = new Uint8Array(fs.readFileSync(inputPath));
  const result = await LabelCrop.cropPdf(sourceBytes, profile, target, LabelCrop.DEFAULT_OPTIONS);
  fs.writeFileSync(outputPath, result.bytes);

  // Prüfen: Ergebnis wieder laden. Die MediaBox jeder Seite muss der berechneten
  // Zielgröße entsprechen – das ist der Unterschied zum CropBox-Trick.
  const check = await PDFLib.PDFDocument.load(result.bytes);
  let allGood = true;
  check.getPages().forEach(function (page, i) {
    const box = page.getMediaBox();
    const layout = result.pages[i].layout;
    const good = Math.abs(box.width - layout.pageWidth) < 0.01
              && Math.abs(box.height - layout.pageHeight) < 0.01
              && box.x === 0 && box.y === 0;
    let verdict = "OK";
    if (!good) { verdict = "FEHLER"; allGood = false; }
    console.log(
      "Seite " + (i + 1) + ": " + mm(box.width) + " × " + mm(box.height) + " mm, " +
      "Maßstab " + Math.round(layout.scale * 100) + " %, Drehung " + layout.rotation + "° – " + verdict
    );
  });
  console.log("Profil: " + profile.name + " · Ziel: " + target.name);
  console.log("geschrieben: " + outputPath + " (" + result.bytes.length + " Bytes)");
  if (!allGood) { process.exit(1); }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
