package de.tourelleworks.labelcrop;

/** Umrechnung zwischen Millimetern und PDF-Punkten (1 pt = 1/72 Zoll). */
final class Units {

    static final double PT_PER_MM = 72.0 / 25.4;

    private Units() {
    }

    static double mmToPt(double mm) {
        return mm * PT_PER_MM;
    }

    static double ptToMm(double pt) {
        return pt / PT_PER_MM;
    }

    /** "76,2" statt "76.2" – für Anzeigen auf Deutsch. */
    static String formatMm(double value) {
        double rounded = Math.round(value * 10) / 10.0;
        String text = rounded == Math.rint(rounded) ? String.valueOf((long) rounded) : String.valueOf(rounded);
        return text.replace('.', ',');
    }
}
