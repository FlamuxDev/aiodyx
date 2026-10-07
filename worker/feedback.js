// Receives review notes from the site and appends them to a JSON file in the GitHub repo.
// Secrets/vars (wrangler.toml + `wrangler secret put GITHUB_TOKEN`):
//   GITHUB_TOKEN    fine-grained PAT, Contents: read & write on the repo only
//   REPO            owner/name
//   BRANCH          branch that holds the notes (kept off main so notes don't redeploy the site)
//   FILE            path of the notes file
//   ALLOWED_ORIGINS comma-separated origins allowed to post

const LIMITS = { page: 300, lang: 5, quote: 2000, context: 1000, section: 200, selector: 500, note: 5000, name: 80, viewport: 20 };

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { error: 'method' });
    if (!allowed.includes(origin)) return reply(403, { error: 'origin' });

    const raw = await req.text();
    if (raw.length > 20000) return reply(413, { error: 'too_large' });
    let input;
    try { input = JSON.parse(raw); } catch { return reply(400, { error: 'json' }); }
    if (input.website) return reply(200, { ok: true }); // honeypot: silently drop bots

    const note = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'open' };
    for (const [k, max] of Object.entries(LIMITS)) note[k] = String(input[k] ?? '').trim().slice(0, max);
    if (!note.note || !note.page) return reply(400, { error: 'missing' });

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await saveNote(env, note);
      if (res === 'ok') return reply(201, { ok: true, id: note.id });
      if (res !== 'conflict') return reply(502, { error: 'github', detail: res });
    }
    return reply(503, { error: 'busy' });
  },
};

async function gh(env, method, body) {
  return fetch(`https://api.github.com/repos/${env.REPO}/contents/${env.FILE}${method === 'GET' ? `?ref=${env.BRANCH}` : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'aiodyx-feedback',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body && JSON.stringify(body),
  });
}

async function saveNote(env, note) {
  const cur = await gh(env, 'GET');
  let notes = [];
  let sha;
  if (cur.ok) {
    const file = await cur.json();
    sha = file.sha;
    notes = JSON.parse(fromB64(file.content));
  } else if (cur.status !== 404) {
    return `read ${cur.status}`;
  }
  notes.push(note);
  const put = await gh(env, 'PUT', {
    message: `feedback: ${note.page}`,
    content: toB64(JSON.stringify(notes, null, 2) + '\n'),
    branch: env.BRANCH,
    ...(sha && { sha }),
  });
  if (put.ok) return 'ok';
  if (put.status === 409 || put.status === 422) return 'conflict';
  return `write ${put.status}`;
}

const toB64 = (s) => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
