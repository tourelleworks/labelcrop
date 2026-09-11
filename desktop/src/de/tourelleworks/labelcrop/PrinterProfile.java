package de.tourelleworks.labelcrop;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Drucker-Profil (Ziel) aus Konzept 6.3: Druckername, Etikettenformat,
 * Drehung, Skalierung, Lage und Rand. Wird nach jedem Druck gespeichert,
 * damit die einmal ausprobierten Werte beim nächsten Start wieder gelten.
 *
 * @param rotate    "auto" (0° oder 90°, je nachdem, was passt) oder fest "0", "90", "180", "270"
 * @param scaleMode "fit" = auf das Etikett einpassen, "none" = 100 %
 * @param placement "center" = mittig, "top" = oben bündig am Etikettenanfang
 */
public record PrinterProfile(
        String printerName,
        PaperFormat format,
        String rotate,
        String scaleMode,
        String placement,
        double marginMm,
        String labelProfileId) {

    public static final PrinterProfile DEFAULT = new PrinterProfile(
            "", PaperFormat.byId("thermo-100x150"), "0", "fit", "top", 2.0, "auto");

    private static final Path FILE = Path.of(System.getProperty("user.home"), ".labelcrop", "printer.properties");

    public PrinterProfile withPrinter(String name) {
        return new PrinterProfile(name, format, rotate, scaleMode, placement, marginMm, labelProfileId);
    }

    public PrinterProfile withFormat(PaperFormat newFormat) {
        return new PrinterProfile(printerName, newFormat, rotate, scaleMode, placement, marginMm, labelProfileId);
    }

    public PrinterProfile withRotate(String value) {
        return new PrinterProfile(printerName, format, value, scaleMode, placement, marginMm, labelProfileId);
    }

    public PrinterProfile withScaleMode(String value) {
        return new PrinterProfile(printerName, format, rotate, value, placement, marginMm, labelProfileId);
    }

    public PrinterProfile withPlacement(String value) {
        return new PrinterProfile(printerName, format, rotate, scaleMode, value, marginMm, labelProfileId);
    }

    public PrinterProfile withMargin(double value) {
        return new PrinterProfile(printerName, format, rotate, scaleMode, placement, value, labelProfileId);
    }

    public PrinterProfile withLabelProfileId(String value) {
        return new PrinterProfile(printerName, format, rotate, scaleMode, placement, marginMm, value);
    }

    /** Kurzfassung für Statuszeile und Testdruck: "100 × 150 mm · Drehung 90° · Einpassen · oben bündig · Rand 2 mm". */
    public String describe() {
        String rotation = rotate.equals("auto") ? "automatisch" : rotate + "°";
        String scale = scaleMode.equals("none") ? "100 % (1:1)" : "Einpassen";
        String place = placement.equals("top") ? "oben bündig" : "zentriert";
        return format.describe() + " · Drehung " + rotation + " · " + scale + " · " + place
                + " · Rand " + Units.formatMm(marginMm) + " mm";
    }

    // --- Speichern und Laden (java.util.Properties, ohne weitere Abhängigkeiten) ---

    public static Path file() {
        return FILE;
    }

    public static PrinterProfile load() {
        if (!Files.exists(FILE)) {
            return DEFAULT;
        }
        Properties props = new Properties();
        try (InputStream in = Files.newInputStream(FILE)) {
            props.load(in);
        } catch (IOException e) {
            System.err.println("Drucker-Profil nicht lesbar, Vorgaben werden verwendet: " + e.getMessage());
            return DEFAULT;
        }
        PaperFormat format = PaperFormat.byId(props.getProperty("format", "thermo-100x150"));
        if (format == null) {
            format = DEFAULT.format;
        }
        if (format.id().equals("custom")) {
            format = new PaperFormat("custom", "Eigene Größe", parseDouble(props.getProperty("width"), 100.0),
                    parseNullable(props.getProperty("height")));
        }
        return new PrinterProfile(
                props.getProperty("printer", ""),
                format,
                props.getProperty("rotate", DEFAULT.rotate),
                props.getProperty("scale", DEFAULT.scaleMode),
                props.getProperty("placement", DEFAULT.placement),
                parseDouble(props.getProperty("margin"), DEFAULT.marginMm),
                props.getProperty("labelProfile", DEFAULT.labelProfileId));
    }

    public void save() throws IOException {
        Properties props = new Properties();
        props.setProperty("printer", printerName);
        props.setProperty("format", format.id());
        if (format.widthMm() != null) {
            props.setProperty("width", String.valueOf(format.widthMm()));
        }
        if (format.heightMm() != null) {
            props.setProperty("height", String.valueOf(format.heightMm()));
        }
        props.setProperty("rotate", rotate);
        props.setProperty("scale", scaleMode);
        props.setProperty("placement", placement);
        props.setProperty("margin", String.valueOf(marginMm));
        props.setProperty("labelProfile", labelProfileId);
        Files.createDirectories(FILE.getParent());
        try (OutputStream out = Files.newOutputStream(FILE)) {
            props.store(out, "LabelCrop Drucker-Profil");
        }
    }

    private static double parseDouble(String text, double fallback) {
        if (text == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(text.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static Double parseNullable(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        return parseDouble(text, 0);
    }
}
