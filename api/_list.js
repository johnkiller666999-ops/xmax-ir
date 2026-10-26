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

// New press releases filed with the SEC (Form 8-K, Exhibit 99.1) after the newest registry entry
// are added to the list automatically.
const SH = () => ({ 'User-Agent': process.env.SEC_UA || 'XMax Inc. Investor Relations IR@XMax.com', 'Accept': '*/*' });
let memSec = { ts: 0, key: '', items: [] };
function headline(html) {
  const text = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&#\d+;/g, ' ');
  if (!/GLOBE\s*NEWSWIRE|today announced|press release/i.test(text.slice(0, 5000))) return null;
  const lines = text.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const l of lines) {
    if (/^exhibit\s*99/i.test(l)) continue;
    if (/GLOBE\s*NEWSWIRE|^[A-Z][A-Za-z .]+,\s*[A-Z][a-z]{2,8}\.?\s*\d{1,2},\s*\d{4}/.test(l)) break;
    if (l.length >= 20 && l.length <= 260) return l;
  }
  return 'XMax Inc. press release';
}
async function fromSec(cutoff) {
  if (Date.now() - memSec.ts < 6e5 && memSec.key === cutoff) return memSec.items;
  try {
    const r = await fetch('https://data.sec.gov/submissions/CIK0001473334.json', { headers: SH() });
    if (!r.ok) return memSec.items;
    const f = (await r.json()).filings.recent;
    const out = [];
    for (let i = 0; i < f.form.length && out.length < 10; i++) {
      if (f.filingDate[i] <= cutoff) break;               // the list is newest first
      if (!/^8-K/.test(f.form[i])) continue;
      const acc = f.accessionNumber[i].replace(/-/g, '');
      const base = 'https://www.sec.gov/Archives/edgar/data/1473334/' + acc + '/';
      const ix = await fetch(base + 'index.json', { headers: SH() });
      if (!ix.ok) continue;
      const names = ((await ix.json()).directory || {}).item || [];
      const ex = names.map((x) => x.name).find((n) => /ex[-_]?99[-_.]?0?1|ex99/i.test(n) && /\.html?$/i.test(n));
      if (!ex) continue;
      const d = await fetch(base + ex, { headers: SH() });
      if (!d.ok) continue;
      const title = headline(await d.text());
      if (!title) continue;                               // exhibit is not a press release
      out.push({ id: 'sec-' + acc, date: f.filingDate[i], url: base + ex, title, cat: guessCat(title), source: 'sec' });
    }
    memSec = { ts: Date.now(), key: cutoff, items: out };
    return out;
  } catch (e) { return memSec.items; }
}
const words = (t) => (String(t).toLowerCase().match(/[a-z0-9$.]{4,}/g) || []).filter((w) => !['xmax', 'announces', 'inc.'].includes(w));
function sameRelease(a, b) {
  if (Math.abs(Date.parse(a.date) - Date.parse(b.date)) > 4 * 864e5) return false;
  const wa = words(a.title), wb = new Set(words(b.title));
  return wa.length > 0 && wa.filter((w) => wb.has(w)).length / wa.length >= 0.5;
}

async function getList() {
  const rss = await fromRss();
  const cutoff = REG.reduce((m, x) => (x.date > m ? x.date : m), '');
  const sec = await fromSec(cutoff);
  const byId = new Map(REG.map((x) => [x.id, x]));
  for (const x of rss) { const old = byId.get(x.id); if (!old) byId.set(x.id, x); else if (x.rss) old.rss = x.rss; }
  for (const x of sec) if (![...byId.values()].some((y) => sameRelease(x, y))) byId.set(x.id, x);
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

module.exports = { getList, idFromUrl };
