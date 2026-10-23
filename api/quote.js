// Vercel serverless function: GET /api/quote
// Returns a delayed stock quote for XMAX from a market-data provider (Finnhub by default).
// Set the environment variable QUOTE_API_KEY in Vercel. Displaying quotes on a public
// company website usually needs a commercial/display licence from the provider: confirm
// the terms before the official launch.

const SYMBOL = 'XMAX';

module.exports = async (req, res) => {
  try {
    const key = process.env.QUOTE_API_KEY;
    if (!key) throw new Error('No API key');
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${SYMBOL}&token=${key}`);
    if (!r.ok) throw new Error('Quote ' + r.status);
    const q = await r.json(); // { c: price, d: change, dp: change %, pc: previous close, t: unix seconds }
    if (!q || typeof q.c !== 'number' || q.c === 0) throw new Error('Empty quote');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    res.status(200).json({
      ts: Date.now(),
      data: {
        price: q.c,
        change: q.d ?? 0,
        changePct: q.dp ?? 0,
        prevClose: q.pc,
        time: (q.t || Math.floor(Date.now() / 1000)) * 1000,
        source: 'Delayed',
      },
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'unavailable' });
  }
};
