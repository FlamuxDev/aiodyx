// Review-notes API for the AIODYX site. Stores everything in the GitHub repo (branch kept off main so notes
// never redeploy the site):  feedback/notes.json  (array of notes)  and  feedback/shots/<id>.<ext>  (screenshots).
//
// Config (wrangler.toml vars + `wrangler secret put GITHUB_TOKEN`):
//   GITHUB_TOKEN    fine-grained PAT, Contents: read & write on the repo only
//   REPO            owner/name          BRANCH   branch that holds the notes
//   FILE            notes file path     SHOTS    screenshots directory
//   ALLOWED_ORIGINS comma-separated origins allowed to call the API
//
// Routes (JSON, CORS-allowlisted):
//   GET    /notes?page=<path|all>            list (token hashes stripped; own items flagged when X-Author-Token is sent)
//   POST   /notes                            create {page, lang, kind, anchor, note, name, viewport, authorToken, shot?}
//   PATCH  /notes/:id                        {status} (anyone) and/or {note} (author token)
//   DELETE /notes/:id                        author token
//   POST   /notes/:id/replies                {name, text, authorToken}
//   PATCH  /notes/:id/replies/:rid           {text} (author token)
//   DELETE /notes/:id/replies/:rid           author token
//   POST   /notes/:id/shot                   {image} attach/replace a screenshot (author token)
//   GET    /shots/<id>.<ext>                 screenshot proxy (works even if the repo is private)
// The author token travels in the X-Author-Token header (or `authorToken` in the JSON body); only its SHA-256 is stored.

const L = { page: 300, lang: 5, exact: 2000, prefix: 100, suffix: 100, selector: 600, section: 200, element: 300, note: 5000, name: 80, viewport: 20, ua: 120 };
const MAX_BODY = 20_000; // JSON without image
const MAX_BODY_IMG = 600_000; // JSON with a base64 screenshot
const MAX_IMAGE = 400_000; // decoded bytes
const MAX_NOTES = 3000; // notes kept in the file
const MAX_REPLIES = 100; // per note
const MAX_LIST = 1000; // notes returned per request
const RETRIES = 5;
const KINDS = ['text', 'element', 'page'];
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHOT_RE = /^([0-9a-f-]{36})\.(webp|jpg|png)$/;
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new HttpError(status, code); };

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Author-Token',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        }
      : {};
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (req.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });

      // Screenshots are loaded by <img>, which sends no Origin header: no origin check, ids are unguessable UUIDs.
      const shotMatch = path.match(/^\/shots\/([^/]+)$/);
      if (shotMatch && req.method === 'GET') return await serveShot(env, shotMatch[1]);

      if (!originOk) fail(403, 'origin');
      const ip = req.headers.get('CF-Connecting-IP') || 'local';
      const write = req.method !== 'GET';
      if (!rateOk(`${ip}:${write ? 'w' : 'r'}`, write ? 120 : 240, write ? 600_000 : 60_000)) fail(429, 'rate_limited');

      const seg = path.split('/').filter(Boolean); // ['notes', id, 'replies', rid]
      if (seg[0] !== 'notes' || seg.length > 4) fail(404, 'not_found');
      const [, id, sub, rid] = seg;
      if (id && !ID_RE.test(id)) fail(404, 'not_found');
      if (rid && !ID_RE.test(rid)) fail(404, 'not_found');
      const token = req.headers.get('X-Author-Token') || '';

      if (req.method === 'GET' && !id) return json(200, await listNotes(env, url.searchParams.get('page') || 'all', token));

      let body = {};
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
        const len = Number(req.headers.get('Content-Length') || 0);
        if (len > MAX_BODY_IMG) fail(413, 'too_large');
        const raw = await req.text();
        if (raw.length > MAX_BODY_IMG) fail(413, 'too_large');
        if (raw) {
          try { body = JSON.parse(raw); } catch { fail(400, 'json'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'json');
        }
        const hasImage = typeof body.shot === 'string' || typeof body.image === 'string';
        if (raw.length > MAX_BODY && !hasImage) fail(413, 'too_large');
        if (body.website) return json(200, { ok: true }); // honeypot: silently drop bots
      }
      const tokenRaw = token || str(body.authorToken, 200);

      if (!id) {
        if (req.method === 'POST') return json(201, await createNote(env, body, tokenRaw, req));
        fail(405, 'method');
      }
      if (!sub) {
        if (req.method === 'PATCH') return json(200, await patchNote(env, id, body, tokenRaw));
        if (req.method === 'DELETE') return json(200, await deleteNote(env, id, tokenRaw));
        fail(405, 'method');
      }
      if (sub === 'shot' && !rid && req.method === 'POST') return json(200, await setShot(env, id, body, tokenRaw));
      if (sub === 'replies') {
        if (!rid && req.method === 'POST') return json(201, await addReply(env, id, body, tokenRaw));
        if (rid && req.method === 'PATCH') return json(200, await patchReply(env, id, rid, body, tokenRaw));
        if (rid && req.method === 'DELETE') return json(200, await deleteReply(env, id, rid, tokenRaw));
        fail(405, 'method');
      }
      fail(404, 'not_found');
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.code });
      console.error(err);
      return json(502, { error: 'github' });
    }
  },
};

/* ---------- validation helpers ---------- */

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ctx = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanAnchor(a) {
  a = a && typeof a === 'object' ? a : {};
  return {
    exact: str(a.exact, L.exact), prefix: ctx(a.prefix, L.prefix), suffix: ctx(a.suffix, L.suffix), // context keeps its spaces
    selector: str(a.selector, L.selector), section: str(a.section, L.section), element: str(a.element, L.element),
  };
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hashToken(t) {
  if (typeof t !== 'string' || t.length < 16 || t.length > 200) fail(401, 'token');
  return sha256(t);
}
// Constant-time-ish compare of two hex strings.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function requireAuthor(stored, tokenRaw) {
  const h = await hashToken(tokenRaw);
  if (!stored || !same(stored, h)) fail(403, 'forbidden');
}

// Per-isolate sliding counter. Best effort only: isolates are recycled and not shared across locations.
const hits = new Map();
function rateOk(key, max, windowMs) {
  const now = Date.now();
  if (hits.size > 2000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  return ++h.n <= max;
}

/** Brings an old flat-shape note ({quote, context, section, selector}) up to the current schema. */
function normalize(n) {
  if (!n || typeof n !== 'object') return null;
  const anchor = n.anchor || {
    exact: n.quote || '', prefix: '', suffix: '', selector: n.selector || '', section: n.section || '', element: '',
  };
  return {
    id: n.id,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt || n.createdAt,
    ...(n.editedAt && { editedAt: n.editedAt }),
    status: n.status === 'resolved' ? 'resolved' : 'open',
    page: n.page || '/',
    lang: n.lang || '',
    kind: KINDS.includes(n.kind) ? n.kind : n.quote || anchor.exact ? 'text' : 'page',
    anchor,
    note: n.note || '',
    name: n.name || '',
    viewport: n.viewport || '',
    ua: n.ua || '',
    ...(n.shot && { shot: n.shot }),
    replies: Array.isArray(n.replies) ? n.replies : [],
    tokenHash: n.tokenHash || '',
  };
}

function publicNote(n, mineHash) {
  const { tokenHash, replies, ...rest } = n;
  return {
    ...rest,
    mine: !!mineHash && same(tokenHash, mineHash),
    replies: replies.map(({ tokenHash: rh, ...r }) => ({ ...r, mine: !!mineHash && same(rh, mineHash) })),
  };
}

/* ---------- operations ---------- */

async function listNotes(env, page, token) {
  const { notes } = await readNotes(env);
  const mine = token.length >= 16 && token.length <= 200 ? await sha256(token) : '';
  const wanted = page === 'all' ? notes : notes.filter((n) => n.page === page);
  return { notes: wanted.slice(-MAX_LIST).map((n) => publicNote(n, mine)) };
}

async function createNote(env, body, tokenRaw, req) {
  const tokenHash = await hashToken(tokenRaw);
  const page = str(body.page, L.page);
  const note = str(body.note, L.note);
  if (!note) fail(400, 'missing_note');
  if (!page.startsWith('/') || /\s/.test(page)) fail(400, 'bad_page');
  const kind = KINDS.includes(body.kind) ? body.kind : 'page';
  const anchor = cleanAnchor(body.anchor);
  if (kind === 'text' && !anchor.exact) fail(400, 'missing_anchor');
  if (kind === 'element' && !anchor.selector) fail(400, 'missing_anchor');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const doc = {
    id, createdAt: now, updatedAt: now, status: 'open', page, lang: str(body.lang, L.lang), kind, anchor, note,
    name: str(body.name, L.name), viewport: str(body.viewport, L.viewport), ua: str(req.headers.get('User-Agent'), L.ua),
    replies: [], tokenHash,
  };
  if (typeof body.shot === 'string' && body.shot) {
    const img = decodeImage(body.shot);
    doc.shot = `${env.SHOTS}/${id}.${img.ext}`;
    await putFile(env, doc.shot, img.b64, `feedback: shot ${id}`);
  }
  try {
    await mutate(env, `feedback: note ${page}`, (notes) => {
      if (notes.length >= MAX_NOTES) fail(507, 'full');
      notes.push(doc);
      return doc;
    });
  } catch (err) {
    if (doc.shot) await deleteFile(env, doc.shot).catch(() => {}); // do not leave an orphan screenshot
    throw err;
  }
  return publicNote(doc, tokenHash);
}

async function patchNote(env, id, body, tokenRaw) {
  const hasNote = body.note !== undefined;
  const hasStatus = body.status !== undefined;
  if (!hasNote && !hasStatus) fail(400, 'nothing');
  if (hasStatus && !['open', 'resolved'].includes(body.status)) fail(400, 'bad_status');
  const text = hasNote ? str(body.note, L.note) : '';
  if (hasNote && !text) fail(400, 'missing_note');
  const tokenHash = hasNote ? await hashToken(tokenRaw) : '';
  const result = await mutate(env, `feedback: update ${id}`, async (notes) => {
    const n = find(notes, id);
    if (hasNote) {
      await requireAuthor(n.tokenHash, tokenRaw);
      n.note = text;
      n.editedAt = new Date().toISOString();
    }
    if (hasStatus) n.status = body.status;
    n.updatedAt = new Date().toISOString();
    return n;
  });
  return publicNote(result, tokenHash || (tokenRaw ? await sha256(tokenRaw) : ''));
}

async function deleteNote(env, id, tokenRaw) {
  const removed = await mutate(env, `feedback: delete ${id}`, async (notes) => {
    const i = notes.findIndex((n) => n.id === id);
    if (i < 0) fail(404, 'not_found');
    await requireAuthor(notes[i].tokenHash, tokenRaw);
    return notes.splice(i, 1)[0];
  });
  if (removed.shot) await deleteFile(env, removed.shot).catch(() => {});
  return { ok: true };
}

async function addReply(env, id, body, tokenRaw) {
  const tokenHash = await hashToken(tokenRaw);
  const text = str(body.text, L.note);
  if (!text) fail(400, 'missing_text');
  const reply = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: str(body.name, L.name), text, tokenHash };
  await mutate(env, `feedback: reply ${id}`, (notes) => {
    const n = find(notes, id);
    if (n.replies.length >= MAX_REPLIES) fail(409, 'too_many_replies');
    n.replies.push(reply);
    n.updatedAt = reply.createdAt;
    return n;
  });
  const { tokenHash: _h, ...pub } = reply;
  return { ...pub, mine: true };
}

async function patchReply(env, id, rid, body, tokenRaw) {
  const text = str(body.text, L.note);
  if (!text) fail(400, 'missing_text');
  const r = await mutate(env, `feedback: edit reply ${rid}`, async (notes) => {
    const reply = findReply(find(notes, id), rid);
    await requireAuthor(reply.tokenHash, tokenRaw);
    reply.text = text;
    reply.editedAt = new Date().toISOString();
    return reply;
  });
  const { tokenHash: _h, ...pub } = r;
  return { ...pub, mine: true };
}

async function deleteReply(env, id, rid, tokenRaw) {
  await mutate(env, `feedback: delete reply ${rid}`, async (notes) => {
    const n = find(notes, id);
    const reply = findReply(n, rid);
    await requireAuthor(reply.tokenHash, tokenRaw);
    n.replies = n.replies.filter((x) => x.id !== rid);
    return null;
  });
  return { ok: true };
}

async function setShot(env, id, body, tokenRaw) {
  const img = decodeImage(body.image);
  const path = `${env.SHOTS}/${id}.${img.ext}`;
  const { notes } = await readNotes(env);
  const n = find(notes, id);
  await requireAuthor(n.tokenHash, tokenRaw);
  await putFile(env, path, img.b64, `feedback: shot ${id}`);
  const old = n.shot;
  await mutate(env, `feedback: shot ${id}`, (list) => { const x = find(list, id); x.shot = path; x.updatedAt = new Date().toISOString(); return x; });
  if (old && old !== path) await deleteFile(env, old).catch(() => {});
  return { shot: path };
}

async function serveShot(env, file) {
  const m = file.match(SHOT_RE);
  if (!m) fail(404, 'not_found');
  const res = await ghFile(env, `${env.SHOTS}/${file}`, true);
  if (res.status === 404) fail(404, 'not_found');
  if (!res.ok) fail(502, 'github');
  return new Response(res.body, { headers: { 'Content-Type': MIME[m[2]], 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

const find = (notes, id) => notes.find((n) => n.id === id) || fail(404, 'not_found');
const findReply = (n, rid) => n.replies.find((r) => r.id === rid) || fail(404, 'not_found');

/** Accepts a data URL or bare base64; verifies the magic bytes so only real images are stored. */
function decodeImage(input) {
  if (typeof input !== 'string' || !input) fail(400, 'bad_image');
  const b64 = input.replace(/^data:image\/[a-z+]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) fail(400, 'bad_image');
  if (b64.length * 0.75 > MAX_IMAGE * 1.02) fail(413, 'image_too_large');
  let head;
  try { head = Uint8Array.from(atob(b64.slice(0, 24)), (c) => c.charCodeAt(0)); } catch { fail(400, 'bad_image'); }
  const at = (i, s) => [...s].every((c, k) => head[i + k] === c.charCodeAt(0));
  let ext;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ext = 'jpg';
  else if (at(0, 'RIFF') && at(8, 'WEBP')) ext = 'webp';
  else if (head[0] === 0x89 && at(1, 'PNG')) ext = 'png';
  else fail(400, 'bad_image');
  return { ext, b64 };
}

/* ---------- GitHub storage ---------- */

const ghHeaders = (env, extra = {}) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'aiodyx-feedback',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});
const contentsUrl = (env, path, withRef) =>
  `https://api.github.com/repos/${env.REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}${withRef ? `?ref=${env.BRANCH}` : ''}`;

/** GET a file; `raw` returns the bytes instead of the JSON envelope (needed above 1 MB). */
const ghFile = (env, path, raw) =>
  fetch(contentsUrl(env, path, true), { headers: ghHeaders(env, { 'Cache-Control': 'no-cache', ...(raw && { Accept: 'application/vnd.github.raw+json' }) }) });

async function readNotes(env) {
  const res = await ghFile(env, env.FILE);
  if (res.status === 404) return { notes: [], sha: undefined };
  if (!res.ok) fail(502, 'github');
  const file = await res.json();
  let text = file.content ? fromB64(file.content) : '';
  if (!text) {
    const rawRes = await ghFile(env, env.FILE, true);
    if (!rawRes.ok) fail(502, 'github');
    text = await rawRes.text();
  }
  let data;
  try { data = JSON.parse(text || '[]'); } catch { fail(502, 'corrupt'); }
  return { notes: (Array.isArray(data) ? data : []).map(normalize).filter(Boolean), sha: file.sha };
}

/** Read-modify-write with sha conflict retry. `fn` may throw HttpError to abort without writing. */
async function mutate(env, message, fn) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { notes, sha } = await readNotes(env);
    const result = await fn(notes);
    const put = await fetch(contentsUrl(env, env.FILE), {
      method: 'PUT',
      headers: ghHeaders(env),
      body: JSON.stringify({ message, content: toB64(JSON.stringify(notes, null, 2) + '\n'), branch: env.BRANCH, ...(sha && { sha }) }),
    });
    if (put.ok) return result;
    if (put.status !== 409 && put.status !== 422) fail(502, 'github');
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 150));
  }
  return fail(503, 'busy');
}

async function putFile(env, path, b64, message) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const cur = await ghFile(env, path);
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    if (!cur.ok && cur.status !== 404) fail(502, 'github');
    const put = await fetch(contentsUrl(env, path), { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify({ message, content: b64, branch: env.BRANCH, ...(sha && { sha }) }) });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) fail(502, 'github');
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  fail(503, 'busy');
}

async function deleteFile(env, path) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const cur = await ghFile(env, path);
    if (cur.status === 404) return;
    if (!cur.ok) fail(502, 'github');
    const { sha } = await cur.json();
    const del = await fetch(contentsUrl(env, path), { method: 'DELETE', headers: ghHeaders(env), body: JSON.stringify({ message: `feedback: remove ${path}`, sha, branch: env.BRANCH }) });
    if (del.ok || del.status === 404) return;
    if (del.status !== 409 && del.status !== 422) fail(502, 'github');
  }
}

const toB64 = (s) => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
