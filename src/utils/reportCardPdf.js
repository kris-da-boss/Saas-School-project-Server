const PDFDocument = require("pdfkit");

// Deliberately simple layout: sequential doc.text() calls let PDFKit handle
// line-wrapping and vertical flow automatically. A precisely positioned
// grid/table is possible with PDFKit but requires manual x/y coordinate
// tracking for every cell - exactly the fragile, fiddly part worth avoiding
// for a first version. Visual polish can come later in a dedicated design pass.
function generateReportCardPdf(reportCard, res) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("Report Card", { align: "center" });
  doc.moveDown();

  doc.fontSize(11).font("Helvetica");
  doc.text(`Student: ${reportCard.student.fullName}`);
  doc.text(`Admission No: ${reportCard.student.admissionNo}`);
  doc.text(`Term: ${reportCard.term}`);
  doc.text(`Session: ${reportCard.session}`);
  doc.moveDown();

  doc.fontSize(12).font("Helvetica-Bold").text("Subject Results");
  doc.fontSize(10).font("Helvetica");
  doc.moveDown(0.5);

  if (reportCard.subjects.length === 0) {
    doc.text("No results recorded for this term yet.");
  } else {
    reportCard.subjects.forEach((s) => {
      doc.text(
        `${s.subject} (${s.code})   —   ${s.score}/${s.maxScore}   —   Grade ${s.grade}   —   ${s.remark}`
      );
    });
  }

  doc.moveDown();
  doc.fontSize(12).font("Helvetica-Bold");
  doc.text(`Overall Average: ${reportCard.average}%`);
  if (reportCard.position) {
    doc.text(`Position in Class: ${reportCard.position} of ${reportCard.classSize}`);
  }

  doc.end();
}

module.exports = generateReportCardPdf;
