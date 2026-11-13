// Aufrufzähler von tourelleworks.de, zweiter Teil. Den ersten Aufruf meldet das unsichtbare Bild in
// index.html beim Laden der Seite. Handys behalten Apps aber oft stundenlang im Hintergrund, statt sie
// neu zu laden. Darum zählt es auch als Öffnen, wenn die App nach mindestens 30 Minuten wieder nach
// vorn kommt oder der Browser die Seite aus seinem Zurück-Speicher holt. Gemeldet wird nur „geöffnet“,
// ohne Cookie und ohne Kennung.
(function () {
  const pixel = document.querySelector('img[src^="https://tourelleworks.de/zaehler/"]');
  if (pixel === null) {
    return;
  }
  const address = pixel.getAttribute("src").split("?")[0];
  const awayLongEnough = 30 * 60 * 1000;
  let hiddenSince = null;

  function report() {
    // Die Zeit im Link sorgt dafür, dass kein Zwischenspeicher die Anfrage abfängt.
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.src = address + "?wieder=" + Date.now();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      hiddenSince = Date.now();
      return;
    }
    if (hiddenSince !== null && Date.now() - hiddenSince >= awayLongEnough) {
      report();
    }
    hiddenSince = null;
  });

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      report();
    }
  });
})();
