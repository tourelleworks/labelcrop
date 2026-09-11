package de.tourelleworks.labelcrop;

/**
 * Reine Geometrie, ohne PDFBox: Quellbereich, Zielseite, Maßstab, Drehung,
 * Lage und die Abbildungsmatrix. Spiegelbild von computeLayout() in cropper.js,
 * damit Browser und Desktop dasselbe Ergebnis liefern.
 */
public final class Geometry {

    private static final double EPSILON = 0.01;   // Toleranz in pt für "passt gerade so"

    private Geometry() {
    }

    /** Rechteck in PDF-Punkten, Ursprung links unten. */
    public record Box(double left, double bottom, double right, double top) {
        public double width() {
            return right - left;
        }

        public double height() {
            return top - bottom;
        }
    }

    /**
     * Ergebnis der Berechnung. matrix = [a b c d e f]: (px, py) → (a·px + c·py + e, b·px + d·py + f).
     */
    public record Layout(int rotation, double scale, double pageWidth, double pageHeight,
                         double x, double y, double placedWidth, double placedHeight,
                         boolean fits, double[] matrix) {
    }

    /** Quellbereich aus dem Profil (mm ab links oben) und der MediaBox der Seite. */
    public static Box sourceBox(LabelProfile profile, double mediaX, double mediaY, double mediaWidth, double mediaHeight) {
        double trim = profile.trimMm();
        double pageTop = mediaY + mediaHeight;
        double left = mediaX + Units.mmToPt(profile.xMm() + trim);
        double right = mediaX + Units.mmToPt(profile.xMm() + profile.widthMm() - trim);
        double top = pageTop - Units.mmToPt(profile.yMm() + trim);
        double bottom = pageTop - Units.mmToPt(profile.yMm() + profile.heightMm() - trim);
        return new Box(left, bottom, right, top);
    }

    public static Layout computeLayout(Box box, PrinterProfile printer) {
        Layout best = null;
        for (int rotation : rotationsFor(printer.rotate())) {
            Layout candidate = layoutFor(box, printer, rotation);
            if (best == null || isBetter(candidate, best)) {
                best = candidate;
            }
        }
        return best;
    }

    // Drehung laut Konzept ein fester Wert je Drucker; "auto" probiert 0° und 90°.
    static int[] rotationsFor(String mode) {
        switch (mode) {
            case "0":
            case "none":
                return new int[] {0};
            case "90":
            case "rotate":
                return new int[] {90};
            case "180":
                return new int[] {180};
            case "270":
                return new int[] {270};
            default:
                return new int[] {0, 90};
        }
    }

    private static boolean isBetter(Layout candidate, Layout current) {
        if (candidate.fits() != current.fits()) {
            return candidate.fits();
        }
        return candidate.scale() > current.scale() + 1e-9;
    }

    private static Layout layoutFor(Box box, PrinterProfile printer, int rotation) {
        boolean sideways = rotation == 90 || rotation == 270;
        double contentWidth = sideways ? box.height() : box.width();
        double contentHeight = sideways ? box.width() : box.height();
        double margin = Units.mmToPt(printer.marginMm());
        PaperFormat format = printer.format();
        boolean fit = printer.scaleMode().equals("fit");

        double scale = 1;
        double pageWidth;
        double pageHeight;
        boolean fits = true;

        if (format.isSourceSize()) {
            // "Wie Ausschnitt": die Seite wächst um den Inhalt herum.
            pageWidth = contentWidth + 2 * margin;
            pageHeight = contentHeight + 2 * margin;
        } else {
            pageWidth = Units.mmToPt(format.widthMm());
            double availableWidth = pageWidth - 2 * margin;
            if (format.isEndless()) {
                if (fit) {
                    scale = availableWidth / contentWidth;
                }
                pageHeight = contentHeight * scale + 2 * margin;
                fits = contentWidth * scale <= availableWidth + EPSILON;
            } else {
                pageHeight = Units.mmToPt(format.heightMm());
                double availableHeight = pageHeight - 2 * margin;
                if (fit) {
                    scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
                }
                fits = contentWidth * scale <= availableWidth + EPSILON
                        && contentHeight * scale <= availableHeight + EPSILON;
            }
        }

        double placedWidth = contentWidth * scale;
        double placedHeight = contentHeight * scale;
        double x = (pageWidth - placedWidth) / 2;   // waagerecht immer zentriert
        double y = (pageHeight - placedHeight) / 2;
        if (printer.placement().equals("top") && !format.isSourceSize()) {
            y = pageHeight - margin - placedHeight;   // oben bündig am Etikettenanfang
        }

        return new Layout(rotation, scale, pageWidth, pageHeight, x, y, placedWidth, placedHeight, fits,
                matrixFor(box, scale, rotation, x, y));
    }

    static double[] matrixFor(Box box, double s, int rotation, double x, double y) {
        switch (rotation) {
            case 90:   // im Uhrzeigersinn: (px, py) → (s·py, −s·px)
                return new double[] {0, -s, s, 0, x - s * box.bottom(), y + s * box.right()};
            case 180:  // kopfüber
                return new double[] {-s, 0, 0, -s, x + s * box.right(), y + s * box.top()};
            case 270:  // gegen den Uhrzeigersinn: (px, py) → (−s·py, s·px)
                return new double[] {0, s, -s, 0, x + s * box.top(), y - s * box.left()};
            default:
                return new double[] {s, 0, 0, s, x - s * box.left(), y - s * box.bottom()};
        }
    }
}
