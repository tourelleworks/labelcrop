package de.tourelleworks.labelcrop;

import java.io.IOException;
import java.time.LocalDate;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.util.Matrix;

/**
 * Testdruck (Konzept 6.4): Rahmen am Rand, Pfeil zum Seitenanfang, 50-mm-Maßlinien
 * und die aktuellen Profilwerte. Nach dem Druck sieht man sofort, ob Papierformat,
 * Skalierung und Drehung im Treiber stimmen. Gleiches Layout wie testPrintPdf() im Browser.
 */
public final class TestPrint {

    private TestPrint() {
    }

    /** Seitengröße des Testdrucks: festes Format, Endlos → 100 mm lang, sonst 100 × 150 mm. */
    public static double[] pageSizeMm(PaperFormat format) {
        if (format.isSourceSize()) {
            return new double[] {100, 150};
        }
        double height = format.heightMm() == null ? 100 : format.heightMm();
        return new double[] {format.widthMm(), height};
    }

    public static PDDocument create(PrinterProfile printer) throws IOException {
        double[] size = pageSizeMm(printer.format());
        double widthMm = size[0];
        double heightMm = size[1];
        float w = (float) Units.mmToPt(widthMm);
        float h = (float) Units.mmToPt(heightMm);

        PDDocument doc = new PDDocument();
        doc.getDocumentInformation().setProducer("LabelCrop Desktop");
        doc.getDocumentInformation().setTitle("LabelCrop Testdruck");
        PDPage page = new PDPage(new PDRectangle(w, h));
        doc.addPage(page);

        PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDFont bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        // Schriftgröße an die Etikettbreite anpassen (schmale Rollen, große Etiketten).
        float base = (float) Math.max(5, Math.min(9, widthMm / 11));
        float lineWidth = 0.6f;

        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            // Rahmen 1 mm innerhalb der Kante: fehlt eine Seite, schneidet der Treiber ab.
            cs.setLineWidth(lineWidth);
            cs.addRect(mm(1), mm(1), w - mm(2), h - mm(2));
            cs.stroke();

            // Kopf
            text(cs, bold, base * 1.3f, mm(5), h - mm(5) - base * 1.2f, "LabelCrop Testdruck");
            String stamp = LocalDate.now().toString();
            text(cs, font, base, w - mm(5) - width(font, base, stamp), h - mm(5) - base * 1.2f, stamp);

            // Schmale Etiketten (z. B. 36 mm): Pfeil kürzer, Profilwerte darunter statt daneben.
            boolean narrow = widthMm < 60;

            // Pfeil zum Seitenanfang: wohin zeigt er nach dem Druck? Danach die Drehung wählen.
            float ax = narrow ? mm(6) : mm(12);
            float aTop = h - mm(narrow ? 14 : 16);
            float aBottom = narrow ? aTop - mm(20) : mm(28);
            cs.setLineWidth(lineWidth * 2);
            line(cs, ax, aBottom, ax, aTop);
            line(cs, ax, aTop, ax - mm(3), aTop - mm(5));
            line(cs, ax, aTop, ax + mm(3), aTop - mm(5));
            cs.setLineWidth(lineWidth);
            text(cs, bold, base, ax + mm(4), aTop - mm(5), "OBEN");
            text(cs, font, base * 0.85f, ax + mm(4), aTop - mm(5) - base * 1.3f, "Seitenanfang");

            // Waagerechte Maßlinie: 50 mm (kürzer, wenn das Etikett schmaler ist).
            double hLen = Math.min(50, widthMm - 10);
            float hx = (w - mm(hLen)) / 2;
            float hy = mm(12);
            line(cs, hx, hy, hx + mm(hLen), hy);
            line(cs, hx, hy - mm(2), hx, hy + mm(2));
            line(cs, hx + mm(hLen), hy - mm(2), hx + mm(hLen), hy + mm(2));
            String hLabel = Units.formatMm(hLen) + " mm";
            text(cs, font, base, (w - width(font, base, hLabel)) / 2, hy + mm(3), hLabel);

            // Senkrechte Maßlinie am rechten Rand – auf schmalen Etiketten weglassen.
            if (!narrow) {
                double vLen = Math.min(50, heightMm - 40);
                float vx = w - mm(8);
                float vy = mm(28);
                line(cs, vx, vy, vx, vy + mm(vLen));
                line(cs, vx - mm(2), vy, vx + mm(2), vy);
                line(cs, vx - mm(2), vy + mm(vLen), vx + mm(2), vy + mm(vLen));
                cs.beginText();
                cs.setFont(font, base);
                cs.setTextMatrix(Matrix.getRotateInstance(Math.PI / 2, vx - mm(3), vy + mm(vLen / 2) - base * 1.5f));
                cs.showText(Units.formatMm(vLen) + " mm");
                cs.endText();
            }

            // Profilwerte: rechts neben dem Pfeil, auf schmalen Etiketten darunter.
            String rotation = printer.rotate().equals("auto") ? "automatisch" : printer.rotate() + "°";
            String scale = printer.scaleMode().equals("none") ? "100 % (1:1)" : "Einpassen";
            String placement = printer.placement().equals("top") ? "oben bündig" : "zentriert";
            String[] lines = {
                "Format: " + Units.formatMm(widthMm) + " × " + Units.formatMm(heightMm) + " mm",
                "Drucker: " + (printer.printerName().isBlank() ? "(nicht gewählt)" : printer.printerName()),
                "Drehung: " + rotation,
                "Skalierung: " + scale,
                "Lage: " + placement,
                "Rand: " + Units.formatMm(printer.marginMm()) + " mm",
            };
            float tx = narrow ? mm(5) : mm(24);
            float ty = narrow ? aBottom - mm(4) : h - mm(24);
            for (String lineText : lines) {
                if (ty < hy + mm(8)) {
                    break;   // lieber weglassen als über die Maßlinie schreiben
                }
                text(cs, font, base, tx, ty, lineText);
                ty -= base * 1.5f;
            }

            // Prüfhinweise unten – nur wenn Platz ist.
            String[] hints = {
                "Rahmen abgeschnitten? Papierformat im Treiber = " + Units.formatMm(widthMm) + " × " + Units.formatMm(heightMm) + " mm.",
                "Linie nicht " + Units.formatMm(hLen) + " mm lang? Skalierung im Treiber auf 100 %.",
                "Pfeil zeigt nicht zum Etikettenanfang? Drehung im Profil ändern.",
            };
            float hy2 = ty - base;
            for (String hint : hints) {
                if (hy2 < hy + mm(8) || width(font, base * 0.8f, hint) > w - tx - mm(5)) {
                    break;
                }
                text(cs, font, base * 0.8f, tx, hy2, hint);
                hy2 -= base * 1.3f;
            }
        }
        return doc;
    }

    private static float mm(double value) {
        return (float) Units.mmToPt(value);
    }

    private static float width(PDFont font, float size, String text) throws IOException {
        return font.getStringWidth(text) / 1000f * size;
    }

    private static void text(PDPageContentStream cs, PDFont font, float size, float x, float y, String value)
            throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        cs.showText(value);
        cs.endText();
    }

    private static void line(PDPageContentStream cs, float x1, float y1, float x2, float y2) throws IOException {
        cs.moveTo(x1, y1);
        cs.lineTo(x2, y2);
        cs.stroke();
    }
}
