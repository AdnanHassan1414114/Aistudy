import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { Knowledge } from "@prisma/client";

/**
 * Renders the knowledge's latest markdown notes as a PDF and streams it
 * directly to the response — nothing is written to disk. Deliberately
 * simple: title, headings, tables, code blocks, page numbers. No styling
 * engine or syntax highlighting.
 */
export class PdfService {
  generateNotesPdf(knowledge: Knowledge): PassThrough {
    const stream = new PassThrough();
    const doc = new PDFDocument({ margin: 50, bufferPages: true, info: { Title: knowledge.title } });
    doc.pipe(stream);

    this.renderHeader(doc, knowledge);
    this.renderMarkdownBody(doc, knowledge.notes ?? "");
    this.renderPageNumbers(doc);

    doc.end();
    return stream;
  }

  private renderHeader(doc: PDFKit.PDFDocument, knowledge: Knowledge): void {
    doc.fontSize(22).font("Helvetica-Bold").text(knowledge.title);
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text([knowledge.channelName, knowledge.youtubeUrl].filter(Boolean).join("  |  "));
    doc.fillColor("#000000");
    doc.moveDown(1);
  }

  /** Lightweight markdown → PDF renderer: headings, lists, tables, and code blocks. */
  private renderMarkdownBody(doc: PDFKit.PDFDocument, markdown: string): void {
    const lines = markdown.split("\n");
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        doc.font("Courier").fontSize(9).fillColor("#1a1a1a").text(line, { indent: 15 });
      } else if (line.startsWith("# ")) {
        doc.moveDown(0.5).font("Helvetica-Bold").fontSize(18).fillColor("#000000").text(line.slice(2));
      } else if (line.startsWith("## ")) {
        doc.moveDown(0.5).font("Helvetica-Bold").fontSize(14).fillColor("#000000").text(line.slice(3));
      } else if (line.startsWith("### ")) {
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(12).fillColor("#000000").text(line.slice(4));
      } else if (/^\|.*\|$/.test(line.trim())) {
        // Simple table row rendering, monospaced so columns stay aligned.
        doc.font("Courier").fontSize(9).fillColor("#222222").text(line.trim());
      } else if (/^[-*]\s+/.test(line)) {
        doc.font("Helvetica").fontSize(10).fillColor("#222222").text(`•  ${line.replace(/^[-*]\s+/, "")}`, { indent: 15 });
      } else if (/^\d+\.\s+/.test(line)) {
        doc.font("Helvetica").fontSize(10).fillColor("#222222").text(line, { indent: 15 });
      } else if (line.trim() === "") {
        doc.moveDown(0.4);
      } else {
        doc.font("Helvetica").fontSize(10).fillColor("#222222").text(line);
      }
    }
  }

  private renderPageNumbers(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor("#999999")
        .text(`Page ${i + 1} of ${range.count}`, 0, doc.page.height - 40, { align: "center" });
    }
  }
}

export const pdfService = new PdfService();
