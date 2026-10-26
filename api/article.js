// GET /news/:id (via vercel.json rewrite) -> a full press-release page on the IR site.
// The text is taken from the company's own release on GlobeNewswire, cleaned, and shown in the
// IR site's design with a source card linking to the original. Pages are cached for a day.
const { getList } = require('./_list.js');
const T = {"en": {"home": "Investor Relations", "news": "Press Releases", "back": "← All press releases", "src": "Source", "orig": "Originally published on GlobeNewswire", "view": "View original", "related": "Related news", "copy": "Copy link", "copied": "Link copied", "print": "Print", "prev": "Previous", "next": "Next", "fail": "The full text could not be loaded right now. Please read the original release using the button above.", "note": "", "disclaimer": "This press release is reproduced from the company’s official distribution through GlobeNewswire. In any conflict, the original release and the company’s SEC filings control.", "nf": "Press release not found", "nfp": "This press release is not available. Return to the list of press releases.", "cats": {"M&A": "M&A", "AI": "AI", "Results": "Results", "Corporate": "Corporate"}, "loc": "en-US"}, "zh-Hans": {"home": "投资者关系", "news": "新闻稿", "back": "← 返回新闻列表", "src": "来源", "orig": "原文发布于 GlobeNewswire", "view": "查看原文", "related": "相关新闻", "copy": "复制链接", "copied": "已复制链接", "print": "打印", "prev": "上一篇", "next": "下一篇", "fail": "暂时无法加载正文，请点击上方按钮阅读原文。", "note": "以下正文为英文原文，中文翻译将在下一步接入；如有歧义，以英文原文为准。", "disclaimer": "本新闻稿转载自公司通过 GlobeNewswire 发布的正式版本。如有不一致，以原文及公司向 SEC 提交的文件为准。", "nf": "未找到该新闻稿", "nfp": "该新闻稿暂不可用，请返回新闻列表。", "cats": {"M&A": "并购", "AI": "AI", "Results": "业绩", "Corporate": "公司动态"}, "loc": "zh-CN"}, "zh-Hant": {"home": "投資者關係", "news": "新聞稿", "back": "← 返回新聞列表", "src": "來源", "orig": "原文發佈於 GlobeNewswire", "view": "查看原文", "related": "相關新聞", "copy": "複製鏈接", "copied": "已複製鏈接", "print": "打印", "prev": "上一篇", "next": "下一篇", "fail": "暫時無法加載正文，請點擊上方按鈕閱讀原文。", "note": "以下正文為英文原文，中文翻譯將在下一步接入；如有歧義，以英文原文為準。", "disclaimer": "本新聞稿轉載自公司通過 GlobeNewswire 發佈的正式版本。如有不一致，以原文及公司向 SEC 提交的文件為準。", "nf": "未找到該新聞稿", "nfp": "該新聞稿暫不可用，請返回新聞列表。", "cats": {"M&A": "併購", "AI": "AI", "Results": "業績", "Corporate": "公司動態"}, "loc": "zh-TW"}};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function balanced(html, start, tag) {
  const re = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi');
  re.lastIndex = start;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--depth === 0) return html.slice(start, m.index); }
    else if (!/\/>$/.test(m[0])) depth++;
  }
  return html.slice(start);
}
function extractBody(html) {
  const tries = [
    /<(div|section|article)\b[^>]*itemprop=["']articleBody["'][^>]*>/i,
    /<(div)\b[^>]*id=["']main-body-container["'][^>]*>/i,
    /<(div)\b[^>]*class=["'][^"']*\barticle-body\b[^"']*["'][^>]*>/i,
    /<(article)\b[^>]*>/i,
  ];
  for (const re of tries) {
    const m = re.exec(html);
    if (m) {
      const inner = balanced(html, m.index + m[0].length, m[1]);
      if (inner.replace(/<[^>]+>/g, '').trim().length > 200) return inner;
    }
  }
  return '';
}
const OK = new Set(['p','br','ul','ol','li','strong','b','em','i','u','a','table','thead','tbody','tr','td','th','h2','h3','h4','h5','blockquote','sup','sub','hr','pre']);
function clean(h) {
  h = h.replace(/<!--[\s\S]*?-->/g, '')
       .replace(/<(script|style|noscript|iframe|form|svg|button|figure|picture|video|audio|object|embed|template|select|nav|aside)\b[\s\S]*?<\/\1>/gi, '')
       .replace(/<(img|input|source|link|meta)\b[^>]*>/gi, '');
  h = h.replace(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi, (m, close, t, attrs) => {
    t = t.toLowerCase();
    if (t === 'h1') t = 'h2';
    if (!OK.has(t)) return (t === 'div' || t === 'section') ? '\n' : '';
    if (close) return '</' + t + '>';
    if (t === 'a') {
      const hm = /href\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const href = hm && /^(https?:|mailto:)/i.test(hm[1]) ? hm[1] : '';
      return href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer nofollow">' : '<a>';
    }
    if (t === 'td' || t === 'th') {
      const cs = /colspan\s*=\s*["']?(\d+)/i.exec(attrs), rs = /rowspan\s*=\s*["']?(\d+)/i.exec(attrs);
      return '<' + t + (cs ? ' colspan="' + cs[1] + '"' : '') + (rs ? ' rowspan="' + rs[1] + '"' : '') + '>';
    }
    return '<' + t + '>';
  });
  return h.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}
function meta(html, prop) {
  const m = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i').exec(html);
  return m ? m[1] : '';
}
const fmtDate = (d, loc) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const titleOf = (x, lang) => (lang === 'zh-Hans' && x.zh) || (lang === 'zh-Hant' && x.zht) || x.title;

module.exports = async (req, res) => {
  const q = req.query || {};
  const id = (String(q.id || '').match(/^\d+/) || [''])[0];
  const lang = T[q.lang] ? q.lang : 'en';
  const L = T[lang];
  const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
  const list = await getList();
  const i = list.findIndex((x) => x.id === id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (i < 0) {
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(404).send(page({ L, lang, base, id, notFound: true }));
  }
  const item = list[i];
  let body = '', summary = '';
  try {
    const r = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XMaxInvestorRelations/1.0; IR@XMax.com)', 'Accept': 'text/html' } });
    if (r.ok) {
      const html = await r.text();
      body = clean(extractBody(html));
      summary = meta(html, 'og:description') || meta(html, 'description');
    }
  } catch (e) { /* fall through to the summary view */ }
  const ok = body.replace(/<[^>]+>/g, '').trim().length > 200;
  res.setHeader('Cache-Control', ok ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=300');
  res.status(200).send(page({ L, lang, base, id, item, body: ok ? body : '', summary, prev: list[i + 1], next: list[i - 1],
    related: list.filter((x) => x.id !== id).sort((a, b) => (b.cat === item.cat) - (a.cat === item.cat)).slice(0, 4) }));
};

function page(o) {
  const { L, lang, base, id, item, body, summary, prev, next, related, notFound } = o;
  const canon = base + '/news/' + id;
  const title = notFound ? L.nf : titleOf(item, lang);
  const plain = body ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : (summary || '');
  const desc = plain.slice(0, 158);
  const date = item ? fmtDate(item.date, L.loc) : '';
  const lk = (l) => '/news/' + id + (l === 'en' ? '' : '?lang=' + l);
  const ld = item ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: item.title, datePublished: item.date,
    mainEntityOfPage: canon, isBasedOn: item.url, publisher: { '@type': 'Organization', name: 'XMax Inc.' }, author: { '@type': 'Organization', name: 'XMax Inc.' } }) : '';
  const card = (x, label) => x ? `<a class="pn" href="/news/${x.id}${lang === 'en' ? '' : '?lang=' + lang}"><small>${esc(label)}</small><span>${esc(titleOf(x, lang))}</span></a>` : '<span></span>';
  return `<!DOCTYPE html><html lang="${lang === 'en' ? 'en' : lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="dark">
<title>${esc(title)} | XMax Inc. Investor Relations</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canon}">
<link rel="alternate" hreflang="en" href="${canon}"><link rel="alternate" hreflang="zh-Hans" href="${canon}?lang=zh-Hans"><link rel="alternate" hreflang="zh-Hant" href="${canon}?lang=zh-Hant">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canon}">
${ld ? '<script type="application/ld+json">' + ld.replace(/</g, '\\u003c') + '</script>' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@500&display=swap">
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:dark;--bg:#050912;--bg2:#08101f;--surface:#0c1528;--surface2:#111d37;--line:#1c2a4a;--text:#eaf0fb;--muted:#8e9bbd;--accent:#45c8ff;--accent2:#8b7bff}
*,*::before,*::after{box-sizing:inherit}html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--text);font:400 16.5px/1.75 "IBM Plex Sans","Noto Sans SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
header{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.hd{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px}
.wm{font:700 22px Sora,sans-serif;letter-spacing:.04em;text-decoration:none;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.wm small{font:500 13px "IBM Plex Sans","Noto Sans SC",sans-serif;color:var(--muted);-webkit-text-fill-color:var(--muted);margin-left:10px;letter-spacing:0}
.lg{display:flex;gap:4px;border:1px solid var(--line);border-radius:10px;padding:3px}.lg a{color:var(--muted);text-decoration:none;font-size:13.5px;padding:5px 10px;border-radius:7px}.lg a.on{background:var(--surface2);color:var(--text)}
.top{position:relative;overflow:hidden;border-bottom:1px solid var(--line);padding:52px 0 40px;isolation:isolate}
.top::before{content:"";position:absolute;inset:-40%;z-index:-1;background:radial-gradient(30% 50% at 15% 40%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 70%),radial-gradient(30% 50% at 85% 60%,color-mix(in srgb,var(--accent2) 20%,transparent),transparent 70%)}
.top::after{content:"";position:absolute;inset:0;z-index:-1;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:60px 60px;opacity:.22;-webkit-mask-image:linear-gradient(#000,transparent);mask-image:linear-gradient(#000,transparent)}
.crumb{font:500 12.5px "JetBrains Mono","Noto Sans SC",monospace;color:var(--muted)}.crumb a{color:var(--muted);text-decoration:none}.crumb a:hover{color:var(--accent)}
.meta{display:flex;gap:10px;align-items:center;margin:22px 0 14px;flex-wrap:wrap}
.tag{font:500 12px "JetBrains Mono","Noto Sans SC",monospace;color:#04101f;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:999px;padding:3px 11px}
.dt{font:500 13px "JetBrains Mono","Noto Sans SC",monospace;color:var(--muted)}
h1{font:700 clamp(28px,4vw,44px)/1.2 Sora,"Noto Sans SC",sans-serif;margin:0;max-width:24em;letter-spacing:-.01em}
.en{color:var(--muted);margin:12px 0 0;font-size:15px;max-width:44em}
.src{position:relative;display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:30px;padding:18px 20px;border-radius:16px;background:color-mix(in srgb,var(--surface) 75%,transparent);backdrop-filter:blur(12px);border:1px solid var(--line);box-shadow:0 24px 60px -40px var(--accent)}
.src::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(120deg,var(--accent),transparent 35%,transparent 65%,var(--accent2));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.ic{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--surface2);border:1px solid var(--line);flex:none}
.st{flex:1;min-width:200px}.st small{display:block;font:500 11.5px "JetBrains Mono","Noto Sans SC",monospace;color:var(--accent);letter-spacing:.04em}.st b{font-weight:500}.st span{display:block;color:var(--muted);font-size:13.5px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:11px;text-decoration:none;font:500 14.5px "IBM Plex Sans","Noto Sans SC",sans-serif;border:1px solid var(--line);color:var(--text);background:var(--surface2);cursor:pointer}
.btn:hover{border-color:var(--accent)}.btn.p{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#04101f;border:0}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:56px;padding:48px 24px 64px}@media(max-width:940px){.grid{grid-template-columns:1fr;gap:36px}}
.note{border:1px dashed var(--accent2);color:var(--muted);border-radius:12px;padding:10px 14px;font-size:14px;margin:0 0 24px}
.body{max-width:46em}.body p{margin:0 0 1.1em}.body h2,.body h3,.body h4{font-family:Sora,"Noto Sans SC",sans-serif;margin:1.6em 0 .6em;line-height:1.3}
.body ul,.body ol{padding-left:1.3em}.body li{margin:.3em 0}.body strong,.body b{color:#fff}
.body table{border-collapse:collapse;margin:1.2em 0;font-size:14px;display:block;overflow-x:auto;max-width:100%}.body td,.body th{border:1px solid var(--line);padding:7px 10px;text-align:left}
.body blockquote{margin:1.2em 0;padding-left:16px;border-left:3px solid var(--accent);color:var(--muted)}
.fail{color:var(--muted)}
aside .box{border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:20px;position:sticky;top:90px}
aside h3{font:600 15px Sora,"Noto Sans SC",sans-serif;margin:0 0 8px}
aside .r{display:block;padding:12px 0;border-top:1px solid var(--line);text-decoration:none;color:var(--text);font-size:14px;line-height:1.5}aside .r:hover span{color:var(--accent)}aside .r small{display:block;font:500 11.5px "JetBrains Mono","Noto Sans SC",monospace;color:var(--muted)}
.tools{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.tools .btn{flex:1;justify-content:center;padding:9px 12px;font-size:13.5px}
.pnr{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-top:1px solid var(--line);padding-top:28px;margin-top:32px}@media(max-width:640px){.pnr{grid-template-columns:1fr}}
.pn{display:block;border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;color:var(--text);background:var(--surface);transition:border-color .2s,transform .2s}.pn:hover{border-color:var(--accent);transform:translateY(-2px)}
.pn small{display:block;font:500 11.5px "JetBrains Mono","Noto Sans SC",monospace;color:var(--accent);margin-bottom:4px}.pn span{font-size:14.5px;line-height:1.45}
.disc{font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);margin-top:28px;padding-top:18px}
footer{border-top:1px solid var(--line);padding:28px 0 48px;color:var(--muted);font-size:13px}
@media print{header,aside,.src .btn,.pnr,.lg{display:none!important}body{background:#fff;color:#000}.body strong{color:#000}}
</style></head><body>
<header><div class="wrap hd"><a class="wm" href="/">XMAX<small>${esc(L.home)}</small></a>
<nav class="lg" aria-label="Language"><a href="${lk('en')}" data-l="en" class="${lang === 'en' ? 'on' : ''}">EN</a><a href="${lk('zh-Hans')}" data-l="zh-Hans" class="${lang === 'zh-Hans' ? 'on' : ''}">简</a><a href="${lk('zh-Hant')}" data-l="zh-Hant" class="${lang === 'zh-Hant' ? 'on' : ''}">繁</a></nav></div></header>
<main>
<div class="top"><div class="wrap">
<div class="crumb"><a href="/">${esc(L.home)}</a> / <a href="/#news">${esc(L.news)}</a>${item ? ' / ' + esc(date) : ''}</div>
${notFound ? `<h1 style="margin-top:22px">${esc(L.nf)}</h1><p class="en">${esc(L.nfp)}</p><p><a class="btn p" href="/#news">${esc(L.back)}</a></p>` : `
<div class="meta"><span class="tag">${esc(L.cats[item.cat] || item.cat || '')}</span><span class="dt">${esc(date)}</span></div>
<h1>${esc(title)}</h1>${lang !== 'en' && title !== item.title ? `<p class="en">${esc(item.title)}</p>` : ''}
<div class="src"><span class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#45c8ff" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5M8 17h3"/></svg></span>
<span class="st"><small>${esc(L.src).toUpperCase()}</small><b>GlobeNewswire</b><span>${esc(L.orig)} · ${esc(date)}</span></span>
<a class="btn p" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(L.view)} ↗</a><button class="btn" id="cp" type="button">${esc(L.copy)}</button></div>`}
</div></div>
${notFound ? '' : `<div class="wrap grid"><article>
${lang !== 'en' && L.note ? `<p class="note">${esc(L.note)}</p>` : ''}
<div class="body">${body || `<p>${esc(summary)}</p><p class="fail">${esc(L.fail)}</p>`}</div>
<div class="pnr">${card(prev, '← ' + L.prev)}${card(next, L.next + ' →')}</div>
<p class="disc">${esc(L.disclaimer)}</p>
</article>
<aside><div class="box"><h3>${esc(L.related)}</h3>${related.map((x) => `<a class="r" href="/news/${x.id}${lang === 'en' ? '' : '?lang=' + lang}"><small>${esc(fmtDate(x.date, L.loc))}</small><span>${esc(titleOf(x, lang))}</span></a>`).join('')}
<div class="tools"><button class="btn" id="pr" type="button">${esc(L.print)}</button><a class="btn" href="/#news">${esc(L.news)}</a></div></div></aside></div>`}
</main>
<footer><div class="wrap">© ${new Date().getFullYear()} XMax Inc. · NASDAQ: XMAX · <a href="/">${esc(L.home)}</a></div></footer>
<script>
(function(){var p=new URLSearchParams(location.search);
try{if(!p.get('lang')){var s=localStorage.getItem('xmax-lang');if(s==='zh-Hans'||s==='zh-Hant'){p.set('lang',s);location.replace(location.pathname+'?'+p.toString());return}}}catch(e){}
document.querySelectorAll('.lg a').forEach(function(a){a.addEventListener('click',function(){try{localStorage.setItem('xmax-lang',a.dataset.l)}catch(e){}})});
var c=document.getElementById('cp');if(c)c.onclick=function(){var u=location.origin+location.pathname;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){c.textContent=${JSON.stringify(L.copied)}}).catch(function(){prompt('',u)})};
var pr=document.getElementById('pr');if(pr)pr.onclick=function(){print()};})();
</script></body></html>`;
}
