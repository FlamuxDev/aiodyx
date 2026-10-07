// Calm page motion: reveal on scroll (below-the-fold only) and a tiny pointer tilt on cards.
// No-JS / reduced-motion: nothing is hidden and nothing moves.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduce) {
  const sel = '.shead, .hsteps, .ba__before, .ba__after, .bx, .ic, .road, .ask, .ocard, .wb, .val, .stepper__list li, .cell, .card, .steps li, .values li, .faq__item, .office, .feat, .rows li, .vtl li, .numlist li, .linklist li, .svc, .ind-card, .app-card, .cta, .action, .pv, .statement__in, .subhead, .anchors li';
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { (en.target as HTMLElement).classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  const groups = new Map<Element, number>();
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight * 0.92) return; // already on screen: leave visible
    if (el.parentElement?.closest('.rv')) return; // avoid nested double reveals
    const k = el.parentElement!;
    const i = groups.get(k) ?? 0;
    groups.set(k, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 5) * 70}ms`);
    el.classList.add('rv');
    io.observe(el);
  });

  if (matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll<HTMLElement>('.cell, .app-card, .ind-card').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
    });
  }
}
