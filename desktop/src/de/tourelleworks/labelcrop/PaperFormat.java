package de.tourelleworks.labelcrop;

import java.util.List;

/**
 * Etikettenformat des Druckers (Ziel). widthMm null = "Wie Ausschnitt" (Seite so
 * groß wie das Label), heightMm null = Endlosrolle (Länge ergibt sich aus dem Inhalt).
 * Dieselbe Liste wie TARGETS in profiles.js.
 */
public record PaperFormat(String id, String name, Double widthMm, Double heightMm) {

    public static final List<PaperFormat> ALL = List.of(
            new PaperFormat("source", "Wie Ausschnitt (Originalgröße)", null, null),
            new PaperFormat("thermo-100x150", "Etikettendrucker 100 × 150 mm (4 × 6 Zoll)", 100.0, 150.0),
            new PaperFormat("brother-62-endless", "Brother 62 mm Endlos (DK-22205)", 62.0, null),
            new PaperFormat("brother-62x100", "Brother 62 × 100 mm (DK-11202)", 62.0, 100.0),
            new PaperFormat("brother-102x152", "Brother 102 × 152 mm (DK-11241)", 102.0, 152.0),
            new PaperFormat("dymo-36x89", "DYMO 36 × 89 mm (99012)", 36.0, 89.0),
            new PaperFormat("dymo-54x101", "DYMO 54 × 101 mm (99014)", 54.0, 101.0),
            new PaperFormat("a6", "A6 (105 × 148 mm)", 105.0, 148.0),
            new PaperFormat("custom", "Eigene Größe …", 100.0, 50.0));

    public static PaperFormat byId(String id) {
        for (PaperFormat format : ALL) {
            if (format.id.equals(id)) {
                return format;
            }
        }
        return null;
    }

    public boolean isSourceSize() {
        return widthMm == null;
    }

    public boolean isEndless() {
        return widthMm != null && heightMm == null;
    }

    /** "100x150", "62x" (Endlos) oder "source" – das Format auf der Kommandozeile. */
    public static PaperFormat parse(String text) {
        String value = text.trim().toLowerCase();
        PaperFormat known = byId(value);
        if (known != null && !known.id.equals("custom")) {
            return known;
        }
        String[] parts = value.replace(',', '.').split("x", -1);
        if (parts.length != 2 || parts[0].isBlank()) {
            throw new IllegalArgumentException("Format nicht verstanden: " + text + " (z. B. 100x150, 62x für Endlos, source)");
        }
        double width = Double.parseDouble(parts[0]);
        Double height = parts[1].isBlank() ? null : Double.parseDouble(parts[1]);
        return new PaperFormat("custom", "Eigene Größe", width, height);
    }

    public String describe() {
        if (isSourceSize()) {
            return "wie Ausschnitt";
        }
        if (isEndless()) {
            return Units.formatMm(widthMm) + " mm Endlos";
        }
        return Units.formatMm(widthMm) + " × " + Units.formatMm(heightMm) + " mm";
    }

    @Override
    public String toString() {
        return name;
    }
}
