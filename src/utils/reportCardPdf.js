const PDFDocument = require("pdfkit");

// Fetches an image (logo, student photo) as a Buffer for PDFKit to embed.
// Both come from Cloudinary URLs, so we have to download the bytes first -
// PDFKit can't embed a remote URL directly. Returns null on any failure
// (missing image, network hiccup, unsupported format) rather than throwing,
// so a broken photo link never prevents the report card from generating -
// it just renders without that one image.
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// Minimal table renderer: PDFKit has no built-in table primitive, so this
// draws column headers + rows using explicit x-positions, with a border
// rectangle per row for a clean, readable grid rather than free-floating text.
function drawTable(doc, { x, y, columns, rows }) {
  const rowHeight = 22;
  let currentY = y;

  // Header row
  doc.font("Helvetica-Bold").fontSize(9);
  doc.rect(x, currentY, columns.reduce((sum, c) => sum + c.width, 0), rowHeight).stroke("#D8CFBC");
  let colX = x;
  columns.forEach((col) => {
    doc.text(col.label, colX + 6, currentY + 6, { width: col.width - 8, align: col.align || "left" });
    colX += col.width;
  });
  currentY += rowHeight;

  // Body rows
  doc.font("Helvetica").fontSize(9);
  rows.forEach((row) => {
    doc
      .rect(x, currentY, columns.reduce((sum, c) => sum + c.width, 0), rowHeight)
      .stroke("#D8CFBC");
    let cx = x;
    columns.forEach((col) => {
      const value = row[col.key] ?? "";
      doc.text(String(value), cx + 6, currentY + 6, { width: col.width - 8, align: col.align || "left" });
      cx += col.width;
    });
    currentY += rowHeight;
  });

  return currentY; // so the caller knows where the table ended
}

async function generateReportCardPdf(reportCard, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftX = doc.page.margins.left;

  // --- Header: logo + school name + student photo ------------------------
  const [logoBuffer, photoBuffer] = await Promise.all([
    fetchImageBuffer(reportCard.school?.logoUrl),
    fetchImageBuffer(reportCard.student?.photoUrl),
  ]);

  const headerTop = doc.y;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, leftX, headerTop, { width: 50, height: 50, fit: [50, 50] });
    } catch {
      // Corrupt/unsupported image data - skip it silently, don't break the PDF
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(reportCard.school?.name || "School Report Card", leftX + 60, headerTop + 4, {
      width: pageWidth - 60 - 60,
    });
  doc
    .font("Helvetica")
    .fontSize(11)
    .text("Student Report Card", leftX + 60, headerTop + 26, { width: pageWidth - 60 - 60 });

  if (photoBuffer) {
    try {
      doc.image(photoBuffer, leftX + pageWidth - 55, headerTop, { width: 55, height: 55, fit: [55, 55] });
    } catch {
      // same graceful skip as the logo
    }
  }

  doc.y = headerTop + 65;
  doc.moveDown(0.5);
  doc
    .moveTo(leftX, doc.y)
    .lineTo(leftX + pageWidth, doc.y)
    .stroke("#1B2A4A");
  doc.moveDown(0.8);

  // --- Student details ------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(11).text(reportCard.student.fullName);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      `Admission No: ${reportCard.student.admissionNo}   |   Class: ${
        reportCard.student.className || "—"
      }`
    );
  doc.text(`Term: ${reportCard.term}   |   Session: ${reportCard.session}`);
  doc.moveDown(1);

  // --- Subject results table -------------------------------------------
  doc.font("Helvetica-Bold").fontSize(12).text("Subject Results");
  doc.moveDown(0.4);

  if (reportCard.subjects.length === 0) {
    doc.font("Helvetica").fontSize(10).text("No results recorded for this term yet.");
  } else {
    const columns = [
      { key: "subject", label: "Subject", width: pageWidth * 0.32 },
      { key: "ca", label: "CA", width: pageWidth * 0.14, align: "center" },
      { key: "exam", label: "Exam", width: pageWidth * 0.14, align: "center" },
      { key: "total", label: "Total", width: pageWidth * 0.14, align: "center" },
      { key: "grade", label: "Grade", width: pageWidth * 0.13, align: "center" },
      { key: "remark", label: "Remark", width: pageWidth * 0.13, align: "center" },
    ];
    const rows = reportCard.subjects.map((s) => ({
      subject: `${s.subject} (${s.code})`,
      ca: `${s.caScore}/${s.maxCA}`,
      exam: `${s.examScore}/${s.maxExamScore}`,
      total: `${s.total}/${s.maxScore}`,
      grade: s.grade,
      remark: s.remark,
    }));
    const endY = drawTable(doc, { x: leftX, y: doc.y, columns, rows });
    doc.y = endY + 10;
  }

  // --- Summary: total, average, overall grade, position ------------------
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(`Total Score: ${reportCard.totalScore} / ${reportCard.totalMax}`);
  doc.text(`Average: ${reportCard.average}%`);
  if (reportCard.overallGrade) doc.text(`Overall Grade: ${reportCard.overallGrade}`);
  if (reportCard.position) {
    doc.text(`Position in Class: ${reportCard.position} of ${reportCard.classSize}`);
  }
  doc.moveDown(1);

  // --- Attendance summary (only if the term's dates have been set) -------
  if (reportCard.attendance) {
    doc.font("Helvetica-Bold").fontSize(12).text("Attendance Summary");
    doc.font("Helvetica").fontSize(10).moveDown(0.3);
    const a = reportCard.attendance;
    doc.text(
      `Present: ${a.present}   Absent: ${a.absent}   Late: ${a.late}   Excused: ${a.excused}   ` +
        `(${a.totalDays} school day${a.totalDays === 1 ? "" : "s"} recorded)`
    );
    doc.moveDown(1);
  }

  // --- Comments ------------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(11).text("Teacher's Comment");
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(reportCard.teacherComment || "—", { width: pageWidth });
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).text("Principal's Comment");
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(reportCard.principalComment || "—", { width: pageWidth });

  // --- Footer ------------------------------------------------------------
  doc
    .fontSize(8)
    .fillColor("#888888")
    .text(`Generated on ${new Date().toLocaleDateString()}`, leftX, doc.page.height - 50, {
      width: pageWidth,
      align: "center",
    });

  doc.end();
}

module.exports = generateReportCardPdf;
