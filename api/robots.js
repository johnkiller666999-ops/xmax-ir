// GET /robots.txt (via vercel.json rewrite)
module.exports = (req, res) => {
  const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`);
};
