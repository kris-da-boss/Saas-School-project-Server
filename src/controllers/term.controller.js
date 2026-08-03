const asyncHandler = require("express-async-handler");
const Term = require("../models/Term");

// PUT /api/v1/terms  (admin only)
// Body: { term, session, startDate, endDate }
// Upsert: setting dates for a term that already exists updates it rather
// than erroring, since admins will revisit this each new session.
const upsertTerm = asyncHandler(async (req, res) => {
  const { term, session, startDate, endDate } = req.body;

  if (!term || !session || !startDate || !endDate) {
    res.status(400);
    throw new Error("term, session, startDate and endDate are all required");
  }
  if (new Date(startDate) >= new Date(endDate)) {
    res.status(400);
    throw new Error("startDate must be before endDate");
  }

  const termDoc = await Term.findOneAndUpdate(
    { schoolId: req.schoolId, term, session },
    { $set: { schoolId: req.schoolId, term, session, startDate, endDate } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: termDoc });
});

// GET /api/v1/terms?term=&session=  (admin, teacher)
const getTerm = asyncHandler(async (req, res) => {
  const { term, session } = req.query;
  if (!term || !session) {
    res.status(400);
    throw new Error("term and session query parameters are required");
  }

  const termDoc = await Term.findOne({ schoolId: req.schoolId, term, session });
  res.status(200).json({ success: true, data: termDoc }); // null is a valid answer - "not set yet"
});

module.exports = { upsertTerm, getTerm };
