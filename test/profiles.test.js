// ============================================================
// LabelCrop – test/profiles.test.js
//
// Eigene Label-Typen und Etikettenformate: anlegen, speichern, wieder
// laden, löschen, kaputte Daten überstehen, Rangfolge bei der Erkennung.
//
// Aufruf: node --test test/profiles.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert/strict");

const profiles = require("../profiles.js");
const LabelCrop = require("../cropper.js");

const A4 = { x: 0, y: 0, width: 595.275, height: 841.889 };

// Ersatz für localStorage: dieselben zwei Methoden, Daten bleiben im Objekt.
function fakeStorage(initial) {
  const data = {};
  if (initial) { data[profiles.STORAGE_KEY] = initial; }
  return {
    data: data,
    getItem: function (key) { if (key in data) { return data[key]; } return null; },
    setItem: function (key, value) { data[key] = value; },
  };
}

test("Ohne Speicher: nur eingebaute Einträge, 'Eigener Bereich' zuletzt", () => {
  profiles.load(null);
  const list = profiles.allProfiles();
  assert.equal(list[0].id, "post-internetmarke-ebay");
  assert.equal(list[list.length - 1].id, "custom");
  assert.equal(profiles.userProfiles().length, 0);
  const targets = profiles.allTargets();
  assert.equal(targets[0].id, "source");
  assert.equal(targets[targets.length - 1].id, "custom");
});

test("Eigener Label-Typ: anlegen, wiederfinden, nach Neuladen noch da, löschen", () => {
  const storage = fakeStorage(null);
  profiles.load(storage);
  const created = profiles.addProfile({ name: "  DHL Paketmarke ", source: { x: 10, y: 20, width: 100, height: 60 }, page: { width: 210, height: 297 } });
  assert.ok(created.id.startsWith("user-"));
  assert.equal(created.name, "DHL Paketmarke");
  assert.equal(created.userDefined, true);
  assert.equal(created.trim, 0);
  assert.equal(profiles.findProfile(created.id), created);
  // Eigene stehen zwischen den eingebauten und "Eigener Bereich".
  const list = profiles.allProfiles();
  assert.equal(list[list.length - 2].id, created.id);
  assert.equal(list[list.length - 1].id, "custom");

  // "Neuladen": derselbe Speicher, neue load()-Runde.
  profiles.load(storage);
  const reloaded = profiles.findProfile(created.id);
  assert.ok(reloaded !== null);
  assert.deepEqual(reloaded.source, { x: 10, y: 20, width: 100, height: 60 });
  assert.deepEqual(reloaded.page, { width: 210, height: 297, tolerance: 2 });

  assert.equal(profiles.removeProfile(created.id), true);
  assert.equal(profiles.findProfile(created.id), null);
  profiles.load(storage);
  assert.equal(profiles.findProfile(created.id), null, "Löschen ist gespeichert");
});

test("Eingebaute Einträge lassen sich nicht löschen", () => {
  profiles.load(fakeStorage(null));
  assert.equal(profiles.removeProfile("post-internetmarke-ebay"), false);
  assert.equal(profiles.removeProfile("custom"), false);
  assert.equal(profiles.removeTarget("thermo-100x150"), false);
  assert.equal(profiles.findProfile("post-internetmarke-ebay").name, "Deutsche Post Internetmarke (eBay)");
});

test("Eigenes Format: fest oder Endlos, löschen", () => {
  const storage = fakeStorage(null);
  profiles.load(storage);
  const fixed = profiles.addTarget({ name: "Mein Drucker", width: 100, height: 150 });
  const endless = profiles.addTarget({ name: "Rolle 58", width: 58, height: null });
  assert.equal(profiles.findTarget(fixed.id).height, 150);
  assert.equal(profiles.findTarget(endless.id).height, null);
  assert.equal(profiles.isUserDefined(profiles.findTarget(fixed.id)), true);
  assert.equal(profiles.isUserDefined(profiles.findTarget("a6")), false);
  // Endlos-Format verhält sich im Layout wie die eingebaute Endlosrolle.
  const box = LabelCrop.sourceBox(profiles.PROFILES[0], A4);
  const layout = LabelCrop.computeLayout(box, profiles.findTarget(endless.id), { margin: 0, rotate: "0" });
  assert.ok(Math.abs(LabelCrop.ptToMm(layout.pageWidth) - 58) < 0.01);
  profiles.load(storage);
  assert.equal(profiles.userTargets().length, 2);
  assert.equal(profiles.removeTarget(fixed.id), true);
  assert.equal(profiles.userTargets().length, 1);
});

test("Ungültige Werte werden abgewiesen, kaputte gespeicherte Daten ignoriert", () => {
  profiles.load(fakeStorage(null));
  assert.throws(() => profiles.addProfile({ name: "", source: { x: 0, y: 0, width: 10, height: 10 } }));
  assert.throws(() => profiles.addProfile({ name: "x", source: { x: 0, y: 0, width: -1, height: 10 } }));
  assert.throws(() => profiles.addTarget({ name: "x", width: 0, height: 10 }));

  const broken = JSON.stringify({
    profiles: [
      { id: "post-internetmarke-ebay", name: "Fälschung", source: { x: 0, y: 0, width: 1, height: 1 } },  // keine user-ID
      { id: "user-ok", name: "Gut", source: { x: 1, y: 2, width: 3, height: 4 } },
      { id: "user-bad", name: "Ohne Maße" },
      "unsinn",
    ],
    targets: [{ id: "user-t", name: "T", width: "breit" }, { id: "user-t2", name: "T2", width: 40, height: 0 }],
  });
  profiles.load(fakeStorage(broken));
  assert.deepEqual(profiles.userProfiles().map((p) => p.id), ["user-ok"]);
  assert.equal(profiles.findProfile("post-internetmarke-ebay").name, "Deutsche Post Internetmarke (eBay)");
  const targets = profiles.userTargets();
  assert.equal(targets.length, 1);
  assert.equal(targets[0].height, null, "Höhe 0 wird zu Endlos");

  profiles.load(fakeStorage("{kein json"));
  assert.equal(profiles.userProfiles().length, 0);
});

test("Erkennung: eingebautes Post-Profil gewinnt, eigener Typ greift bei anderen A4-Dateien", () => {
  profiles.load(fakeStorage(null));
  const own = profiles.addProfile({ name: "Hermes", source: { x: 5, y: 5, width: 100, height: 100 }, page: { width: 210, height: 297 } });
  const all = profiles.allProfiles();
  const postText = "Erika Mustermann A0 1234 5678 00 0000 9ABC IM 09.09.26 1,80 MAX MUSTER";
  assert.equal(LabelCrop.detectProfile(all, A4, postText).id, "post-internetmarke-ebay");
  assert.equal(LabelCrop.detectProfile(all, A4, "Hermes Paketschein 12345").id, own.id);
  const letter = { x: 0, y: 0, width: 612, height: 792 };
  assert.equal(LabelCrop.detectProfile(all, letter, "irgendwas"), null);
  // Ohne gespeicherte Seitengröße wird ein eigener Typ nie automatisch gewählt.
  const noPage = profiles.addProfile({ name: "Frei", source: { x: 0, y: 0, width: 50, height: 50 }, page: null });
  assert.equal(noPage.page, null);
});
