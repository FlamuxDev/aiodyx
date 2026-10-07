// Builds a single self-contained HTML page with EN and AR copy side by side.
// usage: node scripts/copy-table.mjs  → aiodyx-content.html
import { readFileSync, writeFileSync } from 'node:fs';
const en = JSON.parse(readFileSync(new URL('../content/en.json', import.meta.url)));
const ar = JSON.parse(readFileSync(new URL('../content/ar.json', import.meta.url)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Walk EN, read the same path from AR. Array items with a slug are named by it.
const rows = [];
function walk(e, a, path) {
  if (e && typeof e === 'object') {
    for (const k of Object.keys(e)) {
      const label = Array.isArray(e) ? (e[k]?.slug ?? String(+k + 1)) : k;
      walk(e[k], a?.[k], [...path, label]);
    }
  } else rows.push({ path, en: e ?? '', ar: a ?? '' });
}
walk(en, ar, []);

// Group by first two path parts: "pages › home", "apps › accounting", "site › nav"...
const groups = new Map();
for (const r of rows) {
  const g = r.path.slice(0, 2).join(' › ');
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}
const id = g => 'g-' + g.replace(/[^a-z0-9]+/gi, '-');
const missing = rows.filter(r => r.en === '' || r.ar === '').length;
const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const enWords = rows.reduce((n, r) => n + words(r.en), 0);
const arWords = rows.reduce((n, r) => n + words(r.ar), 0);

const nav = [...groups.keys()].map(g => `<a href="#${id(g)}">${esc(g)} <small>${groups.get(g).length}</small></a>`).join('');
const body = [...groups].map(([g, rs]) => `
<tbody class="grp" id="${id(g)}">
  <tr class="gh"><th colspan="4">${esc(g)}<span>${rs.length}</span></th></tr>
  ${rs.map((r, i) => `<tr class="row${r.en === '' || r.ar === '' ? ' miss' : ''}">
    <td class="n">${i + 1}</td>
    <td class="k">${esc(r.path.slice(2).join(' › ') || r.path.at(-1))}</td>
    <td class="en" lang="en" dir="ltr">${esc(r.en)}</td>
    <td class="ar" lang="ar" dir="rtl">${esc(r.ar)}</td>
  </tr>`).join('')}
</tbody>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIODYX — Website copy (EN / AR)</title>
<style>
:root{--ink:#18181b;--mute:#6b6b73;--line:#ececee;--bg:#f4f4f5;--brand:#7b5cf0;--soft:#f3effe}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:14px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0}h1 b{color:var(--brand)}
.stats{color:var(--mute);font-size:13px}
input[type=search]{flex:1;min-width:220px;padding:10px 16px;border:1px solid var(--line);border-radius:999px;font:inherit;background:var(--bg)}
input[type=search]:focus{outline:2px solid var(--brand);background:#fff}
label{font-size:13px;color:var(--mute);display:flex;gap:6px;align-items:center}
button{font:inherit;border:0;border-radius:999px;padding:9px 16px;background:var(--ink);color:#fff;cursor:pointer}
.wrap{display:grid;grid-template-columns:240px 1fr;gap:20px;padding:20px 24px}
nav{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;background:#fff;border-radius:16px;padding:10px}
nav a{display:flex;justify-content:space-between;padding:6px 10px;border-radius:10px;color:var(--ink);text-decoration:none;font-size:13px}
nav a:hover{background:var(--soft)}nav small{color:var(--mute)}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:16px;overflow:clip;table-layout:fixed}
thead th{position:sticky;top:var(--hh,72px);z-index:2;background:var(--ink);color:#fff;text-align:start;padding:12px 14px;font-weight:600}
thead th.ar{text-align:right;font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,sans-serif}
col.n{width:48px}col.k{width:200px}
.gh th{background:var(--soft);color:var(--brand);text-align:start;padding:12px 14px;font-size:15px;scroll-margin-top:120px}
.gh span{margin-inline-start:8px;color:var(--mute);font-weight:400;font-size:12px}
td{padding:12px 14px;border-top:1px solid var(--line);vertical-align:top;word-wrap:break-word;white-space:pre-wrap}
td.n{color:var(--mute);font-size:12px}td.k{color:var(--mute);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
td.ar{font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,sans-serif;font-size:15px;line-height:1.8}
td.en,td.ar{cursor:copy}td.en:hover,td.ar:hover{background:#fafafa}
tr.miss td{background:#fff4f2}
.copied{background:var(--soft)!important}
.hide{display:none}
mark{background:#ffe9a8;color:inherit;border-radius:3px}
.toast{position:fixed;bottom:20px;inset-inline-start:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:8px 16px;border-radius:999px;font-size:13px;opacity:0;transition:.2s}
.toast.on{opacity:1}
@media (max-width:900px){.wrap{grid-template-columns:1fr}nav{display:none}col.k{width:110px}}
@media print{header,nav,.toast{display:none}.wrap{display:block;padding:0}thead th{position:static}body{background:#fff}td{break-inside:avoid}}
</style></head>
<body>
<header>
  <h1><b>AIODYX</b> · Website copy EN / AR</h1>
  <span class="stats">${rows.length} texts · ${groups.size} sections · EN ${enWords.toLocaleString()} words · AR ${arWords.toLocaleString()} words${missing ? ` · <b style="color:#c2410c">${missing} missing</b>` : ''}</span>
  <input type="search" id="q" placeholder="Search English or Arabic… / ابحث بالعربي أو الإنجليزي" autofocus>
  <label><input type="checkbox" id="keys" checked> Show keys</label>
  <button onclick="print()">Print / PDF</button>
</header>
<div class="wrap">
  <nav>${nav}</nav>
  <table>
    <colgroup><col class="n"><col class="k"><col><col></colgroup>
    <thead><tr><th>#</th><th class="kh">Key</th><th>English</th><th class="ar">العربي</th></tr></thead>
    ${body}
  </table>
</div>
<div class="toast" id="t">Copied</div>
<script>
const setH = () => document.documentElement.style.setProperty('--hh', document.querySelector('header').offsetHeight + 'px'); setH(); addEventListener('resize', setH);
const q = document.getElementById('q'), rows = [...document.querySelectorAll('tr.row')];
rows.forEach(r => r.querySelectorAll('.en,.ar').forEach(td => td.dataset.raw = td.textContent));
q.addEventListener('input', () => {
  const v = q.value.trim().toLowerCase();
  const re = v ? new RegExp(v.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'gi') : null;
  rows.forEach(r => {
    const hit = !v || r.textContent.toLowerCase().includes(v);
    r.classList.toggle('hide', !hit);
    r.querySelectorAll('.en,.ar').forEach(td => {
      const t = td.dataset.raw.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      td.innerHTML = re && hit ? t.replace(re, m => '<mark>' + m + '</mark>') : t;
    });
  });
  document.querySelectorAll('tbody.grp').forEach(g => g.classList.toggle('hide', !g.querySelector('tr.row:not(.hide)')));
});
document.getElementById('keys').addEventListener('change', e => {
  document.querySelectorAll('td.k,th.kh').forEach(c => c.classList.toggle('hide', !e.target.checked));
  document.querySelector('col.k').style.width = e.target.checked ? '' : '0';
});
const t = document.getElementById('t');
document.querySelector('table').addEventListener('click', e => {
  const td = e.target.closest('td.en,td.ar'); if (!td || getSelection().toString()) return;
  navigator.clipboard.writeText(td.dataset.raw).then(() => {
    td.classList.add('copied'); t.classList.add('on');
    setTimeout(() => { td.classList.remove('copied'); t.classList.remove('on'); }, 900);
  });
});
</script>
</body></html>`;
writeFileSync(new URL('../aiodyx-content.html', import.meta.url), html);
console.log(`rows=${rows.length} groups=${groups.size} missing=${missing} en=${enWords} ar=${arWords}`);
