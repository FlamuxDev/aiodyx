// Review tool bootstrap. Keeps the page inert unless review mode is on: this file only wires the floating
// button and its open-notes badge; the review UI (feedback-ui.ts) is imported when the mode is switched on.
import { createApi } from './feedback-api';
import type { Ctx } from './feedback-ui';

const root = document.querySelector<HTMLElement>('.fb');
if (root) {
  const KEY = 'fb-review';
  const t = JSON.parse(root.dataset.t || '{}');
  const api = createApi(root.dataset.endpoint!);
  const fab = root.querySelector<HTMLButtonElement>('.fb__fab')!;
  const label = fab.querySelector<HTMLElement>('.fb__fab-label')!;
  const badge = fab.querySelector<HTMLElement>('.fb__badge')!;
  const bar = root.querySelector<HTMLElement>('.fb__bar')!;

  const store = (v?: string) => {
    try { if (v === undefined) return sessionStorage.getItem(KEY); sessionStorage.setItem(KEY, v); } catch { /* storage blocked */ }
    return null;
  };
  const isOn = () => fab.getAttribute('aria-pressed') === 'true';
  const setCount = (n: number) => {
    badge.hidden = n <= 0;
    badge.textContent = String(n);
    fab.setAttribute('aria-label', n > 0 ? `${label.textContent} (${n})` : label.textContent || '');
  };
  const ctx: Ctx = { root, t, lang: root.dataset.lang || 'ar', api, setCount };
  let ui: typeof import('./feedback-ui') | null = null;

  async function setMode(on: boolean) {
    fab.setAttribute('aria-pressed', String(on));
    label.textContent = on ? fab.dataset.on! : fab.dataset.off!;
    bar.hidden = !on;
    document.documentElement.classList.toggle('fb-on', on);
    store(on ? '1' : '0');
    if (on) {
      ui ??= await import('./feedback-ui');
      if (isOn()) ui.activate(ctx);
    } else {
      ui?.deactivate();
    }
  }

  fab.addEventListener('click', () => setMode(!isOn()));

  if (store() === '1') setMode(true);
  else {
    // Badge only: one cheap anonymous read, deferred so it never competes with page load.
    const count = () => api.list(location.pathname, true).then((l) => setCount(l.filter((n) => n.status === 'open').length)).catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(count, { timeout: 4000 });
    else setTimeout(count, 2000);
  }
}
