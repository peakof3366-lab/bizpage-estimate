const { requireAdmin } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  res.status(200).json({ ok: true });
};
