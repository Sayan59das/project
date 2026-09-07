from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import io
from typing import Dict, Any

class ReportingService:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.styles.add(ParagraphStyle(name='CustomNormal', parent=self.styles['Normal'], fontSize=10, leading=14))
        self.styles.add(ParagraphStyle(name='CustomHeading', parent=self.styles['Heading1'], fontSize=14, spaceAfter=12))

    def generate_pdf_report(self, evaluation_results: Dict[str, str], best_match: Any = None) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []

        # Title
        elements.append(Paragraph("Label Verification System - Comparison Report", self.styles['CustomHeading']))
        elements.append(Spacer(1, 12))

        # Summary Counts
        counts = {"🟢 MATCH": 0, "🟡 SIMILAR": 0, "🔴 CONFLICT": 0, "⚪ MISSING": 0}
        for status in evaluation_results.values():
            if status in counts:
                counts[status] += 1
        
        summary_text = (
            f"<b>Summary:</b><br/>"
            f"Matches: {counts['🟢 MATCH']}<br/>"
            f"Similar: {counts['🟡 SIMILAR']}<br/>"
            f"Conflicts: {counts['🔴 CONFLICT']}<br/>"
            f"Missing: {counts['⚪ MISSING']}"
        )
        elements.append(Paragraph(summary_text, self.styles['CustomNormal']))
        elements.append(Spacer(1, 24))

        # Detail Table
        elements.append(Paragraph("Detailed Parameter Evaluation:", self.styles['CustomHeading']))
        table_data = [["Parameter", "Status"]]
        
        for param, status in evaluation_results.items():
            table_data.append([param.replace('_', ' ').title(), status])
            
        t = Table(table_data, colWidths=[250, 150])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        elements.append(t)
        elements.append(Spacer(1, 24))
        
        # Best Match Cross-Company (Stage 2)
        if best_match:
            elements.append(Paragraph("Best Cross-Company Match:", self.styles['CustomHeading']))
            label = best_match['label']
            match_details = f"Marketing Company: {label.marketing_company} | Product: {label.product_name}"
            elements.append(Paragraph(match_details, self.styles['CustomNormal']))
        else:
            elements.append(Paragraph("No Cross-Company Comparison Available.", self.styles['CustomNormal']))

        doc.build(elements)
        return buffer.getvalue()
