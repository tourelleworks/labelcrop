package de.tourelleworks.labelcrop;

import java.awt.geom.AffineTransform;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.text.PDFTextStripper;

/**
 * Der Kern: schneidet den Label-Bereich wirklich aus der Seite aus.
 *
 * Keine CropBox (die ignorieren Druckertreiber gern), sondern eine neue Seite in
 * Zielgröße, in die der Inhalt der Quellseite als Form-XObject gezeichnet wird –
 * vektoriell, verlustfrei, mit echter MediaBox in Etikettengröße.
 */
public final class Cropper {

    private Cropper() {
    }

    /** Ergebnis je Seite, für Statusmeldungen. */
    public record PageResult(int index, Geometry.Layout layout) {
    }

    /** Text der ersten Seite – für die Profil-Erkennung. */
    public static String firstPageText(PDDocument document) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(1);
        stripper.setEndPage(1);
        return stripper.getText(document);
    }

    /** Passendes Profil finden; null, wenn keines passt. */
    public static LabelProfile detect(PDDocument document) throws IOException {
        PDRectangle media = document.getPage(0).getMediaBox();
        return LabelProfile.detect(firstPageText(document), media.getWidth(), media.getHeight());
    }

    /**
     * Schneidet alle Seiten zu. Das Ergebnis-Dokument gehört dem Aufrufer (schließen!),
     * das Quelldokument muss bis zum Speichern/Drucken offen bleiben.
     */
    public static PDDocument crop(PDDocument source, LabelProfile profile, PrinterProfile printer,
                                  List<PageResult> results) throws IOException {
        PDDocument output = new PDDocument();
        output.getDocumentInformation().setProducer("LabelCrop Desktop");
        LayerUtility layers = new LayerUtility(output);

        for (int i = 0; i < source.getNumberOfPages(); i++) {
            PDPage sourcePage = source.getPage(i);
            PDRectangle media = sourcePage.getMediaBox();
            Geometry.Box box = Geometry.sourceBox(profile, media.getLowerLeftX(), media.getLowerLeftY(),
                    media.getWidth(), media.getHeight());
            Geometry.Layout layout = Geometry.computeLayout(box, printer);

            // importPageAsForm kopiert Inhalt, Schriften und Bilder in ein Form-XObject.
            // Die BBox schneidet alles außerhalb des Bereichs ab, die Matrix setzt
            // den Bereich skaliert und gedreht auf die Zielseite.
            PDFormXObject form = layers.importPageAsForm(source, i);
            form.setBBox(new PDRectangle((float) box.left(), (float) box.bottom(),
                    (float) box.width(), (float) box.height()));
            double[] m = layout.matrix();
            form.setMatrix(new AffineTransform(m[0], m[1], m[2], m[3], m[4], m[5]));

            PDPage page = new PDPage(new PDRectangle((float) layout.pageWidth(), (float) layout.pageHeight()));
            output.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(output, page)) {
                content.drawForm(form);
            }
            if (results != null) {
                results.add(new PageResult(i, layout));
            }
        }
        return output;
    }

    public static PDDocument crop(PDDocument source, LabelProfile profile, PrinterProfile printer) throws IOException {
        return crop(source, profile, printer, new ArrayList<>());
    }
}
