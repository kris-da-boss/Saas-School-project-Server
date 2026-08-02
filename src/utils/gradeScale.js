// A standard percentage-based grading scale. Centralized here so a score
// entered during grading and a score displayed on a report card always
// produce the exact same letter grade - never computed twice in two places
// that could drift apart.
function computeGrade(score, maxScore) {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 70) return { grade: "A", remark: "Excellent" };
  if (percentage >= 60) return { grade: "B", remark: "Very Good" };
  if (percentage >= 50) return { grade: "C", remark: "Good" };
  if (percentage >= 45) return { grade: "D", remark: "Pass" };
  if (percentage >= 40) return { grade: "E", remark: "Fair" };
  return { grade: "F", remark: "Fail" };
}

module.exports = computeGrade;
