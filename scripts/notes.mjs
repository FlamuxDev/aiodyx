#!/usr/bin/env node
// Owner tooling: prints the review notes collected by worker/feedback.js as a Markdown report,
// grouped by page, then by section (open notes first).
//
//   npm run notes                       all notes
//   npm run notes -- --open             only open notes
//   npm run notes -- --page /ar/faq/    only pages whose path contains this text
//   npm run notes -- --file notes.json  read a local copy instead of GitHub
//
// Reads feedback/notes.json from the `feedback` branch with `gh api` (authenticated, works for private repos)
// and falls back to the public raw URL when gh is unavailable.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    open: { type: 'boolean', default: false },
    page: { type: 'string' },
    file: { type: 'string' },
    repo: { type: 'string', default: 'FlamuxDev/aiodyx' },
    branch: { type: 'string', default: 'feedback' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opt.help) {
  console.log('Usage: npm run notes -- [--open] [--page <text>] [--file <local.json>] [--repo owner/name] [--branch name]');
  process.exit(0);
}

const PATH = 'feedback/notes.json';
const rawBase = `https://raw.githubusercontent.com/${opt.repo}/${opt.branch}`;

async function load() {
  if (opt.file) return JSON.parse(readFileSync(opt.file, 'utf8'));
  try {
    const out = execFileSync('gh', ['api', `repos/${opt.repo}/contents/${PATH}?ref=${opt.branch}`, '-H', 'Accept: application/vnd.github.raw+json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out);
  } catch (err) {
    console.error(`gh api failed (${String(err.stderr || err.message).trim().split('\n')[0]}); trying the public raw URL...`);
    const res = await fetch(`${rawBase}/${PATH}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`Could not read ${PATH}: HTTP ${res.status}`);
    return res.json();
  }
}

/** Old flat-shape notes ({quote, context, section, selector}) are mapped to the current schema. */
function normalize(n) {
  const anchor = n.anchor || { exact: n.quote || '', prefix: '', suffix: '', selector: n.selector || '', section: n.section || '', element: '' };
  return {
    ...n,
    anchor,
    kind: n.kind || (anchor.exact ? 'text' : 'page'),
    status: n.status === 'resolved' ? 'resolved' : 'open',
    updatedAt: n.updatedAt || n.createdAt,
    replies: n.replies || [],
  };
}

const fmt = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '');
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const quoteBlock = (s) => String(s).trim().split('\n').map((l) => `> ${l}`).join('\n');
const byCreated = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

const notes = (await load()).map(normalize).sort(byCreated);

// Numbers match the review panel: position of the note among all notes of its page, oldest first.
const numbers = new Map();
const perPage = new Map();
for (const n of notes) {
  const k = (perPage.get(n.page) || 0) + 1;
  perPage.set(n.page, k);
  numbers.set(n.id, k);
}

const shown = notes.filter((n) => (!opt.open || n.status === 'open') && (!opt.page || n.page.includes(opt.page)));
const openCount = shown.filter((n) => n.status === 'open').length;

const out = [];
out.push(`# Review notes`, '', `${shown.length} note${shown.length === 1 ? '' : 's'} shown, ${openCount} open${opt.open ? ' (open only)' : ''}${opt.page ? `, pages matching \`${opt.page}\`` : ''}.`);
if (!shown.length) {
  console.log(out.join('\n') + '\n\nNothing to show.');
  process.exit(0);
}

const pages = [...new Set(shown.map((n) => n.page))].sort();
for (const page of pages) {
  const inPage = shown.filter((n) => n.page === page);
  out.push('', `## ${page}`, '', `${inPage.filter((n) => n.status === 'open').length} open, ${inPage.filter((n) => n.status === 'resolved').length} resolved`);

  const sections = new Map();
  for (const n of inPage) {
    const key = oneLine(n.anchor.section) || 'General';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(n);
  }
  // Sections with open notes first, then the rest; inside a section: open before resolved, oldest first.
  const order = [...sections.entries()].sort(([ka, a], [kb, b]) => {
    const oa = a.some((n) => n.status === 'open') ? 0 : 1;
    const ob = b.some((n) => n.status === 'open') ? 0 : 1;
    return oa - ob || ka.localeCompare(kb);
  });
  for (const [section, list] of order) {
    out.push('', `### ${section}`);
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || byCreated(a, b));
    for (const n of list) {
      const a = n.anchor;
      const kind = n.kind === 'text' ? 'text' : n.kind === 'element' ? 'element' : 'page';
      out.push('', `#### #${numbers.get(n.id)} [${n.status.toUpperCase()}] ${kind} note`);
      if (n.kind === 'text') out.push('', quoteBlock(a.exact));
      if (n.kind === 'element') out.push('', `Element: \`${oneLine(a.element) || a.selector}\``);
      if (a.selector) out.push('', `Selector: \`${a.selector}\``);
      out.push('', n.note.trim());
      const meta = [`${n.name || 'Visitor'}`, fmt(n.createdAt), n.editedAt && 'edited', n.viewport && `viewport ${n.viewport}`, n.lang && `lang ${n.lang}`].filter(Boolean);
      out.push('', `— ${meta.join(' · ')} · id \`${n.id}\``);
      if (n.shot) out.push('', `Screenshot: ${rawBase}/${n.shot}`);
      if (n.replies.length) {
        out.push('', 'Replies:');
        for (const r of n.replies) out.push(`- **${r.name || 'Visitor'}** (${fmt(r.createdAt)}): ${oneLine(r.text)}`);
      }
    }
  }
}
console.log(out.join('\n'));
