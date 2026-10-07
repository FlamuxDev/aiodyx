// Review UI: selection chip, element pinning, highlights, notes panel with threads, create dialog.
// Loaded lazily by feedback.ts. activate() wires everything through one AbortController and deactivate()
// removes every listener, highlight and pin, so the page is untouched when review mode is off.
import { ApiError } from './feedback-api';
import type { Api, NewNote, Note, Reply } from './feedback-api';
import { describeElement, describeRange, locateElement, locateText, pickTarget, unwrapMarks, wrapRange } from './feedback-anchor';
import type { Anchor } from './feedback-anchor';
import { captureViewport } from './feedback-shot';

export interface Ctx {
  root: HTMLElement;
  t: Record<string, any>;
  lang: string;
  api: Api;
  setCount(n: number): void;
}

type Kid = Node | string | null | false | undefined;
type Filter = 'open' | 'resolved' | 'all';
type Scope = 'page' | 'all';
interface Refs {
  bar: HTMLElement; hint: HTMLElement; listBtn: HTMLButtonElement; generalBtn: HTMLButtonElement; pinBtn: HTMLButtonElement;
  chip: HTMLButtonElement; ring: HTMLElement; pinsLayer: HTMLElement;
  panel: HTMLElement; panelClose: HTMLButtonElement; list: HTMLElement;
  dialog: HTMLDialogElement; form: HTMLFormElement; quoteLabel: HTMLElement; quote: HTMLElement;
  noteField: HTMLTextAreaElement; nameField: HTMLInputElement; shotField: HTMLInputElement; hpField: HTMLInputElement;
  toast: HTMLElement;
}

const h = <T extends HTMLElement = HTMLElement>(tag: string, attrs: Record<string, string | boolean | null | undefined> = {}, ...kids: Kid[]): T => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  for (const c of kids) if (c) el.append(c);
  return el as T;
};
const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
const rand = () => Math.random().toString(36).slice(2, 10);
const narrow = () => matchMedia('(max-width: 640px)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = (area: 'localStorage' | 'sessionStorage') => ({
  get: (k: string) => { try { return window[area].getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window[area].setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { window[area].removeItem(k); } catch { /* storage blocked */ } },
});
const local = store('localStorage');
const session = store('sessionStorage');

let ctx: Ctx;
let t: Record<string, any>;
let R: Refs | null = null;
let ac: AbortController | null = null;

let notes: Note[] = [];
let scope: Scope = 'page';
let filter: Filter = 'open';
let pinMode = true;
let expanded: string | null = null;
let loadState: 'idle' | 'loading' | 'error' = 'idle';
let lastLoad = 0;
let hlSig = '';
let activeId: string | null = null;
let pendingRange: Range | null = null;
let hoverEl: Element | null = null;
let current: { kind: Note['kind']; anchor: Anchor; target?: Element | null } | null = null;
let toastTimer = 0;
let selTimer = 0;
let mouseDown = false;
let layoutQueued = false;
/** Bumped by every local mutation; a refresh that started before one is stale and must not overwrite it. */
let rev = 0;

const located = new Map<string, 'ok' | 'detached'>();
const pins = new Map<string, { btn: HTMLButtonElement; el: Element }>();
const items = new Map<string, { el: HTMLElement; sig: string }>();
const headings = new Map<string, HTMLElement>();
const drafts = new Map<string, string>();
let nums = new Map<string, number>();

const here = () => location.pathname;
const pageNotes = () => notes.filter((n) => n.page === here());
const find = (id: string | undefined) => notes.find((n) => n.id === id);
const getName = () => local.get('fb-name') || '';
const isRtl = () => getComputedStyle(document.documentElement).direction === 'rtl';
const inUi = (node: Node | null) => !!((node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement)?.closest('.fb'));

/* ---------- formatting ---------- */

const rtf = () => new Intl.RelativeTimeFormat(`${ctx.lang}-u-nu-latn`, { numeric: 'auto' });
function rel(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return t.now;
  if (s < 3600) return rtf().format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf().format(-Math.round(s / 3600), 'hour');
  if (s < 30 * 86400) return rtf().format(-Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString(`${ctx.lang}-u-nu-latn`, { dateStyle: 'medium' });
}
function repliesLabel(n: number) {
  const forms = t.replies as Record<string, string>;
  const key = n === 0 && forms.zero ? 'zero' : new Intl.PluralRules(ctx.lang).select(n);
  return (forms[key] || forms.other).replace('{n}', String(n));
}
const who = (x: { name: string; mine?: boolean }) => (x.name || t.anon) + (x.mine ? ` (${t.you})` : '');

/* ---------- toast ---------- */

function toast(msg: string, error = false, ms = 3500) {
  if (!R) return;
  R.toast.textContent = msg;
  R.toast.hidden = false;
  R.toast.classList.toggle('is-error', error);
  clearTimeout(toastTimer);
  if (ms) toastTimer = window.setTimeout(() => { if (R) R.toast.hidden = true; }, ms);
}

/* ---------- lifecycle ---------- */

export function activate(c: Ctx) {
  if (ac) return;
  ctx = c;
  t = c.t;
  const q = <E extends Element>(sel: string) => c.root.querySelector<E>(sel)!;
  R = {
    bar: q('.fb__bar'), hint: q('.fb__hint'), listBtn: q('[data-fb=list]'), generalBtn: q('[data-fb=general]'), pinBtn: q('[data-fb=pin]'),
    chip: q('.fb__chip'), ring: q('.fb__ring'), pinsLayer: q('.fb__pins'),
    panel: q('.fb__panel'), panelClose: q('[data-fb=panel-close]'), list: q('[data-fb=items]'),
    dialog: q('.fb__dialog'), form: q('.fb__form'), quoteLabel: q('[data-fb=quote-label]'), quote: q('.fb__quote'),
    noteField: q('[name=note]'), nameField: q('[name=name]'), shotField: q('[name=shot]'), hpField: q('[name=website]'),
    toast: q('.fb__toast'),
  };
  ac = new AbortController();
  const signal = ac.signal;
  const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void, opts: AddEventListenerOptions = {}) =>
    document.addEventListener(type, fn as EventListener, { ...opts, signal });

  pinMode = session.get('fb-pin') !== '0';
  syncPinUi();

  // Text selection -> "add note" chip (waits until the selection settles; works for touch handles too).
  on('selectionchange', scheduleSelection);
  on('pointerdown', (e) => { if (e.pointerType === 'mouse' && !inUi(e.target as Node)) mouseDown = true; }, { capture: true });
  on('pointerup', () => { mouseDown = false; scheduleSelection(); }, { capture: true });
  window.addEventListener('scroll', () => { if (!R!.chip.hidden) placeChip(); hideRing(); }, { signal, passive: true });
  window.addEventListener('resize', queueLayout, { signal });
  const ro = new ResizeObserver(queueLayout);
  ro.observe(document.documentElement);
  signal.addEventListener('abort', () => ro.disconnect());
  signal.addEventListener('abort', () => clearTimeout(selTimer));

  // Clicks on the page: open a highlighted note, or pin to the clicked element.
  on('click', onPageClick, { capture: true });
  on('mouseover', onHover, { capture: true });
  document.documentElement.addEventListener('mouseleave', hideRing, { signal });
  on('keydown', onKey);
  on('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad > 30000) refresh(true); });

  R.chip.addEventListener('mousedown', (e) => e.preventDefault(), { signal });
  R.chip.addEventListener('click', onChip, { signal });
  R.pinBtn.addEventListener('click', togglePin, { signal });
  R.generalBtn.addEventListener('click', () => openDialog({ kind: 'page', anchor: blankAnchor() }), { signal });
  R.listBtn.addEventListener('click', () => (R!.panel.hidden ? openPanel() : closePanel()), { signal });
  R.panelClose.addEventListener('click', () => closePanel(), { signal });
  R.panel.addEventListener('click', onPanelClick, { signal });
  R.panel.addEventListener('submit', onPanelSubmit, { signal });
  R.panel.addEventListener('input', (e) => {
    const ta = e.target as HTMLTextAreaElement;
    const id = ta.closest<HTMLElement>('.fb__item')?.dataset.id;
    if (id && ta.closest('.fb__reply-form')) drafts.set(id, ta.value);
  }, { signal });
  R.panel.addEventListener('mouseover', (e) => setActive((e.target as Element).closest<HTMLElement>('.fb__item')?.dataset.id || null), { signal });
  R.panel.addEventListener('mouseleave', () => setActive(null), { signal });
  R.form.addEventListener('submit', onDialogSubmit, { signal });
  R.form.querySelector('[data-fb=cancel]')!.addEventListener('click', () => R!.dialog.close(), { signal });
  R.noteField.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) R!.form.requestSubmit(); }, { signal });
  R.dialog.addEventListener('close', () => { current = null; }, { signal });

  for (const b of R.panel.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
    b.addEventListener('click', () => { filter = b.dataset.filter as Filter; renderList(); }, { signal });
  }
  for (const b of R.panel.querySelectorAll<HTMLButtonElement>('[data-scope]')) {
    b.addEventListener('click', () => { scope = b.dataset.scope as Scope; refresh(); }, { signal });
  }

  refresh().then(() => {
    const goto = session.get('fb-goto');
    if (goto) { session.del('fb-goto'); openNote(goto); }
  });
}

export function deactivate() {
  if (!ac) return;
  ac.abort();
  ac = null;
  clearHighlights();
  located.clear();
  items.clear();
  headings.clear();
  notes = [];
  expanded = null;
  hoverEl = null;
  pendingRange = null;
  loadState = 'idle';
  if (R) {
    R.chip.hidden = true;
    R.ring.hidden = true;
    R.toast.hidden = true;
    R.panel.hidden = true;
    R.list.replaceChildren();
    if (R.dialog.open) R.dialog.close();
  }
  R = null;
}

/* ---------- data ---------- */

async function refresh(silent = false) {
  const started = rev;
  if (!silent) { loadState = 'loading'; renderList(); }
  try {
    const list = await ctx.api.list(scope === 'all' ? 'all' : here());
    if (!ac) return;
    if (started !== rev) { loadState = 'idle'; renderList(); void refresh(true); return; }
    notes = [...list, ...notes.filter((n) => n._pending || n._error)];
    loadState = 'idle';
    lastLoad = Date.now();
  } catch {
    if (!ac) return;
    loadState = 'error';
    if (silent) return;
  }
  syncHighlights();
  renderList();
  updateCount();
}

const updateCount = () => ctx.setCount(pageNotes().filter((n) => n.status === 'open').length);

function renumber() {
  nums = new Map();
  const per = new Map<string, number>();
  for (const n of [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = (per.get(n.page) || 0) + 1;
    per.set(n.page, k);
    nums.set(n.id, k);
  }
  for (const [id, p] of pins) {
    p.btn.textContent = String(nums.get(id) ?? '');
    p.btn.setAttribute('aria-label', `${t.pinLabel} ${nums.get(id) ?? ''}`);
  }
}

/* ---------- highlights & pins ---------- */

const blankAnchor = (): Anchor => ({ exact: '', prefix: '', suffix: '', selector: '', section: '', element: '' });

function placeHighlight(n: Note) {
  if (n.kind === 'text') {
    const r = locateText(n.anchor);
    if (r) { wrapRange(r, n.id, n.status === 'resolved'); located.set(n.id, 'ok'); } else located.set(n.id, 'detached');
  } else if (n.kind === 'element') {
    const el = locateElement(n.anchor);
    if (el) {
      const btn = h<HTMLButtonElement>('button', { type: 'button', class: cls('fb__pin', n.status === 'resolved' && 'is-resolved'), 'data-id': n.id });
      btn.addEventListener('click', () => openNote(n.id));
      btn.addEventListener('mouseenter', () => setActive(n.id));
      btn.addEventListener('mouseleave', () => setActive(null));
      R!.pinsLayer.append(btn);
      pins.set(n.id, { btn, el });
      located.set(n.id, 'ok');
    } else located.set(n.id, 'detached');
  } else located.set(n.id, 'ok');
}

function clearHighlights() {
  unwrapMarks(document);
  for (const p of pins.values()) p.btn.remove();
  pins.clear();
  activeId = null;
}

const signature = () => pageNotes().filter((n) => !n._error).map((n) => [n.id, n.status, n.anchor.exact, n.anchor.selector].join('|')).join('\n');

function syncHighlights() {
  const sig = signature();
  if (sig !== hlSig) {
    clearHighlights();
    located.clear();
    for (const n of pageNotes()) if (!n._error) placeHighlight(n);
    hlSig = sig;
  }
  for (const n of pageNotes()) {
    for (const m of document.querySelectorAll(`mark.fb-hl[data-id="${CSS.escape(n.id)}"]`)) m.classList.toggle('is-resolved', n.status === 'resolved');
    pins.get(n.id)?.btn.classList.toggle('is-resolved', n.status === 'resolved');
  }
  renumber();
  queueLayout();
}

function queueLayout() {
  if (layoutQueued || !ac) return;
  layoutQueued = true;
  requestAnimationFrame(() => { layoutQueued = false; layoutPins(); });
}

function layoutPins() {
  if (!R) return;
  const rtl = isRtl();
  const maxX = document.documentElement.clientWidth + scrollX - 26;
  for (const { btn, el } of pins.values()) {
    const r = el.getBoundingClientRect();
    btn.style.display = r.width === 0 && r.height === 0 ? 'none' : '';
    btn.style.left = `${Math.max(4, Math.min((rtl ? r.right : r.left) + scrollX - 11, maxX))}px`;
    btn.style.top = `${Math.max(4, r.top + scrollY - 11)}px`;
  }
}

function setActive(id: string | null) {
  if (id === activeId) return;
  if (activeId) {
    for (const m of document.querySelectorAll(`mark.fb-hl[data-id="${CSS.escape(activeId)}"]`)) m.classList.remove('is-active');
    pins.get(activeId)?.btn.classList.remove('is-active');
  }
  activeId = id;
  if (id) {
    for (const m of document.querySelectorAll(`mark.fb-hl[data-id="${CSS.escape(id)}"]`)) m.classList.add('is-active');
    pins.get(id)?.btn.classList.add('is-active');
  }
}

function scrollToEl(el: Element) {
  const r = el.getBoundingClientRect();
  const top = r.top + scrollY - innerHeight * (narrow() ? 0.12 : 0.33);
  scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
}

function flash(id: string): boolean {
  const marks = [...document.querySelectorAll<HTMLElement>(`mark.fb-hl[data-id="${CSS.escape(id)}"]`)];
  const pin = pins.get(id);
  const target = marks[0] ?? pin?.el;
  if (!target) return false;
  scrollToEl(target);
  const els: Element[] = marks.length ? marks : [pin!.el, pin!.btn];
  for (const e of els) e.classList.add(e === pin?.el ? 'fb-target-flash' : 'is-flash');
  setTimeout(() => { for (const e of els) e.classList.remove('fb-target-flash', 'is-flash'); }, 1900);
  return true;
}

/* ---------- page interaction ---------- */

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !R || R.dialog.open) return;
  if (!R.panel.hidden) { closePanel(); e.preventDefault(); } else if (!R.chip.hidden) { R.chip.hidden = true; }
}

function onPageClick(e: MouseEvent) {
  const target = e.target;
  if (!(target instanceof Element) || target.closest('.fb') || !R) return;
  const selected = !!getSelection()?.toString().trim();
  const mark = target.closest<HTMLElement>('mark.fb-hl');
  const modified = e.ctrlKey || e.metaKey || e.altKey;
  if (mark && !selected && !modified) {
    e.preventDefault();
    e.stopImmediatePropagation();
    openNote(mark.dataset.id!);
    return;
  }
  if (!pinMode || modified) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (selected) return;
  const el = pickTarget(target);
  if (!el) return;
  hideRing();
  openDialog({ kind: 'element', anchor: describeElement(el), target: el });
}

function onHover(e: MouseEvent) {
  if (!pinMode || !R || R.dialog.open) return;
  const target = e.target;
  if (!(target instanceof Element) || target.closest('.fb')) { hideRing(); return; }
  const el = pickTarget(target);
  if (!el) { hideRing(); return; }
  hoverEl = el;
  const r = el.getBoundingClientRect();
  R.ring.hidden = false;
  R.ring.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
}
function hideRing() { hoverEl = null; if (R) R.ring.hidden = true; }

function togglePin() {
  pinMode = !pinMode;
  session.set('fb-pin', pinMode ? '1' : '0');
  syncPinUi();
  hideRing();
}
function syncPinUi() {
  if (!R) return;
  R.pinBtn.setAttribute('aria-pressed', String(pinMode));
  R.hint.textContent = (pinMode ? R.hint.dataset.hintPin : R.hint.dataset.hintText) || '';
}

/* ---------- selection chip ---------- */

function scheduleSelection() {
  clearTimeout(selTimer);
  selTimer = window.setTimeout(checkSelection, 280);
}

function checkSelection() {
  if (!R || mouseDown || R.dialog.open) return;
  const sel = getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) { R.chip.hidden = true; return; }
  const range = sel.getRangeAt(0);
  if (inUi(range.startContainer) || inUi(range.endContainer)) { R.chip.hidden = true; return; }
  pendingRange = range.cloneRange();
  R.chip.hidden = false;
  placeChip();
}

function placeChip() {
  if (!R || !pendingRange) return;
  const rects = pendingRange.getClientRects();
  const last = rects[rects.length - 1] || pendingRange.getBoundingClientRect();
  const first = rects[0] || last;
  const w = R.chip.offsetWidth;
  const hgt = R.chip.offsetHeight;
  const reserve = narrow() ? 150 : 24; // keep clear of the mobile dock and our floating button
  let top = last.bottom + 8;
  if (top + hgt > innerHeight - reserve) top = first.top - hgt - 8;
  top = Math.max(8, Math.min(top, innerHeight - hgt - reserve));
  const left = Math.max(8, Math.min(last.left + last.width / 2 - w / 2, innerWidth - w - 8));
  R.chip.style.top = `${top}px`;
  R.chip.style.left = `${left}px`;
}

function onChip() {
  if (!pendingRange || !R) return;
  const anchor = describeRange(pendingRange);
  R.chip.hidden = true;
  if (!anchor) { toast(t.failed, true); return; }
  openDialog({ kind: 'text', anchor });
}

/* ---------- create dialog ---------- */

function openDialog(info: NonNullable<typeof current>) {
  if (!R) return;
  current = info;
  R.quoteLabel.hidden = info.kind === 'page';
  R.quoteLabel.textContent = info.kind === 'text' ? t.quote : t.element;
  R.quote.textContent = info.kind === 'text' ? info.anchor.exact : info.kind === 'element' ? info.anchor.element : t.generalQuote;
  R.noteField.value = '';
  R.nameField.value = getName();
  R.shotField.checked = local.get('fb-shot') !== '0';
  R.chip.hidden = true;
  R.dialog.showModal();
  R.noteField.focus();
}

function onDialogSubmit(e: Event) {
  e.preventDefault();
  if (!R || !current) return;
  rev++;
  const text = R.noteField.value.trim();
  if (!text) return;
  const name = R.nameField.value.trim();
  local.set('fb-name', name);
  local.set('fb-shot', R.shotField.checked ? '1' : '0');
  if (R.hpField.value) { R.dialog.close(); return; } // honeypot filled: behave as if sent
  const payload: NewNote = {
    page: here(), lang: ctx.lang, kind: current.kind, anchor: current.anchor, note: text, name,
    viewport: `${innerWidth}x${innerHeight}`, website: '',
  };
  if (!R.shotField.checked) payload.shot = ''; // '' = no screenshot wanted (and none to capture on retry)
  const now = new Date().toISOString();
  const n: Note = {
    id: `tmp-${rand()}`, createdAt: now, updatedAt: now, status: 'open', page: payload.page, lang: payload.lang, kind: payload.kind,
    anchor: payload.anchor, note: text, name, viewport: payload.viewport, replies: [], mine: true, _pending: true, _payload: payload,
  };
  const target = current.target ?? null;
  const wantShot = R.shotField.checked;
  R.dialog.close();
  getSelection()?.removeAllRanges();
  notes.push(n);
  syncHighlights();
  renderList();
  updateCount();
  void send(n, wantShot, target);
}

async function send(n: Note, wantShot: boolean, target: Element | null) {
  const p = n._payload!;
  toast(t.sending, false, 0);
  try {
    if (wantShot && p.shot === undefined) p.shot = (await captureViewport(target)) ?? '';
    const body: NewNote = { ...p };
    if (!body.shot) delete body.shot;
    const saved = await ctx.api.create(body);
    if (!ac) return;
    adopt(n, saved);
    toast(t.saved);
  } catch (err) {
    if (!ac) return;
    if (err instanceof ApiError && err.status === 413) p.shot = ''; // screenshot too large: retry without it
    n._pending = false;
    n._error = true;
    renderList();
    toast(t.sendFailed, true);
  }
}

/** Swaps an optimistic note for the server's copy and re-keys everything that referenced the temporary id. */
function adopt(tmp: Note, saved: Note) {
  rev++;
  const i = notes.indexOf(tmp);
  if (i < 0) return;
  notes[i] = saved;
  for (const m of document.querySelectorAll<HTMLElement>(`mark.fb-hl[data-id="${CSS.escape(tmp.id)}"]`)) m.dataset.id = saved.id;
  const pin = pins.get(tmp.id);
  if (pin) { pins.delete(tmp.id); pins.set(saved.id, pin); pin.btn.dataset.id = saved.id; }
  const l = located.get(tmp.id);
  if (l) { located.delete(tmp.id); located.set(saved.id, l); }
  items.get(tmp.id)?.el.remove();
  items.delete(tmp.id);
  if (expanded === tmp.id) expanded = saved.id;
  hlSig = signature();
  renderList();
  updateCount();
}

/* ---------- panel ---------- */

function openPanel() {
  if (!R) return;
  R.panel.hidden = false;
  R.listBtn.setAttribute('aria-expanded', 'true');
  R.panel.focus({ preventScroll: true });
  if (Date.now() - lastLoad > 10000) refresh(true).then(renderList);
}

function closePanel(restoreFocus = true) {
  if (!R || R.panel.hidden) return;
  const hadFocus = R.panel.contains(document.activeElement);
  R.panel.hidden = true;
  R.listBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus && hadFocus) R.listBtn.focus();
}

function openNote(id: string) {
  const n = find(id);
  if (!R || !n) return;
  if (filter !== 'all' && n.status !== filter) filter = 'all';
  openPanel();
  renderList();
  setOpen(id);
  items.get(id)?.el.scrollIntoView({ block: 'nearest' });
  flash(id);
}

function renderTabs() {
  if (!R) return;
  const count = (f: Filter) => notes.filter((n) => f === 'all' || n.status === f).length;
  const label: Record<Filter, string> = { open: t.fOpen, resolved: t.fResolved, all: t.fAll };
  for (const b of R.panel.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
    const f = b.dataset.filter as Filter;
    b.setAttribute('aria-pressed', String(f === filter));
    b.textContent = `${label[f]} ${count(f)}`;
  }
  for (const b of R.panel.querySelectorAll<HTMLButtonElement>('[data-scope]')) b.setAttribute('aria-pressed', String(b.dataset.scope === scope));
}

function renderList() {
  if (!R) return;
  renumber();
  renderTabs();
  const shown = notes
    .filter((n) => filter === 'all' || n.status === filter)
    .sort((a, b) => (Number(b.page === here()) - Number(a.page === here())) || a.page.localeCompare(b.page) || a.createdAt.localeCompare(b.createdAt));
  const desired: HTMLElement[] = [];
  if (loadState === 'loading' && !notes.length) desired.push(h('p', { class: 'fb__empty' }, t.loading));
  else if (loadState === 'error' && !notes.length) {
    const retry = h('button', { type: 'button', class: 'fb__btn fb__btn--sm' }, t.retry);
    retry.addEventListener('click', () => refresh());
    desired.push(h('div', { class: 'fb__empty' }, h('p', {}, t.loadFailed), retry));
  } else if (!shown.length) desired.push(h('p', { class: 'fb__empty' }, t.empty));
  else {
    let lastPage = '';
    for (const n of shown) {
      if (scope === 'all' && n.page !== lastPage) {
        lastPage = n.page;
        let hd = headings.get(n.page);
        if (!hd) headings.set(n.page, hd = h('h3', { class: 'fb__page', dir: 'ltr' }, decodeURI(n.page)));
        desired.push(hd);
      }
      desired.push(itemFor(n));
    }
  }
  for (const [id, it] of items) if (!notes.some((n) => n.id === id)) { it.el.remove(); items.delete(id); }
  const cur = [...R.list.children];
  if (cur.length !== desired.length || cur.some((c, i) => c !== desired[i])) R.list.replaceChildren(...desired);
}

function itemFor(n: Note): HTMLElement {
  const sig = JSON.stringify([n.id, n.status, n.note, n.editedAt, n.shot, n.name, n.mine, n._pending, n._error, n.replies.map((r) => [r.id, r.text, r.editedAt, r._pending, r.name]), located.get(n.id), nums.get(n.id), n.page === here()]);
  const hit = items.get(n.id);
  if (hit && hit.sig === sig) return hit.el;
  const el = buildItem(n);
  items.set(n.id, { el, sig });
  return el;
}

function buildItem(n: Note): HTMLElement {
  const open = expanded === n.id;
  const detached = located.get(n.id) === 'detached';
  const quote = n.kind === 'text' ? n.anchor.exact : n.kind === 'element' ? n.anchor.element : t.pageNote;
  const shotUrl = n.shot ? ctx.api.shotUrl(n.shot) : '';
  const meta = [who(n), n._pending ? t.pending : rel(n.createdAt), n.replies.length ? repliesLabel(n.replies.length) : ''].filter(Boolean).join(' · ');

  const head = h('button', { type: 'button', class: 'fb__item-head', 'data-act': 'toggle', 'aria-expanded': String(open) },
    h('span', { class: 'fb__num' }, String(nums.get(n.id) ?? '')),
    h('span', { class: 'fb__item-main' },
      h('span', { class: cls('fb__item-quote', n.kind !== 'text' && 'is-plain') }, quote),
      h('span', { class: 'fb__item-text' }, n.note),
      h('span', { class: 'fb__meta' }, meta, n.status === 'resolved' && h('span', { class: 'fb__tag is-ok' }, t.fResolved), detached && h('span', { class: 'fb__tag is-warn' }, t.detached)),
    ),
    shotUrl && h('img', { class: 'fb__thumb', src: shotUrl, alt: '', loading: 'lazy' }),
  );

  const body = h('div', { class: 'fb__item-body', hidden: !open });
  if (shotUrl) body.append(h('a', { class: 'fb__shot', href: shotUrl, target: '_blank', rel: 'noopener' }, h('img', { src: shotUrl, alt: t.shotAlt, loading: 'lazy' })));
  if (n._error) {
    body.append(h('p', { class: 'fb__err', role: 'alert' }, t.sendFailed),
      h('div', { class: 'fb__row' }, h('button', { type: 'button', class: 'fb__btn fb__btn--sm fb__btn--primary', 'data-act': 'retry' }, t.retry), h('button', { type: 'button', class: 'fb__btn fb__btn--sm', 'data-act': 'discard' }, t.discard)));
  }
  if (n.replies.length) body.append(h('div', { class: 'fb__replies' }, ...n.replies.map((r) => buildReply(r))));
  if (!n._pending && !n._error) {
    const ta = h<HTMLTextAreaElement>('textarea', { name: 'text', rows: '2', maxlength: '5000', required: true, placeholder: t.replyPh, 'aria-label': t.reply });
    ta.value = drafts.get(n.id) || '';
    body.append(h('form', { class: 'fb__reply-form', 'data-form': 'reply' }, ta, h('button', { type: 'submit', class: 'fb__btn fb__btn--sm fb__btn--primary' }, t.sendReply)));
    const acts = h('div', { class: 'fb__row' });
    const btn = (act: string, label: string, extra = '') => h('button', { type: 'button', class: `fb__link ${extra}`.trim(), 'data-act': act }, label);
    acts.append(btn('status', n.status === 'open' ? t.resolve : t.reopen));
    if (n.page !== here()) acts.append(btn('open-page', t.openPage));
    else if (n.kind !== 'page' && !detached) acts.append(btn('goto', t.goto));
    if (n.mine) acts.append(btn('edit', t.edit), btn('del', t.del, 'is-danger'));
    body.append(acts);
  }
  return h('article', { class: cls('fb__item', n.status === 'resolved' && 'is-resolved', n._pending && 'is-pending', n._error && 'is-error', open && 'is-open', detached && 'is-detached'), 'data-id': n.id }, head, body);
}

function buildReply(r: Reply): HTMLElement {
  return h('div', { class: cls('fb__reply', r._pending && 'is-pending'), 'data-rid': r.id },
    h('p', { class: 'fb__reply-meta' }, `${who(r)} · ${r._pending ? t.pending : rel(r.createdAt)}${r.editedAt ? ` · ${t.edited}` : ''}`),
    h('p', { class: 'fb__reply-text' }, r.text),
    r.mine && !r._pending && h('div', { class: 'fb__row' },
      h('button', { type: 'button', class: 'fb__link', 'data-act': 'reply-edit' }, t.edit),
      h('button', { type: 'button', class: 'fb__link is-danger', 'data-act': 'reply-del' }, t.del)),
  );
}

function setOpen(id: string | null) {
  const prev = expanded;
  expanded = id;
  for (const k of [prev, id]) {
    const el = k && items.get(k)?.el;
    if (!el) continue;
    const on = k === id;
    el.classList.toggle('is-open', on);
    el.querySelector('.fb__item-head')!.setAttribute('aria-expanded', String(on));
    el.querySelector<HTMLElement>('.fb__item-body')!.hidden = !on;
  }
}

/** First click arms the button, second click within 4s confirms. */
function confirmTwice(b: HTMLElement): boolean {
  if (b.dataset.confirm === '1') return true;
  const label = b.textContent;
  b.dataset.confirm = '1';
  b.textContent = t.confirmDel;
  setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = label; } }, 4000);
  return false;
}

function onPanelClick(e: MouseEvent) {
  const b = (e.target as Element).closest<HTMLElement>('[data-act]');
  const item = b?.closest<HTMLElement>('.fb__item');
  const n = find(item?.dataset.id);
  if (!b || !n) return;
  const act = b.dataset.act;
  const rid = b.closest<HTMLElement>('.fb__reply')?.dataset.rid;
  switch (act) {
    case 'toggle':
      if (expanded === n.id) setOpen(null);
      else { setOpen(n.id); if (n.page === here()) flash(n.id); }
      break;
    case 'goto':
      flash(n.id);
      if (narrow()) closePanel(false);
      break;
    case 'open-page':
      if (n.page.startsWith('/')) { session.set('fb-goto', n.id); location.assign(n.page); }
      break;
    case 'status': void setStatus(n); break;
    case 'edit': startEdit(n, item!); break;
    case 'del': if (confirmTwice(b)) void removeNote(n); break;
    case 'retry': n._error = false; n._pending = true; renderList(); void send(n, false, null); break;
    case 'discard': dropLocal(n); break;
    case 'reply-edit': { const r = n.replies.find((x) => x.id === rid); if (r) startReplyEdit(r, b.closest<HTMLElement>('.fb__reply')!); break; }
    case 'reply-edit-cancel': items.delete(n.id); renderList(); break;
    case 'reply-del': if (confirmTwice(b) && rid) void removeReply(n, rid); break;
  }
}

function onPanelSubmit(e: Event) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const n = find(form.closest<HTMLElement>('.fb__item')?.dataset.id);
  const text = (form.querySelector('textarea') as HTMLTextAreaElement | null)?.value.trim();
  if (!n || !text) return;
  switch (form.dataset.form) {
    case 'reply': void addReply(n, text); break;
    case 'edit': void saveEdit(n, text); break;
    case 'reply-edit': { const rid = form.closest<HTMLElement>('.fb__reply')?.dataset.rid; if (rid) void saveReplyEdit(n, rid, text); break; }
  }
}

/* ---------- mutations (optimistic, reverted on failure) ---------- */

function dropLocal(n: Note) {
  rev++;
  notes = notes.filter((x) => x !== n);
  syncHighlights();
  renderList();
  updateCount();
}

async function setStatus(n: Note) {
  rev++;
  const prev = n.status;
  n.status = prev === 'open' ? 'resolved' : 'open';
  syncHighlights();
  renderList();
  updateCount();
  try {
    await ctx.api.setStatus(n.id, n.status);
  } catch {
    n.status = prev;
    syncHighlights();
    renderList();
    updateCount();
    toast(t.failed, true);
  }
}

function startEdit(n: Note, item: HTMLElement) {
  const body = item.querySelector('.fb__item-body')!;
  if (body.querySelector('[data-form=edit]')) return;
  const ta = h<HTMLTextAreaElement>('textarea', { name: 'text', rows: '4', maxlength: '5000', required: true, 'aria-label': t.edit });
  ta.value = n.note;
  const form = h('form', { class: 'fb__reply-form', 'data-form': 'edit' }, ta,
    h('div', { class: 'fb__row' }, h('button', { type: 'submit', class: 'fb__btn fb__btn--sm fb__btn--primary' }, t.save), h('button', { type: 'button', class: 'fb__btn fb__btn--sm', 'data-act': 'reply-edit-cancel' }, t.cancel)));
  body.prepend(form);
  ta.focus();
}

async function saveEdit(n: Note, text: string) {
  rev++;
  const prev = n.note;
  n.note = text;
  items.delete(n.id);
  renderList();
  try {
    const saved = await ctx.api.edit(n.id, text);
    n.editedAt = saved.editedAt;
  } catch {
    n.note = prev;
    items.delete(n.id);
    renderList();
    toast(t.failed, true);
  }
}

async function removeNote(n: Note) {
  if (n._pending || n._error) { dropLocal(n); return; }
  const idx = notes.indexOf(n);
  dropLocal(n);
  try {
    await ctx.api.remove(n.id);
    toast(t.deleted);
  } catch {
    notes.splice(Math.min(idx, notes.length), 0, n);
    syncHighlights();
    renderList();
    updateCount();
    toast(t.failed, true);
  }
}

async function addReply(n: Note, text: string) {
  rev++;
  const name = getName();
  const tmp: Reply = { id: `tmp-${rand()}`, createdAt: new Date().toISOString(), name, text, mine: true, _pending: true };
  n.replies.push(tmp);
  drafts.delete(n.id);
  renderList();
  try {
    const saved = await ctx.api.reply(n.id, name, text);
    Object.assign(tmp, saved, { _pending: false });
    delete tmp._pending;
    renderList();
    items.get(n.id)?.el.querySelector<HTMLTextAreaElement>('.fb__reply-form textarea')?.focus();
  } catch {
    n.replies = n.replies.filter((r) => r !== tmp);
    drafts.set(n.id, text); // keep what was typed
    renderList();
    toast(t.failed, true);
  }
}

function startReplyEdit(r: Reply, row: HTMLElement) {
  if (row.querySelector('form')) return;
  const ta = h<HTMLTextAreaElement>('textarea', { name: 'text', rows: '3', maxlength: '5000', required: true, 'aria-label': t.edit });
  ta.value = r.text;
  const form = h('form', { class: 'fb__reply-form', 'data-form': 'reply-edit' }, ta,
    h('div', { class: 'fb__row' }, h('button', { type: 'submit', class: 'fb__btn fb__btn--sm fb__btn--primary' }, t.save), h('button', { type: 'button', class: 'fb__btn fb__btn--sm', 'data-act': 'reply-edit-cancel' }, t.cancel)));
  row.replaceChildren(form);
  ta.focus();
}

async function saveReplyEdit(n: Note, rid: string, text: string) {
  rev++;
  const r = n.replies.find((x) => x.id === rid);
  if (!r) return;
  const prev = r.text;
  r.text = text;
  renderList();
  try {
    const saved = await ctx.api.editReply(n.id, rid, text);
    r.editedAt = saved.editedAt;
    renderList();
  } catch {
    r.text = prev;
    renderList();
    toast(t.failed, true);
  }
}

async function removeReply(n: Note, rid: string) {
  rev++;
  const prev = n.replies;
  n.replies = prev.filter((r) => r.id !== rid);
  renderList();
  try {
    await ctx.api.removeReply(n.id, rid);
  } catch {
    n.replies = prev;
    renderList();
    toast(t.failed, true);
  }
}
