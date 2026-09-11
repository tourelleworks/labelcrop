package de.tourelleworks.labelcrop;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Label-Profil (Quelle): wo auf der Quellseite das Etikett liegt.
 * Maße in Millimetern ab der linken oberen Ecke – dieselben Werte wie in
 * profiles.js der Browser-App. Ein neuer Anbieter ist ein neuer Eintrag in ALL.
 *
 * @param detect Textmuster, die alle auf Seite 1 vorkommen müssen (leer = keine Erkennung)
 */
public record LabelProfile(
        String id,
        String name,
        double pageWidthMm,
        double pageHeightMm,
        double toleranceMm,
        double xMm,
        double yMm,
        double widthMm,
        double heightMm,
        double trimMm,
        List<Pattern> detect) {

    // "Deutsche Post" ist im PDF ein Logo-Pfad, kein Text. Eine Internetmarke
    // erkennt man an "IM" plus Datum und Preis ("IM 09.09.26 1,80").
    private static final List<Pattern> POST_PATTERNS = List.of(
            Pattern.compile("\\bIM\\b"),
            Pattern.compile("\\d{2}\\.\\d{2}\\.\\d{2}\\s+\\d+,\\d{2}"));

    public static final List<LabelProfile> ALL = List.of(
            // Enger Ausschnitt um den Inhalt (Referenz-Zuschnitt 36/85 pt, 216 × 114 pt).
            new LabelProfile("post-internetmarke-ebay", "Deutsche Post Internetmarke (eBay)",
                    210, 297, 2, 12.7, 30.0, 76.2, 40.2, 0, POST_PATTERNS),
            // Voller Bereich zwischen den vier Passkreuzen, 1 mm Beschnitt gegen Markenreste.
            new LabelProfile("post-internetmarke-ebay-marks", "Deutsche Post Internetmarke (eBay) – Passkreuz-Bereich",
                    210, 297, 2, 11.7, 29.05, 90, 47, 1, POST_PATTERNS));

    public static LabelProfile byId(String id) {
        for (LabelProfile profile : ALL) {
            if (profile.id.equals(id)) {
                return profile;
            }
        }
        return null;
    }

    /** Eigener Bereich, wenn kein Profil passt (Maße in mm ab links oben). */
    public static LabelProfile custom(double xMm, double yMm, double widthMm, double heightMm) {
        return new LabelProfile("custom", "Eigener Bereich", 0, 0, 0, xMm, yMm, widthMm, heightMm, 0, List.of());
    }

    public boolean pageSizeMatches(double pageWidthPt, double pageHeightPt) {
        if (pageWidthMm <= 0) {
            return true;
        }
        return Math.abs(Units.ptToMm(pageWidthPt) - pageWidthMm) <= toleranceMm
                && Math.abs(Units.ptToMm(pageHeightPt) - pageHeightMm) <= toleranceMm;
    }

    public boolean textMatches(String text) {
        for (Pattern pattern : detect) {
            if (!pattern.matcher(text).find()) {
                return false;
            }
        }
        return true;
    }

    /** Erstes Profil, dessen Seitengröße und Textmuster passen, sonst null. */
    public static LabelProfile detect(String text, double pageWidthPt, double pageHeightPt) {
        for (LabelProfile profile : ALL) {
            if (profile.detect.isEmpty()) {
                continue;
            }
            if (profile.pageSizeMatches(pageWidthPt, pageHeightPt) && profile.textMatches(text)) {
                return profile;
            }
        }
        return null;
    }

    @Override
    public String toString() {
        return name;   // so zeigt eine JComboBox direkt den Namen
    }
}
