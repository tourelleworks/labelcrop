// „Fehler melden“ für alle TourelleWorks-Apps. Jede App bindet diese Datei mit
// <script src="/fehler.js" data-app="<projekt>" defer> ein und setzt an ihren Menüeintrag das
// Attribut data-fehler-melden. Ein Tipp darauf öffnet das Meldefenster; die Meldung geht an
// tourelleworks.de, wo Cedric sie in der Verwaltung liest. Pflicht ist nur die Beschreibung.
// Gleiche Datei in allen Apps; die Vorlage liegt im Vault unter website/Fehlermeldungen.
(function () {
  const script = document.currentScript;
  const app = script.dataset.app || "unbekannt";
  let endpoint = "https://tourelleworks.de/api/fehler";
  if (script.dataset.endpoint) {
    endpoint = script.dataset.endpoint;
  }
  // Größere Bilder verkleinern wir vor dem Senden: Ein Bildschirmfoto bleibt so gut lesbar und klein.
  const imageSide = 1600;
  const imageLimit = 1400 * 1024;
  let dialog = null;

  function element(tag, attributes, children) {
    const node = document.createElement(tag);
    for (const name of Object.keys(attributes)) {
      if (name === "text") {
        node.textContent = attributes[name];
      } else if (attributes[name] === true) {
        node.setAttribute(name, "");
      } else if (attributes[name] !== false) {
        node.setAttribute(name, attributes[name]);
      }
    }
    for (const child of children || []) {
      node.append(child);
    }
    return node;
  }

  function build() {
    const description = element("textarea", {
      name: "description", rows: "5", maxlength: "4000", required: true,
      placeholder: "Zum Beispiel: Nach dem Tippen auf „Weiter“ bleibt der Bildschirm weiß.",
    });
    const image = element("input", { type: "file", name: "image", accept: "image/*" });
    const contact = element("input", { type: "text", name: "contact", maxlength: "200", autocomplete: "email", placeholder: "E-Mail oder Name" });
    const tech = element("input", { type: "checkbox", name: "tech", checked: true });
    // Für Menschen unsichtbar; Spam-Programme füllen es aus und werden dann still verworfen.
    const trap = element("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", class: "twf-trap" });
    const status = element("p", { class: "twf-status", role: "status" });
    const send = element("button", { type: "submit", class: "twf-send", text: "Senden" });
    const cancel = element("button", { type: "button", class: "twf-cancel", text: "Abbrechen" });

    const form = element("form", { class: "twf-form", method: "dialog" }, [
      element("h2", { text: "Fehler melden" }),
      element("p", { class: "twf-intro", text: "Etwas klappt nicht? Beschreib kurz, was passiert ist. Danke fürs Melden!" }),
      element("label", {}, [element("span", { text: "Was ist passiert?" }), description]),
      element("label", {}, [element("span", { text: "Bildschirmfoto (freiwillig)" }), image]),
      element("label", {}, [element("span", { text: "Kontakt für Rückfragen (freiwillig)" }), contact]),
      element("label", { class: "twf-check" }, [tech, element("span", { text: "Technische Angaben mitschicken (Gerät, Browser, Seite)" })]),
      trap,
      status,
      element("div", { class: "twf-buttons" }, [cancel, send]),
    ]);
    const box = element("dialog", { class: "twf-dialog", "aria-labelledby": "twf-title" }, [form]);
    form.querySelector("h2").id = "twf-title";

    // Tastendrücke und Tipps im Fenster gehören dem Fenster: Sonst tippt man z. B. im Wortsuchspiel
    // beim Schreiben der Beschreibung gleichzeitig Buchstaben ins Spiel.
    for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click", "wheel"]) {
      box.addEventListener(type, (event) => event.stopPropagation());
    }
    cancel.addEventListener("click", () => box.close());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });

    async function submit() {
      if (description.value.trim() === "") {
        say("Bitte beschreib kurz, was passiert ist.", true);
        description.focus();
        return;
      }
      send.disabled = true;
      say("Wird gesendet …", false);
      const data = { app: app, description: description.value, contact: contact.value, website: trap.value };
      if (tech.checked) {
        data.tech = technicalDetails();
      }
      try {
        if (image.files.length > 0) {
          data.image = await shrink(image.files[0]);
        }
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "omit",
        });
        let result = {};
        try {
          result = await response.json();
        } catch (error) {
          result = {};
        }
        if (!response.ok) {
          throw new Error(result.error || "Senden hat nicht geklappt (Fehler " + response.status + ").");
        }
        form.reset();
        tech.checked = true;
        say("Danke! Die Meldung ist angekommen.", false);
        send.disabled = false;
        cancel.textContent = "Schließen";
      } catch (error) {
        send.disabled = false;
        let message = error.message;
        if (error instanceof TypeError) {
          message = "Keine Verbindung. Bitte prüf dein Internet und versuch es noch einmal.";
        }
        say(message, true);
      }
    }

    function say(text, problem) {
      status.textContent = text;
      status.classList.toggle("twf-problem", problem);
    }

    box.addEventListener("close", () => {
      say("", false);
      cancel.textContent = "Abbrechen";
    });
    document.body.append(box);
    return box;
  }

  function technicalDetails() {
    const details = {
      page: location.host + location.pathname,
      title: document.title,
      browser: navigator.userAgent,
      screen: window.innerWidth + " × " + window.innerHeight + " (Faktor " + window.devicePixelRatio + ")",
      language: navigator.language,
      installed: window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      online: navigator.onLine,
      time: new Date().toString(),
    };
    if (script.dataset.version) {
      details.version = script.dataset.version;
    }
    return details;
  }

  // Bild auf höchstens 1600 Pixel Kantenlänge als JPEG verkleinern. Kann der Browser das Format
  // nicht lesen (z. B. HEIC außerhalb von Safari), geht das Original, wenn es klein genug ist.
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, imageSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      while (blob !== null && blob.size > imageLimit && quality > 0.4) {
        quality -= 0.15;
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      }
      if (blob !== null) {
        return readAsDataUrl(blob);
      }
    } catch (error) {
      // Weiter unten mit dem Original versuchen.
    }
    if (file.size > imageLimit || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      throw new Error("Das Bild ist zu groß oder hat ein unbekanntes Format. Bitte ein JPG oder PNG nehmen.");
    }
    return readAsDataUrl(file);
  }

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Das Bild ließ sich nicht lesen."));
      reader.readAsDataURL(blob);
    });
  }

  function open() {
    if (dialog === null) {
      dialog = build();
    }
    if (!dialog.open) {
      dialog.showModal();
      dialog.querySelector("textarea").focus();
    }
  }

  // Jeder Menüeintrag mit data-fehler-melden öffnet das Fenster, auch wenn die App ihn erst später
  // zeichnet. Gelauscht wird schon auf dem Hinweg (true), weil manche App-Menüs Klicks selbst abfangen.
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const trigger = event.target.closest("[data-fehler-melden]");
    if (trigger !== null) {
      event.preventDefault();
      open();
    }
  }, true);
  window.TourelleWorksFehler = { open: open };
})();
