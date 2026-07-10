const { sql } = require('../_lib/db');

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const rows = await sql`select payload from quote_shares where id = ${id} limit 1`;
      if (!rows.length) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json(rows[0].payload);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'query_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
