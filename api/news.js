// GET /api/news  -> list of press releases (used by the IR site's news list)
const { getList } = require('./_list.js');
module.exports = async (req, res) => {
  const data = await getList();
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  res.status(200).json({ ts: Date.now(), data: data.map(({ id, date, cat, url, title, zh, zht }) => ({ id, date, cat, url, title, zh, zht })) });
};
