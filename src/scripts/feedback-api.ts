// REST client for the review-notes worker (worker/feedback.js).
import type { Anchor } from './feedback-anchor';

export interface Reply {
  id: string;
  createdAt: string;
  editedAt?: string;
  name: string;
  text: string;
  mine?: boolean;
  _pending?: boolean;
}

export interface Note {
  id: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  status: 'open' | 'resolved';
  page: string;
  lang: string;
  kind: 'text' | 'element' | 'page';
  anchor: Anchor;
  note: string;
  name: string;
  viewport: string;
  shot?: string;
  replies: Reply[];
  mine?: boolean;
  // client-only state for optimistic creation
  _pending?: boolean;
  _error?: boolean;
  _payload?: NewNote;
}

export interface NewNote {
  page: string;
  lang: string;
  kind: Note['kind'];
  anchor: Anchor;
  note: string;
  name: string;
  viewport: string;
  website: string;
  shot?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

const TOKEN_KEY = 'fb-token';
let memoryToken = '';

/** Random per-browser author token. Only its SHA-256 is stored server-side. */
export function authorToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || t.length < 32) {
      t = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return memoryToken ||= [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export function createApi(base: string) {
  const root = base.replace(/\/+$/, '');
  async function call<T>(method: string, path: string, body?: unknown, anon = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!anon) headers['X-Author-Token'] = authorToken();
    let res: Response;
    try {
      res = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'network');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data?.error || 'error');
    return data as T;
  }
  const n = (id: string) => `/notes/${encodeURIComponent(id)}`;
  return {
    /** `page` is a pathname or 'all'. `anon` skips the token header (no CORS preflight; no `mine` flags). */
    list: (page: string, anon = false) => call<{ notes: Note[] }>('GET', `/notes?page=${encodeURIComponent(page)}`, undefined, anon).then((r) => r.notes),
    create: (p: NewNote) => call<Note>('POST', '/notes', p),
    setStatus: (id: string, status: Note['status']) => call<Note>('PATCH', n(id), { status }),
    edit: (id: string, note: string) => call<Note>('PATCH', n(id), { note }),
    remove: (id: string) => call<{ ok: true }>('DELETE', n(id)),
    reply: (id: string, name: string, text: string) => call<Reply>('POST', `${n(id)}/replies`, { name, text }),
    editReply: (id: string, rid: string, text: string) => call<Reply>('PATCH', `${n(id)}/replies/${encodeURIComponent(rid)}`, { text }),
    removeReply: (id: string, rid: string) => call<{ ok: true }>('DELETE', `${n(id)}/replies/${encodeURIComponent(rid)}`),
    shotUrl: (path: string) => `${root}/shots/${encodeURIComponent(path.split('/').pop() || '')}`,
  };
}

export type Api = ReturnType<typeof createApi>;
