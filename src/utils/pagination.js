// Reads ?page= and ?limit= off the query string with sane defaults/limits,
// so every resource's list endpoint behaves identically.
function buildPagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

module.exports = { buildPagination };
