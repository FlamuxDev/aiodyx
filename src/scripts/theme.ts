// Wires the header theme button: one click switches light <-> dark (stored by the head script).
type Mode = 'light' | 'dark';
declare global { interface Window { __theme?: { get(): Mode; set(p: Mode): void } } }

const btn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
if (btn && window.__theme) {
  const api = window.__theme;
  const status = document.querySelector<HTMLElement>('[data-theme-status]');
  const sync = (announce: boolean) => {
    const dark = api.get() === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    if (status && announce) status.textContent = dark ? btn.dataset.dark ?? '' : btn.dataset.light ?? '';
  };
  btn.addEventListener('click', () => { api.set(api.get() === 'dark' ? 'light' : 'dark'); sync(true); });
  document.addEventListener('themechange', () => sync(false));
  sync(false);
}
export {};
