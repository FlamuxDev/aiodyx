import { DATA, LANGS, SITE, abs, href } from '../lib/site';

// /llms.txt: short index of every page in both languages, built from the content JSON.
export const GET = () => {
  const en = DATA.en;
  const lines = [`# ${en.site.name}`, '', `> ${en.pages.home.seo.description}`, '', `Full text of every page, both languages: ${SITE}/llms-full.txt`, ''];
  for (const lang of LANGS) {
    const d = DATA[lang];
    const L = (title: string, path: string, desc: string) => `- [${title}](${abs(href(lang, path))}): ${desc}`;
    lines.push(`## ${lang === 'ar' ? 'العربية (Arabic)' : 'English'}`, '', '### Pages', '');
    lines.push(L(d.pages.home.seo.title, '', d.pages.home.seo.description));
    for (const [key, path] of [['why-odoo', 'why-odoo/'], ['apps', 'apps/'], ['industries', 'industries/'], ['services', 'services/'], ['how-we-work', 'how-we-work/'], ['about', 'about/'], ['faq', 'faq/'], ['contact', 'contact/']] as const) {
      const s = d.pages[key].seo;
      lines.push(L(s.title, path, s.description));
    }
    lines.push('', `### ${d.site.nav.apps}`, '');
    for (const a of d.apps) lines.push(L(a.name, `apps/${a.slug}/`, a.seo.description));
    lines.push('', `### ${d.site.nav.industries}`, '');
    for (const i of d.industries) lines.push(L(i.name, `industries/${i.slug}/`, i.seo.description));
    lines.push('', `### ${d.site.footer.officesTitle}`, '');
    for (const o of d.offices) lines.push(`- ${o.label}${o.city ? `, ${o.city}` : ''}, ${o.country}: ${o.phone}`);
    lines.push('');
  }
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
