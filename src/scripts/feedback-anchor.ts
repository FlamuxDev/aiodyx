// Anchoring for review notes: W3C-style TextQuoteSelector (exact + prefix + suffix) over a normalized text
// index of the page, plus CSS-path selectors for element notes. Pure DOM helpers, no UI.

export interface Anchor {
  exact: string;
  prefix: string;
  suffix: string;
  selector: string;
  section: string;
  element: string;
}

const CONTEXT = 32;
const MAX_EXACT = 1900;
/** Text inside these (or our own UI) never takes part in anchoring. */
const SKIP = 'script, style, noscript, template, svg, .fb';
/** Moving between these starts a new "block": the index puts one space there, like a selection's line break. */
const BLOCK = 'p, li, ul, ol, h1, h2, h3, h4, h5, h6, div, section, article, header, footer, nav, main, aside, td, th, tr, table, blockquote, figure, figcaption, dd, dt, summary, pre, form';
/** Where a text note is anchored (nearest block) and what a click on an element pins to. */
const TEXT_BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, dd, dt, summary, div';
const PIN_TARGET = 'svg, img, picture, video, canvas, button, a, input, select, textarea, h1, h2, h3, h4, h5, h6, p, li, figure, td, th, label';

interface Seg { node: Text; offs: Int32Array }
export interface TextIndex {
  text: string;
  segs: Seg[];
  outNode: Text[];
  outOff: number[];
}

const WS = /\s/;

/** Whitespace-collapsed text of the visible page with a char -> (text node, offset) map. */
export function buildIndex(root: Element = document.body): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const visible = new Map<Element, boolean>();
  const segs: Seg[] = [];
  const outNode: Text[] = [];
  const outOff: number[] = [];
  const parts: string[] = [];
  let lastSpace = true;
  let prev: Text | null = null;
  let prevBlock: Element | null = null;

  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) continue;
    let ok = visible.get(p);
    if (ok === undefined) { ok = p.checkVisibility ? p.checkVisibility() : true; visible.set(p, ok); }
    if (!ok) continue;

    const block = p.closest(BLOCK);
    if (prev && block !== prevBlock && !lastSpace) {
      parts.push(' '); outNode.push(prev); outOff.push(prev.length); lastSpace = true;
    }
    const data = n.data;
    const offs = new Int32Array(data.length + 1);
    for (let i = 0; i < data.length; i++) {
      offs[i] = parts.length;
      if (WS.test(data[i])) {
        if (lastSpace) continue;
        parts.push(' '); lastSpace = true;
      } else {
        parts.push(data[i]); lastSpace = false;
      }
      outNode.push(n); outOff.push(i);
    }
    offs[data.length] = parts.length;
    segs.push({ node: n, offs });
    prev = n; prevBlock = block;
  }
  return { text: parts.join(''), segs, outNode, outOff };
}

/** Normalized index of a DOM boundary point, or null if it sits in text we do not index. */
function toIndex(ix: TextIndex, container: Node, offset: number, end: boolean): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const seg = ix.segs.find((s) => s.node === container);
    return seg ? seg.offs[Math.min(offset, seg.offs.length - 1)] : null;
  }
  const point = document.createRange();
  point.setStart(container, offset);
  point.collapse(true);
  if (!end) {
    const seg = ix.segs.find((s) => point.comparePoint(s.node, 0) >= 0);
    return seg ? seg.offs[0] : ix.text.length;
  }
  let last: Seg | null = null;
  for (const s of ix.segs) if (point.comparePoint(s.node, s.node.length) <= 0) last = s;
  return last ? last.offs[last.node.length] : 0;
}

/** Nearest ancestor block + its heading/section, as a human-readable label. */
export function sectionOf(el: Element): string {
  const sec = el.closest('section');
  let heading = sec?.querySelector('h1, h2, h3')?.textContent?.trim() || '';
  if (!heading) {
    // Fall back to the closest heading that precedes the element in document order.
    for (const hd of document.querySelectorAll('main h1, main h2, main h3')) {
      if (hd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) heading = hd.textContent?.trim() || heading;
      else break;
    }
  }
  return [sec?.id && `#${sec.id}`, heading.replace(/\s+/g, ' ').slice(0, 80)].filter(Boolean).join(' · ');
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let anchored = false;
  for (let n: Element | null = el; n && n !== document.body && n !== document.documentElement && parts.length < 14; n = n.parentElement) {
    if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); anchored = true; break; }
    const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.localName === n!.localName) : [];
    parts.unshift(n.localName + (sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(n) + 1})` : ''));
  }
  return (anchored ? '' : 'body > ') + parts.join(' > ');
}

const query = (selector: string): Element | null => {
  try { return selector ? document.querySelector(selector) : null; } catch { return null; }
};

/** Builds the anchor for a user selection, or null when the selection is not indexable text. */
export function describeRange(range: Range): Anchor | null {
  const ix = buildIndex();
  let s = toIndex(ix, range.startContainer, range.startOffset, false);
  let e = toIndex(ix, range.endContainer, range.endOffset, true);
  if (s === null || e === null) return null;
  while (s < e && ix.text[s] === ' ') s++;
  while (e > s && ix.text[e - 1] === ' ') e--;
  e = Math.min(e, s + MAX_EXACT);
  if (e <= s) return null;
  const common = range.commonAncestorContainer;
  const host = (common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement) as Element;
  const block = host.closest(TEXT_BLOCK) || host;
  return {
    exact: ix.text.slice(s, e),
    prefix: ix.text.slice(Math.max(0, s - CONTEXT), s),
    suffix: ix.text.slice(e, e + CONTEXT),
    selector: cssPath(block),
    section: sectionOf(block),
    element: '',
  };
}

/** Element worth pinning when `el` is clicked (nearest meaningful ancestor). */
export function pickTarget(el: Element): Element | null {
  const t = el.closest(PIN_TARGET) || el;
  return t === document.body || t === document.documentElement ? null : t;
}

export function describeElement(el: Element): Anchor {
  const tag = el.localName;
  const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || el.querySelector('title')?.textContent || '';
  const src = el instanceof HTMLImageElement ? el.currentSrc.split('/').pop()?.split('?')[0] || '' : '';
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const label = (alt || text || src).trim().slice(0, 120);
  return {
    exact: label, prefix: '', suffix: '', selector: cssPath(el), section: sectionOf(el),
    element: `${tag}${label ? ` "${label.slice(0, 60)}"` : ''}`,
  };
}

/* ---------- re-locating ---------- */

const suffixLen = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };
const prefixLen = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

function interval(ix: TextIndex, el: Element): [number, number] | null {
  const inside = ix.segs.filter((s) => el.contains(s.node));
  if (!inside.length) return null;
  const last = inside[inside.length - 1];
  return [inside[0].offs[0], last.offs[last.node.length]];
}

/** Best occurrence of the quote inside [from, to), ranked by how well prefix/suffix match around it. */
function bestMatch(ix: TextIndex, a: Anchor, from: number, to: number): number {
  let best = -1;
  let bestScore = -1;
  for (let i = ix.text.indexOf(a.exact, from); i >= 0 && i + a.exact.length <= to; i = ix.text.indexOf(a.exact, i + 1)) {
    const end = i + a.exact.length;
    const score = suffixLen(a.prefix, ix.text.slice(Math.max(0, i - a.prefix.length), i)) + prefixLen(a.suffix, ix.text.slice(end, end + a.suffix.length));
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

/** Re-finds a quote: first inside its recorded block, then in <main>, then anywhere on the page. */
export function locateText(a: Anchor): Range | null {
  if (!a.exact) return null;
  const ix = buildIndex();
  const scopes: ([number, number] | null)[] = [];
  const block = query(a.selector);
  if (block) scopes.push(interval(ix, block));
  const main = document.querySelector('main');
  if (main) scopes.push(interval(ix, main));
  scopes.push([0, ix.text.length]);
  for (const sc of scopes) {
    if (!sc) continue;
    const i = bestMatch(ix, a, sc[0], sc[1]);
    if (i < 0) continue;
    const end = i + a.exact.length - 1;
    const r = document.createRange();
    r.setStart(ix.outNode[i], ix.outOff[i]);
    r.setEnd(ix.outNode[end], ix.outOff[end] + 1);
    return r;
  }
  return null;
}

export function locateElement(a: Anchor): Element | null {
  const el = query(a.selector);
  if (el && !el.closest('.fb')) return el;
  // The structure moved: find the same kind of element carrying the same label.
  const tag = a.selector.split('>').pop()?.trim().replace(/:nth-of-type\(\d+\)$/, '').replace(/^#.*/, '') || '';
  if (!tag || !a.exact || !/^[a-z][a-z0-9-]*$/.test(tag)) return null;
  for (const c of document.querySelectorAll(tag)) {
    if (c.closest('.fb')) continue;
    const label = c.getAttribute('alt') || c.getAttribute('aria-label') || (c.textContent || '').replace(/\s+/g, ' ');
    if (label.includes(a.exact)) return c;
  }
  return null;
}

/* ---------- highlighting ---------- */

/** Wraps every text run of the range in <mark class="fb-hl">. Safe across element boundaries. */
export function wrapRange(range: Range, id: string, resolved: boolean): HTMLElement[] {
  const nodes: Text[] = [];
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) if (range.intersectsNode(n)) nodes.push(n);
  }
  const marks: HTMLElement[] = [];
  for (const node of nodes) {
    if (node.parentElement?.closest(SKIP)) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    if (to <= from || !/\S/.test(node.data.slice(from, to))) continue;
    let target = node;
    if (from > 0) target = node.splitText(from);
    if (to - from < target.length) target.splitText(to - from);
    const mark = document.createElement('mark');
    mark.className = `fb-hl${resolved ? ' is-resolved' : ''}`;
    mark.dataset.id = id;
    target.parentNode!.insertBefore(mark, target);
    mark.appendChild(target);
    marks.push(mark);
  }
  return marks;
}

export function unwrapMarks(scope: ParentNode = document, id?: string) {
  const parents = new Set<Node>();
  for (const m of scope.querySelectorAll<HTMLElement>(id ? `mark.fb-hl[data-id="${CSS.escape(id)}"]` : 'mark.fb-hl')) {
    if (m.parentNode) parents.add(m.parentNode);
    m.replaceWith(...m.childNodes);
  }
  for (const p of parents) p.normalize();
}
