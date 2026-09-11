package de.tourelleworks.labelcrop;

import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.util.ArrayList;
import java.util.List;

import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import javax.print.attribute.HashPrintRequestAttributeSet;
import javax.print.attribute.PrintRequestAttributeSet;
import javax.print.attribute.standard.Copies;
import javax.print.attribute.standard.Destination;
import javax.print.attribute.standard.Media;
import javax.print.attribute.standard.MediaSize;
import javax.print.attribute.standard.MediaSizeName;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.printing.Orientation;
import org.apache.pdfbox.printing.PDFPageable;

/**
 * Direktdruck ohne Dialog (Konzept 6.5): PDFBox liefert die Seiten als Pageable,
 * java.awt.print schickt sie an einen benannten Drucker. Seitengröße kommt aus
 * der PDF, Maßstab ist 1:1, Ausrichtung fest Hochformat – die Drehung steckt
 * schon in der PDF, der Treiber soll nichts mehr entscheiden müssen.
 */
public final class Printing {

    private Printing() {
    }

    public static List<String> printerNames() {
        List<String> names = new ArrayList<>();
        for (PrintService service : PrintServiceLookup.lookupPrintServices(null, null)) {
            names.add(service.getName());
        }
        return names;
    }

    public static String defaultPrinterName() {
        PrintService service = PrintServiceLookup.lookupDefaultPrintService();
        return service == null ? "" : service.getName();
    }

    public static PrintService find(String name) {
        for (PrintService service : PrintServiceLookup.lookupPrintServices(null, null)) {
            if (service.getName().equalsIgnoreCase(name.trim())) {
                return service;
            }
        }
        return null;
    }

    /** Papierformate, die der Treiber dieses Druckers kennt – "Name (Breite × Höhe mm)". */
    public static List<String> mediaNames(String printerName) {
        List<String> names = new ArrayList<>();
        PrintService service = find(printerName);
        if (service == null) {
            return names;
        }
        Object values = service.getSupportedAttributeValues(Media.class, null, null);
        if (!(values instanceof Media[])) {
            return names;
        }
        for (Media media : (Media[]) values) {
            if (media instanceof MediaSizeName) {
                MediaSize size = MediaSize.getMediaSizeForName((MediaSizeName) media);
                if (size == null) {
                    names.add(media.toString());
                } else {
                    names.add(media + " (" + Units.formatMm(size.getX(MediaSize.MM)) + " × "
                            + Units.formatMm(size.getY(MediaSize.MM)) + " mm)");
                }
            }
        }
        return names;
    }

    /**
     * Sucht im Treiber ein Papierformat, das der Seite auf 0,6 mm genau entspricht.
     * Ohne Treffer wählt Java selbst das nächstliegende bekannte Format – deshalb
     * sollte das Etikett im Treiber genau so angelegt sein (Konzept 6.2).
     */
    static MediaSizeName matchMedia(PrintService service, double widthMm, double heightMm) {
        Object values = service.getSupportedAttributeValues(Media.class, null, null);
        if (!(values instanceof Media[])) {
            return null;
        }
        for (Media media : (Media[]) values) {
            if (!(media instanceof MediaSizeName)) {
                continue;
            }
            MediaSize size = MediaSize.getMediaSizeForName((MediaSizeName) media);
            if (size == null) {
                continue;
            }
            if (Math.abs(size.getX(MediaSize.MM) - widthMm) <= 0.6 && Math.abs(size.getY(MediaSize.MM) - heightMm) <= 0.6) {
                return (MediaSizeName) media;
            }
        }
        return null;
    }

    /** Druckt alle Seiten des Dokuments an den Drucker mit diesem Namen. */
    public static void print(PDDocument document, String printerName) throws PrinterException {
        print(document, printerName, null);
    }

    /**
     * Wie print(), aber mit "in Datei drucken" (Destination): So lässt sich der
     * komplette Druckpfad z. B. mit "Microsoft Print to PDF" ohne Dialog prüfen.
     */
    public static void print(PDDocument document, String printerName, java.nio.file.Path outputFile) throws PrinterException {
        if (printerName == null || printerName.isBlank()) {
            throw new PrinterException("Kein Drucker gewählt. Verfügbar: " + String.join(", ", printerNames()));
        }
        PrintService service = find(printerName);
        if (service == null) {
            throw new PrinterException("Drucker \"" + printerName + "\" nicht gefunden. Verfügbar: "
                    + String.join(", ", printerNames()));
        }
        PrinterJob job = PrinterJob.getPrinterJob();
        job.setPrintService(service);
        job.setJobName("LabelCrop");
        // PDFPageable: je Seite ein PageFormat in PDF-Seitengröße, Scaling.ACTUAL_SIZE,
        // kein Rahmen, Auflösung dem Treiber überlassen.
        job.setPageable(new PDFPageable(document, Orientation.PORTRAIT, false, 0));
        PrintRequestAttributeSet attributes = new HashPrintRequestAttributeSet();
        attributes.add(new Copies(1));
        // Passendes Treiber-Formular ausdrücklich mitgeben, damit der Treiber nicht rät.
        PDRectangle first = document.getPage(0).getMediaBox();
        MediaSizeName media = matchMedia(service, Units.ptToMm(first.getWidth()), Units.ptToMm(first.getHeight()));
        if (media != null) {
            attributes.add(media);
        }
        if (outputFile != null) {
            attributes.add(new Destination(outputFile.toAbsolutePath().toUri()));
        }
        job.print(attributes);
    }
}
