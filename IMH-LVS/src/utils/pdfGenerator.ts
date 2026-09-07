import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime } from './dateFormat';
import { classifyDeviation } from '../components/labelComparison/DeviationsPanel';
import type { LabelComparisonFieldResult } from '../types/labelComparison';
import type { LabelComparisonRun, CrossCompanyResultEntry } from '../types/labelComparisonRecord';

// Reuse the version formatter from ComparisonDetailPage
function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

export function generateComparisonPDF(run: LabelComparisonRun) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Header & Title
  doc.setFontSize(22);
  doc.setTextColor(0, 166, 81); // IMH Green theme
  doc.text('IMH Label Verification System', 14, 20);

  doc.setFontSize(16);
  doc.setTextColor(46, 49, 53);
  doc.text('Comparison Report', 14, 30);

  // 2. Summary Metadata Table
  doc.setFontSize(10);
  const metadata = [
    ['Comparison ID', run.id],
    ['Product Name', run.productName],
    ['Marketing Company', run.marketingCompany],
    ['Label Artwork', `${run.candidateArtworkFileName} (${formatVersionLabel(run.candidateArtworkVersion)})`],
    ['Compared By', run.comparedBy],
    ['Date', formatDateTime(run.comparisonDate)]
  ];

  autoTable(doc, {
    startY: 40,
    body: metadata,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [107, 113, 119], cellWidth: 50 }
    }
  });

  // 3. Version Comparison
  // @ts-ignore
  let currentY = doc.lastAutoTable.finalY + 15;

  if (run.versionComparison) {
    const vc = run.versionComparison;
    doc.setFontSize(14);
    doc.setTextColor(46, 49, 53);
    doc.text(`Version Comparison (Overall Match: ${vc.result.comparison.overallPercentage}%)`, 14, currentY);
    currentY += 5;

    doc.setFontSize(10);
    doc.setTextColor(158, 164, 171);
    doc.text(`Compared against Latest Approved — ${vc.approvedArtworkFileName} (${formatVersionLabel(vc.approvedArtworkVersion)})`, 14, currentY + 3);
    currentY += 8;

    const tableData = vc.result.comparison.fields.map((field: LabelComparisonFieldResult) => {
      const status = classifyDeviation(field);
      // Clean up UI-specific emojis/text formatting for the PDF
      let statusText: string = status;
      if (status === 'MATCH') statusText = 'MATCH';
      if (status === 'MODIFIED') statusText = 'SIMILAR';
      if (status === 'CONFLICTING') statusText = 'CONFLICT';
      if (status === 'MISSING') statusText = 'MISSING';
      if (status === 'NOT_COMPARED') statusText = 'N/A';

      return [
        field.label,
        field.labelA || '—',
        field.labelB || '—',
        statusText
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Parameter', 'Label Artwork', 'Latest Approved', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [243, 247, 250], textColor: [46, 49, 53], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 60 },
        2: { cellWidth: 60 },
        3: { cellWidth: 25, fontStyle: 'bold' }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'MATCH') data.cell.styles.textColor = [0, 166, 81];
          else if (val === 'SIMILAR') data.cell.styles.textColor = [226, 155, 23];
          else if (val === 'CONFLICT') data.cell.styles.textColor = [211, 47, 47];
          else if (val === 'MISSING') data.cell.styles.textColor = [25, 118, 210];
        }
      }
    });

    // @ts-expect-error - jspdf-autotable extends jsPDF
    currentY = doc.lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(14);
    doc.setTextColor(46, 49, 53);
    doc.text('Version Comparison Skipped', 14, currentY);
    
    doc.setFontSize(10);
    doc.setTextColor(158, 164, 171);
    doc.text('No previous approved version was found for this label.', 14, currentY + 7);
    currentY += 20;
  }

  // Check if we need a page break before Cross-Company Comparison
  if (currentY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    currentY = 20;
  }

  // 4. Cross-Company Comparison
  doc.setFontSize(14);
  doc.setTextColor(46, 49, 53);
  doc.text('Cross-Company Comparison', 14, currentY);
  currentY += 5;

  if (run.crossCompanyResults.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(158, 164, 171);
    doc.text('No comparable labels from other marketing companies were found.', 14, currentY + 3);
  } else {
    const ccData = run.crossCompanyResults.map((entry: CrossCompanyResultEntry) => {
      const score = entry.outcome.status === 'success' ? `${entry.outcome.result.comparison.overallPercentage}%` : 'File unavailable';
      return [
        entry.candidateMarketingCompany,
        entry.candidateProductName,
        score
      ];
    });

    autoTable(doc, {
      startY: currentY + 3,
      head: [['Marketing Company', 'Product Name', 'Similarity Score']],
      body: ccData,
      theme: 'grid',
      headStyles: { fillColor: [243, 247, 250], textColor: [46, 49, 53], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 }
    });
  }

  // 5. Footer (Page numbers)
  // @ts-expect-error - jspdf-autotable extends jsPDF
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(158, 164, 171);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
  }

  // Save the PDF
  doc.save(`${run.id}-comparison-report.pdf`);
}
