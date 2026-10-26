// Builds the full press-release list: the saved registry plus anything new in the GlobeNewswire RSS feed.
// Optional environment variable in Vercel:
//   GNW_RSS = the RSS feed address of the company's GlobeNewswire newsroom
//             (on globenewswire.com, open the XMax organization page and copy its RSS link)
const REG = require('./_news.js');

function idFromUrl(u) {
  const m = /news-release\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//.exec(u || '');
  return m ? m[1] : null;
}
function guessCat(t) {
  if (/financial results/i.test(t)) return 'Results';
  if (/acqui|merger/i.test(t)) return 'M&A';
  if (/\bAI\b|artificial intelligence|GPU|inference/i.test(t)) return 'AI';
  return 'Corporate';
}
function decode(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

async function fromRss() {
  const feed = process.env.GNW_RSS;
  if (!feed) return [];
  try {
    const r = await fetch(feed, { headers: { 'User-Agent': 'XMax Investor Relations website' } });
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1];
      const get = (tag) => { const x = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>').exec(it); return x ? decode(x[1]) : ''; };
      const url = get('link'), title = get('title'), id = idFromUrl(url);
      if (!id || !title) continue;
      const d = new Date(get('pubDate'));
      const cm = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(it);
      const rich = cm ? decode(cm[1]) : get('description');
      out.push({ id, url, title, date: isNaN(d) ? '' : d.toISOString().slice(0, 10), cat: guessCat(title), rss: rich });
    }
    return out;
  } catch (e) { return []; }
}

async function getList() {
  const rss = await fromRss();
  const byId = new Map(REG.map((x) => [x.id, x]));
  for (const x of rss) { const old = byId.get(x.id); if (!old) byId.set(x.id, x); else if (x.rss) old.rss = x.rss; }
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

module.exports = { getList, idFromUrl };
