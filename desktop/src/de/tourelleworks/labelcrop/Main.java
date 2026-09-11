package de.tourelleworks.labelcrop;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Einstieg: ohne Argumente startet die Oberfläche (App), mit Argumenten die
 * Kommandozeile – praktisch für Stapel, Verknüpfungen oder "Öffnen mit".
 *
 * <pre>
 *   java -jar labelcrop-desktop.jar                              Oberfläche
 *   java -jar labelcrop-desktop.jar printers                     Druckerliste
 *   java -jar labelcrop-desktop.jar printers --printer "Name"    Papierformate dieses Druckers
 *   java -jar labelcrop-desktop.jar print  label.pdf [weitere…]  zuschneiden und direkt drucken
 *   java -jar labelcrop-desktop.jar crop   label.pdf [weitere…]  zuschneiden, speichert …_label.pdf daneben
 *   java -jar labelcrop-desktop.jar test                         Testdruck drucken
 *   java -jar labelcrop-desktop.jar test-pdf testdruck.pdf       Testdruck als PDF
 *
 *   Optionen (überschreiben das gespeicherte Drucker-Profil, werden nicht gespeichert):
 *     --printer "Name"     --format 100x150 | 62x | source | thermo-100x150
 *     --rotate 0|90|180|270|auto   --scale fit|none   --place center|top   --margin 2
 *     --profile post-internetmarke-ebay | post-internetmarke-ebay-marks | auto
 * </pre>
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        if (args.length == 0) {
            App.launch();
            return;
        }
        // Ohne echte Konsole (Git Bash, Skripte, IDE) schreibt Java 17 in der Windows-
        // Codepage; Umlaute und "×" kämen dann verstümmelt an. Dann lieber UTF-8.
        if (System.console() == null) {
            System.setOut(new java.io.PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true,
                    java.nio.charset.StandardCharsets.UTF_8));
            System.setErr(new java.io.PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.err), true,
                    java.nio.charset.StandardCharsets.UTF_8));
        }
        try {
            run(args);
        } catch (Exception e) {
            System.err.println("Fehler: " + e.getMessage());
            System.exit(1);
        }
    }

    private static void run(String[] args) throws Exception {
        String command = args[0];
        List<String> files = new ArrayList<>();
        PrinterProfile printer = PrinterProfile.load();
        java.nio.file.Path toFile = null;   // --to-file: Druckausgabe in eine Datei (zum Prüfen des Druckpfads)

        for (int i = 1; i < args.length; i++) {
            String arg = args[i];
            if (!arg.startsWith("--")) {
                files.add(arg);
                continue;
            }
            if (i + 1 >= args.length) {
                throw new IllegalArgumentException("Wert fehlt für " + arg);
            }
            String value = args[++i];
            switch (arg) {
                case "--printer" -> printer = printer.withPrinter(value);
                case "--format" -> printer = printer.withFormat(PaperFormat.parse(value));
                case "--rotate" -> printer = printer.withRotate(value);
                case "--scale" -> printer = printer.withScaleMode(value);
                case "--place" -> printer = printer.withPlacement(value);
                case "--margin" -> printer = printer.withMargin(Double.parseDouble(value.replace(',', '.')));
                case "--profile" -> printer = printer.withLabelProfileId(value);
                case "--to-file" -> toFile = java.nio.file.Path.of(value);
                default -> throw new IllegalArgumentException("Unbekannte Option " + arg);
            }
        }

        switch (command) {
            case "printers" -> {
                if (printer.printerName().isBlank()) {
                    for (String name : Printing.printerNames()) {
                        System.out.println(name);
                    }
                } else {
                    // Mit --printer: welche Papierformate kennt der Treiber? (offene Frage im Konzept)
                    System.out.println("Papierformate von \"" + printer.printerName() + "\":");
                    for (String name : Printing.mediaNames(printer.printerName())) {
                        System.out.println("  " + name);
                    }
                }
            }
            case "print" -> {
                requireFiles(files);
                for (String file : files) {
                    cropAndPrint(new File(file), printer, toFile);
                }
            }
            case "crop" -> {
                requireFiles(files);
                for (String file : files) {
                    cropAndSave(new File(file), printer);
                }
            }
            case "test" -> {
                try (PDDocument doc = TestPrint.create(printer)) {
                    Printing.print(doc, printer.printerName(), toFile);
                }
                System.out.println("Testdruck an \"" + printer.printerName() + "\" geschickt (" + printer.describe() + ").");
            }
            case "test-pdf" -> {
                requireFiles(files);
                try (PDDocument doc = TestPrint.create(printer)) {
                    doc.save(new File(files.get(0)));
                }
                System.out.println("Testdruck gespeichert: " + files.get(0));
            }
            default -> throw new IllegalArgumentException("Unbekannter Befehl " + command
                    + " (printers, print, crop, test, test-pdf)");
        }
    }

    private static void requireFiles(List<String> files) {
        if (files.isEmpty()) {
            throw new IllegalArgumentException("Bitte mindestens eine PDF-Datei angeben.");
        }
    }

    /** Profil laut Einstellung oder automatisch erkannt; Rückfall ist das erste Profil. */
    static LabelProfile resolveProfile(PDDocument source, PrinterProfile printer) throws IOException {
        if (!printer.labelProfileId().equals("auto")) {
            LabelProfile chosen = LabelProfile.byId(printer.labelProfileId());
            if (chosen != null) {
                return chosen;
            }
        }
        LabelProfile detected = Cropper.detect(source);
        if (detected != null) {
            return detected;
        }
        System.err.println("Hinweis: Label-Typ nicht erkannt, nehme " + LabelProfile.ALL.get(0).name());
        return LabelProfile.ALL.get(0);
    }

    static File outputFile(File input) {
        String name = input.getName();
        if (name.toLowerCase().endsWith(".pdf")) {
            name = name.substring(0, name.length() - 4);
        }
        return new File(input.getParentFile(), name + "_label.pdf");
    }

    static void cropAndSave(File input, PrinterProfile printer) throws IOException {
        try (PDDocument source = Loader.loadPDF(input)) {
            LabelProfile profile = resolveProfile(source, printer);
            List<Cropper.PageResult> results = new ArrayList<>();
            try (PDDocument output = Cropper.crop(source, profile, printer, results)) {
                File target = outputFile(input);
                output.save(target);
                System.out.println(target.getName() + ": " + describe(results.get(0).layout()) + " (" + profile.name() + ")");
            }
        }
    }

    static void cropAndPrint(File input, PrinterProfile printer) throws Exception {
        cropAndPrint(input, printer, null);
    }

    static void cropAndPrint(File input, PrinterProfile printer, java.nio.file.Path toFile) throws Exception {
        try (PDDocument source = Loader.loadPDF(input)) {
            LabelProfile profile = resolveProfile(source, printer);
            List<Cropper.PageResult> results = new ArrayList<>();
            try (PDDocument output = Cropper.crop(source, profile, printer, results)) {
                Printing.print(output, printer.printerName(), toFile);
                System.out.println(input.getName() + ": gedruckt an \"" + printer.printerName() + "\", "
                        + describe(results.get(0).layout()) + " (" + profile.name() + ")");
            }
        }
    }

    static String describe(Geometry.Layout layout) {
        String rotation = layout.rotation() == 0 ? "nicht gedreht" : layout.rotation() + "° gedreht";
        return Units.formatMm(Units.ptToMm(layout.pageWidth())) + " × " + Units.formatMm(Units.ptToMm(layout.pageHeight()))
                + " mm, Maßstab " + Math.round(layout.scale() * 100) + " %, " + rotation;
    }
}
