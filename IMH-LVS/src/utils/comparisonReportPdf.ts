// Comparison PDF Report (AI module brief §10) — a downloadable PDF with
// the summary, the detailed Parameter/Current/Compared/Result table, and
// the artwork images. Replaces the old plain-text export
// (ComparisonDetailPage's previous handleDownloadReport), which was never
// the PDF the brief actually asks for.
//
// Generated entirely client-side (jsPDF + jspdf-autotable) rather than
// round-tripping through ai_backend/app/services/reporting.py's reportlab
// implementation: that service is optional on-prem infrastructure (see
// aiExtraction.service.ts's own comment — off unless AI_EXTRACTION_URL is
// set, and slow/GPU-bound even when it is), and this feature needs to work
// on every comparison regardless of whether that service happens to be
// running.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderPdfFirstPageToDataUrl } from '../hooks/usePdfThumbnail';
import { formatDateTime } from './dateFormat';
import type { LabelComparisonRun } from '../types/labelComparisonRecord';
import type { LabelComparisonFieldResult, VisualComparisonResult } from '../types/labelComparison';

type PreviewableFile = { fileName: string; fileType: string; filePath: string };

// Minimum readable font size the brief requires (§10) — every text call
// below uses this or larger, never smaller.
const BASE_FONT_PT = 10;
const MARGIN_MM = 15;
const PAGE_WIDTH_MM = 210; // A4

async function resolveImageDataUrl(file: PreviewableFile | undefined): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!file || !file.filePath.trim()) return null;
  try {
    let dataUrl: string | null = null;
    if (file.fileType === 'application/pdf') {
      dataUrl = await renderPdfFirstPageToDataUrl(file.filePath);
    } else if (file.fileType.startsWith('image/')) {
      const response = await fetch(file.filePath);
      if (!response.ok) return null;
      const blob = await response.blob();
      dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    if (!dataUrl) return null;

    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl!;
    });
    if (!dimensions) return null;
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

export function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

// Sentence describing what a field's current/compared values look like in
// the table — blank values are shown as an em dash rather than left empty,
// so a reader can tell "blank" from "the cell didn't render". Exported
// (with fieldRows and formatVersionLabel below) so this module's pure
// formatting logic is unit-testable without a browser — the PDF generation
// itself needs real DOM/Canvas/Image/fetch APIs jsdom-free Node doesn't
// have, so that part is verified by live browser smoke-testing instead.
export function cell(value: string): string {
  return value.trim() || '—';
}

export function fieldRows(fields: LabelComparisonFieldResult[]): string[][] {
  return fields.map((field) => [field.label, cell(field.labelA), cell(field.labelB), field.status]);
}

// MISSING (the visual comparison call never completed for this pair) has
// no percentage to show — an em dash there, not "undefined%" or a blank
// cell that reads as a rendering bug.
export function visualCell(result: VisualComparisonResult): string {
  return typeof result.similarityPercentage === 'number' ? `${result.similarityPercentage}%` : '—';
}

export type ArtworkImageInputs = {
  candidate?: PreviewableFile;
  approved?: PreviewableFile;
};

/**
 * Builds and triggers a browser download of the comparison PDF for one
 * LabelComparisonRun. Never throws for a missing/unreadable artwork image —
 * that image is simply omitted from the PDF (with a note), the same
 * "absent, not fabricated" treatment this whole system gives everywhere
 * else; a report always generates even when neither artwork has a
 * retrievable preview in this session.
 */
export async function generateComparisonReportPdf(run: LabelComparisonRun, artworkFiles: ArtworkImageInputs): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN_MM;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Label Comparison Report', MARGIN_MM, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BASE_FONT_PT);
  doc.setTextColor(90);
  doc.text(`Comparison ID: ${run.id}`, MARGIN_MM, y);
  y += 7;
  doc.setTextColor(0);

  // ---- Summary --------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Summary', MARGIN_MM, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BASE_FONT_PT);
  const summaryLines: [string, string][] = [
    ['Product', run.productName],
    ['Marketing Company', run.marketingCompany],
    ['Current Artwork', `${run.candidateArtworkFileName} (${formatVersionLabel(run.candidateArtworkVersion)})`],
    [
      'Latest Approved Artwork',
      run.versionComparison
        ? `${run.versionComparison.approvedArtworkFileName} (${formatVersionLabel(run.versionComparison.approvedArtworkVersion)})`
        : 'None — no previous approved version for this label'
    ],
    [
      'Overall Similarity Result',
      run.versionComparison ? `${run.versionComparison.result.comparison.overallPercentage}% match vs. latest approved` : 'Not applicable — version comparison was skipped'
    ],
    [
      'Best Cross-Company Match',
      run.bestCrossCompanyMatch
        ? `${run.bestCrossCompanyMatch.candidateMarketingCompany} — ${run.bestCrossCompanyMatch.candidateProductName} (${run.bestCrossCompanyMatch.overallPercentage}%)`
        : 'No Comparison Available'
    ],
    ['Compared By', run.comparedBy],
    ['Compared On', formatDateTime(run.comparisonDate)]
  ];
  for (const [label, value] of summaryLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN_MM, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(value, PAGE_WIDTH_MM - MARGIN_MM * 2 - 50);
    doc.text(wrapped, MARGIN_MM + 52, y);
    y += 6 * wrapped.length;
  }
  y += 4;

  // ---- Artwork images ---------------------------------------------------
  const [candidateImage, approvedImage] = await Promise.all([resolveImageDataUrl(artworkFiles.candidate), resolveImageDataUrl(artworkFiles.approved)]);

  if (candidateImage || approvedImage) {
    if (y > 200) {
      doc.addPage();
      y = MARGIN_MM;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Artwork', MARGIN_MM, y);
    y += 7;

    const panelWidth = (PAGE_WIDTH_MM - MARGIN_MM * 2 - 10) / 2;
    const maxHeight = 70;
    const panels: { label: string; image: typeof candidateImage }[] = [
      { label: 'Current Artwork', image: candidateImage },
      { label: 'Latest Approved Artwork', image: approvedImage }
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BASE_FONT_PT);
    let imageBottom = y;
    panels.forEach((panel, index) => {
      const x = MARGIN_MM + index * (panelWidth + 10);
      doc.text(panel.label, x, y);
      if (panel.image) {
        const scale = Math.min(panelWidth / panel.image.width, maxHeight / panel.image.height);
        const drawWidth = panel.image.width * scale;
        const drawHeight = panel.image.height * scale;
        // High-resolution source (the artwork's own rendered pixels, not a
        // pre-shrunk thumbnail) placed at a print-quality size, per the
        // brief's "high-resolution artwork images" requirement.
        doc.addImage(panel.image.dataUrl, 'PNG', x, y + 3, drawWidth, drawHeight);
        imageBottom = Math.max(imageBottom, y + 3 + drawHeight);
      } else {
        doc.setTextColor(150);
        doc.text('Preview not available', x, y + 10);
        doc.setTextColor(0);
        imageBottom = Math.max(imageBottom, y + 12);
      }
    });
    y = imageBottom + 8;
  }

  // ---- Detailed comparison ----------------------------------------------
  if (run.versionComparison) {
    if (y > 240) {
      doc.addPage();
      y = MARGIN_MM;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Detailed Comparison (vs. Latest Approved ${formatVersionLabel(run.versionComparison.approvedArtworkVersion)})`, MARGIN_MM, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Current', 'Compared', 'Result']],
      body: fieldRows(run.versionComparison.result.comparison.fields),
      styles: { fontSize: BASE_FONT_PT, cellPadding: 2.5 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
      margin: { left: MARGIN_MM, right: MARGIN_MM },
      columnStyles: { 3: { fontStyle: 'bold' } }
    });
    // @ts-expect-error jspdf-autotable augments the doc instance at runtime with lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 10;

    if (run.versionComparison.result.comparison.nutritionComparison) {
      const nutrition = run.versionComparison.result.comparison.nutritionComparison;
      if (y > 240) {
        doc.addPage();
        y = MARGIN_MM;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Nutrition Table (row by row)', MARGIN_MM, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Nutrient', 'Current', 'Compared', 'Result']],
        body: nutrition.rows.map((row) => [row.nutrient, cell(row.valueA), cell(row.valueB), row.status]),
        styles: { fontSize: BASE_FONT_PT, cellPadding: 2.5 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
        margin: { left: MARGIN_MM, right: MARGIN_MM }
      });
      // @ts-expect-error see above
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }

    if (run.versionComparison.visualComparison) {
      const visual = run.versionComparison.visualComparison;
      if (y > 240) {
        doc.addPage();
        y = MARGIN_MM;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Visual Comparison', MARGIN_MM, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Parameter', 'Similarity', 'Result']],
        body: [
          ['Logo & Design/Layout', visualCell(visual.artworkSimilarity), visual.artworkSimilarity.status],
          ['Colour', visualCell(visual.colourSimilarity), visual.colourSimilarity.status]
        ],
        styles: { fontSize: BASE_FONT_PT, cellPadding: 2.5 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
        margin: { left: MARGIN_MM, right: MARGIN_MM }
      });
      // @ts-expect-error see above
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(BASE_FONT_PT);
    doc.text('Version comparison was skipped — no previous approved version found for this label.', MARGIN_MM, y);
    y += 10;
  }

  // ---- Cross-company results ---------------------------------------------
  if (y > 240) {
    doc.addPage();
    y = MARGIN_MM;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Cross-Company Comparison', MARGIN_MM, y);
  y += 4;

  if (run.crossCompanyResults.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(BASE_FONT_PT);
    doc.text('No comparable labels from other marketing companies were found.', MARGIN_MM, y + 4);
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Marketing Company', 'Product', 'Overall Match', 'Best Match']],
      body: run.crossCompanyResults.map((entry) => [
        entry.candidateMarketingCompany,
        entry.candidateProductName,
        entry.outcome.status === 'success' ? `${entry.outcome.result.comparison.overallPercentage}%` : 'File unavailable',
        run.bestCrossCompanyMatch?.candidateArtworkId === entry.candidateArtworkId ? 'Yes' : ''
      ]),
      styles: { fontSize: BASE_FONT_PT, cellPadding: 2.5 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
      margin: { left: MARGIN_MM, right: MARGIN_MM }
    });
  }

  doc.save(`${run.id}-comparison-report.pdf`);
}
