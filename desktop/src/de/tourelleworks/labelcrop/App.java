package de.tourelleworks.labelcrop;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.datatransfer.DataFlavor;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.DefaultListModel;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JFileChooser;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.JTextField;
import javax.swing.SpinnerNumberModel;
import javax.swing.SwingUtilities;
import javax.swing.TransferHandler;
import javax.swing.UIManager;
import javax.swing.filechooser.FileNameExtensionFilter;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Kleine Oberfläche: Dateien hineinziehen, Drucker und Etikettenformat wählen,
 * "Drucken" – fertig. Bewusst nur das Nötige; die Drehung wird einmal mit dem
 * Testdruck ausprobiert und dann gespeichert.
 */
public final class App {

    private final DefaultListModel<File> files = new DefaultListModel<>();
    private final JList<File> fileList = new JList<>(files);
    private final JComboBox<Object> profileBox = new JComboBox<>();
    private final JComboBox<String> printerBox = new JComboBox<>();
    private final JComboBox<PaperFormat> formatBox = new JComboBox<>();
    private final JTextField widthField = new JTextField(5);
    private final JTextField heightField = new JTextField(5);
    private final JComboBox<String> rotateBox = new JComboBox<>(new String[] {"automatisch", "0°", "90°", "180°", "270°"});
    private final JComboBox<String> scaleBox = new JComboBox<>(new String[] {"Einpassen", "100 % (Originalgröße)"});
    private final JComboBox<String> placementBox = new JComboBox<>(new String[] {"zentriert", "oben bündig"});
    private final JSpinner marginSpinner = new JSpinner(new SpinnerNumberModel(2.0, 0.0, 30.0, 0.5));
    private final JLabel status = new JLabel(" ");
    private JFrame frame;

    public static void launch() {
        SwingUtilities.invokeLater(() -> {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
                // Standard-Look ist auch in Ordnung.
            }
            new App().show();
        });
    }

    private void show() {
        frame = new JFrame("LabelCrop Desktop");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setLayout(new BorderLayout(10, 10));
        frame.add(buildFilePanel(), BorderLayout.CENTER);
        frame.add(buildSettingsPanel(), BorderLayout.EAST);
        frame.add(buildBottomPanel(), BorderLayout.SOUTH);
        ((JComponent) frame.getContentPane()).setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        applyProfile(PrinterProfile.load());
        frame.pack();
        frame.setMinimumSize(new Dimension(760, 460));
        frame.setLocationRelativeTo(null);
        frame.setVisible(true);
    }

    // --- Aufbau ---

    private JPanel buildFilePanel() {
        JPanel panel = new JPanel(new BorderLayout(6, 6));
        JLabel title = new JLabel("1. Etiketten (A4-PDF)");
        title.setFont(title.getFont().deriveFont(Font.BOLD));
        panel.add(title, BorderLayout.NORTH);

        fileList.setCellRenderer(new FileNameRenderer());
        fileList.setTransferHandler(new DropHandler());
        JScrollPane scroll = new JScrollPane(fileList);
        scroll.setPreferredSize(new Dimension(360, 280));
        scroll.setBorder(BorderFactory.createTitledBorder("PDF-Dateien hierher ziehen"));
        panel.add(scroll, BorderLayout.CENTER);

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        JButton add = new JButton("Dateien hinzufügen …");
        add.addActionListener(e -> chooseFiles());
        JButton remove = new JButton("Entfernen");
        remove.addActionListener(e -> {
            for (File file : fileList.getSelectedValuesList()) {
                files.removeElement(file);
            }
        });
        JButton clear = new JButton("Liste leeren");
        clear.addActionListener(e -> files.clear());
        buttons.add(add);
        buttons.add(remove);
        buttons.add(clear);
        panel.add(buttons, BorderLayout.SOUTH);
        return panel;
    }

    private JPanel buildSettingsPanel() {
        JPanel panel = new JPanel(new GridBagLayout());
        GridBagConstraints c = new GridBagConstraints();
        c.insets = new Insets(3, 4, 3, 4);
        c.anchor = GridBagConstraints.WEST;
        c.fill = GridBagConstraints.HORIZONTAL;
        int row = 0;

        JLabel title = new JLabel("2. Drucker-Profil");
        title.setFont(title.getFont().deriveFont(Font.BOLD));
        addRow(panel, c, row++, title, null);

        profileBox.addItem("Automatisch erkennen");
        for (LabelProfile profile : LabelProfile.ALL) {
            profileBox.addItem(profile);
        }
        addRow(panel, c, row++, new JLabel("Label-Typ"), profileBox);

        JPanel printerRow = new JPanel(new BorderLayout(4, 0));
        printerRow.add(printerBox, BorderLayout.CENTER);
        JButton refresh = new JButton("↻");
        refresh.setToolTipText("Druckerliste neu laden");
        refresh.addActionListener(e -> fillPrinters(selectedPrinter()));
        printerRow.add(refresh, BorderLayout.EAST);
        addRow(panel, c, row++, new JLabel("Drucker"), printerRow);

        for (PaperFormat format : PaperFormat.ALL) {
            formatBox.addItem(format);
        }
        formatBox.addActionListener(e -> updateCustomFields());
        addRow(panel, c, row++, new JLabel("Etikettenformat"), formatBox);

        JPanel sizeRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 0));
        sizeRow.add(widthField);
        sizeRow.add(new JLabel("×"));
        sizeRow.add(heightField);
        sizeRow.add(new JLabel("mm (Höhe leer = Endlos)"));
        addRow(panel, c, row++, new JLabel("Eigene Größe"), sizeRow);

        addRow(panel, c, row++, new JLabel("Drehung"), rotateBox);
        addRow(panel, c, row++, new JLabel("Größe"), scaleBox);
        addRow(panel, c, row++, new JLabel("Lage"), placementBox);
        addRow(panel, c, row++, new JLabel("Rand (mm)"), marginSpinner);

        JLabel hint = new JLabel("<html><small>Drehung und Lage einmal mit dem Testdruck<br>ausprobieren – die Werte bleiben gespeichert.</small></html>");
        addRow(panel, c, row++, hint, null);

        c.weighty = 1;
        c.gridy = row;
        panel.add(new JLabel(), c);   // Rest nach unten schieben
        return panel;
    }

    private void addRow(JPanel panel, GridBagConstraints c, int row, JComponent label, JComponent field) {
        c.gridy = row;
        c.gridx = 0;
        c.weightx = 0;
        c.gridwidth = field == null ? 2 : 1;
        panel.add(label, c);
        if (field != null) {
            c.gridx = 1;
            c.weightx = 1;
            panel.add(field, c);
        }
    }

    private JPanel buildBottomPanel() {
        JPanel panel = new JPanel(new BorderLayout(6, 6));
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));

        JButton print = new JButton("Drucken");
        print.setFont(print.getFont().deriveFont(Font.BOLD));
        print.addActionListener(e -> printFiles());
        JButton save = new JButton("Als PDF speichern");
        save.setToolTipText("Legt …_label.pdf neben jede Quelldatei");
        save.addActionListener(e -> saveFiles());
        JButton test = new JButton("Testdruck");
        test.addActionListener(e -> testPrint());
        JButton testPdf = new JButton("Testdruck als PDF …");
        testPdf.addActionListener(e -> saveTestPdf());

        buttons.add(print);
        buttons.add(save);
        buttons.add(test);
        buttons.add(testPdf);
        panel.add(buttons, BorderLayout.WEST);
        status.setBorder(BorderFactory.createEmptyBorder(4, 2, 0, 2));
        panel.add(status, BorderLayout.SOUTH);
        return panel;
    }

    // --- Profil ↔ Oberfläche ---

    private void fillPrinters(String preferred) {
        printerBox.removeAllItems();
        for (String name : Printing.printerNames()) {
            printerBox.addItem(name);
        }
        if (preferred != null && !preferred.isBlank()) {
            printerBox.setSelectedItem(preferred);
        } else {
            printerBox.setSelectedItem(Printing.defaultPrinterName());
        }
    }

    private String selectedPrinter() {
        Object item = printerBox.getSelectedItem();
        return item == null ? "" : item.toString();
    }

    private void applyProfile(PrinterProfile profile) {
        fillPrinters(profile.printerName());
        PaperFormat format = profile.format();
        PaperFormat listed = PaperFormat.byId(format.id());
        formatBox.setSelectedItem(listed == null ? PaperFormat.byId("custom") : listed);
        if (format.id().equals("custom")) {
            widthField.setText(Units.formatMm(format.widthMm()));
            heightField.setText(format.heightMm() == null ? "" : Units.formatMm(format.heightMm()));
        }
        rotateBox.setSelectedIndex(rotateIndex(profile.rotate()));
        scaleBox.setSelectedIndex(profile.scaleMode().equals("none") ? 1 : 0);
        placementBox.setSelectedIndex(profile.placement().equals("top") ? 1 : 0);
        marginSpinner.setValue(profile.marginMm());
        LabelProfile label = LabelProfile.byId(profile.labelProfileId());
        profileBox.setSelectedItem(label == null ? "Automatisch erkennen" : label);
        updateCustomFields();
    }

    private static int rotateIndex(String rotate) {
        switch (rotate) {
            case "0": return 1;
            case "90": return 2;
            case "180": return 3;
            case "270": return 4;
            default: return 0;
        }
    }

    private void updateCustomFields() {
        PaperFormat format = (PaperFormat) formatBox.getSelectedItem();
        boolean custom = format != null && format.id().equals("custom");
        widthField.setEnabled(custom);
        heightField.setEnabled(custom);
    }

    /** Liest die Oberfläche in ein Profil und speichert es – so gilt es beim nächsten Start. */
    private PrinterProfile currentProfile() {
        PaperFormat format = (PaperFormat) formatBox.getSelectedItem();
        if (format != null && format.id().equals("custom")) {
            double width = parse(widthField.getText(), 100);
            Double height = heightField.getText().isBlank() ? null : parse(heightField.getText(), 50);
            format = new PaperFormat("custom", "Eigene Größe", width, height);
        }
        String[] rotations = {"auto", "0", "90", "180", "270"};
        Object selectedProfile = profileBox.getSelectedItem();
        String labelId = selectedProfile instanceof LabelProfile ? ((LabelProfile) selectedProfile).id() : "auto";
        PrinterProfile profile = new PrinterProfile(
                selectedPrinter(),
                format,
                rotations[rotateBox.getSelectedIndex()],
                scaleBox.getSelectedIndex() == 1 ? "none" : "fit",
                placementBox.getSelectedIndex() == 1 ? "top" : "center",
                ((Number) marginSpinner.getValue()).doubleValue(),
                labelId);
        try {
            profile.save();
        } catch (Exception e) {
            setStatus("Profil konnte nicht gespeichert werden: " + e.getMessage());
        }
        return profile;
    }

    private static double parse(String text, double fallback) {
        try {
            return Double.parseDouble(text.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    // --- Aktionen ---

    private void chooseFiles() {
        JFileChooser chooser = new JFileChooser();
        chooser.setMultiSelectionEnabled(true);
        chooser.setFileFilter(new FileNameExtensionFilter("PDF-Dateien", "pdf"));
        if (chooser.showOpenDialog(frame) == JFileChooser.APPROVE_OPTION) {
            for (File file : chooser.getSelectedFiles()) {
                addFile(file);
            }
        }
    }

    private void addFile(File file) {
        if (file.getName().toLowerCase().endsWith(".pdf") && !files.contains(file)) {
            files.addElement(file);
        }
    }

    private List<File> currentFiles() {
        List<File> list = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            list.add(files.get(i));
        }
        if (list.isEmpty()) {
            JOptionPane.showMessageDialog(frame, "Bitte zuerst eine PDF-Datei hinzufügen.", "LabelCrop",
                    JOptionPane.INFORMATION_MESSAGE);
        }
        return list;
    }

    private void printFiles() {
        List<File> list = currentFiles();
        if (list.isEmpty()) {
            return;
        }
        PrinterProfile profile = currentProfile();
        runInBackground("Drucke …", () -> {
            int count = 0;
            for (File file : list) {
                Main.cropAndPrint(file, profile);
                count++;
            }
            return count + " Etikett(en) an \"" + profile.printerName() + "\" gedruckt – " + profile.describe();
        });
    }

    private void saveFiles() {
        List<File> list = currentFiles();
        if (list.isEmpty()) {
            return;
        }
        PrinterProfile profile = currentProfile();
        runInBackground("Speichere …", () -> {
            for (File file : list) {
                Main.cropAndSave(file, profile);
            }
            return list.size() + " Datei(en) als …_label.pdf neben den Originalen gespeichert – " + profile.describe();
        });
    }

    private void testPrint() {
        PrinterProfile profile = currentProfile();
        runInBackground("Testdruck …", () -> {
            try (PDDocument doc = TestPrint.create(profile)) {
                Printing.print(doc, profile.printerName());
            }
            return "Testdruck an \"" + profile.printerName() + "\" geschickt – " + profile.describe();
        });
    }

    private void saveTestPdf() {
        PrinterProfile profile = currentProfile();
        JFileChooser chooser = new JFileChooser();
        chooser.setSelectedFile(new File("labelcrop-testdruck.pdf"));
        if (chooser.showSaveDialog(frame) != JFileChooser.APPROVE_OPTION) {
            return;
        }
        File target = chooser.getSelectedFile();
        runInBackground("Speichere Testdruck …", () -> {
            try (PDDocument doc = TestPrint.create(profile)) {
                doc.save(target);
            }
            return "Testdruck gespeichert: " + target.getAbsolutePath();
        });
    }

    private interface Work {
        String run() throws Exception;
    }

    /** Drucken und Speichern laufen im Hintergrund, damit die Oberfläche nicht einfriert. */
    private void runInBackground(String message, Work work) {
        setStatus(message);
        Thread thread = new Thread(() -> {
            try {
                String result = work.run();
                SwingUtilities.invokeLater(() -> setStatus(result));
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    setStatus("Fehler: " + e.getMessage());
                    JOptionPane.showMessageDialog(frame, e.getMessage(), "LabelCrop – Fehler", JOptionPane.ERROR_MESSAGE);
                });
            }
        }, "labelcrop-work");
        thread.setDaemon(true);
        thread.start();
    }

    private void setStatus(String text) {
        status.setText(text);
    }

    // --- Hilfsklassen ---

    /** Zeigt nur den Dateinamen, nicht den ganzen Pfad. */
    private static final class FileNameRenderer extends javax.swing.DefaultListCellRenderer {
        @Override
        public java.awt.Component getListCellRendererComponent(JList<?> list, Object value, int index,
                                                               boolean selected, boolean focused) {
            super.getListCellRendererComponent(list, value, index, selected, focused);
            if (value instanceof File) {
                setText(((File) value).getName());
                setToolTipText(((File) value).getAbsolutePath());
            }
            return this;
        }
    }

    /** Drag & Drop von PDF-Dateien aus dem Explorer in die Liste. */
    private final class DropHandler extends TransferHandler {
        @Override
        public boolean canImport(TransferSupport support) {
            return support.isDataFlavorSupported(DataFlavor.javaFileListFlavor);
        }

        @Override
        @SuppressWarnings("unchecked")
        public boolean importData(TransferSupport support) {
            try {
                List<File> dropped = (List<File>) support.getTransferable().getTransferData(DataFlavor.javaFileListFlavor);
                for (File file : dropped) {
                    addFile(file);
                }
                return true;
            } catch (Exception e) {
                setStatus("Ablegen fehlgeschlagen: " + e.getMessage());
                return false;
            }
        }
    }

    /** Erlaubt, dass PDDocument-Prüfungen (z. B. Erkennung) auch aus der Oberfläche möglich sind. */
    static PDDocument open(File file) throws java.io.IOException {
        return Loader.loadPDF(file);
    }
}
