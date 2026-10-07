import { DATA, LANGS, abs, href, type Lang } from '../lib/site';

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
const faq = (xs: { q: string; a: string }[]) => xs.map((f) => `**${f.q}**\n${f.a}`).join('\n\n');
const titled = (xs: { title: string; body: string }[]) => xs.map((x) => `**${x.title}.** ${x.body}`).join('\n\n');

// /llms-full.txt: all page text, both languages, as one markdown document.
function pages(lang: Lang) {
  const d = DATA[lang];
  const p = d.pages;
  const out: string[] = [];
  const page = (path: string, title: string, body: string[]) =>
    out.push(`## ${title}\n\nURL: ${abs(href(lang, path))}\n\n${body.join('\n\n')}`);

  page('', p.home.seo.title, [
    `${p.home.hero.title}. ${p.home.hero.body}`,
    `### ${p.home.whatWeDo.title}\n\n${p.home.whatWeDo.body.join('\n\n')}`,
    `### ${p.home.whyOdoo.title}\n\n${titled(p.home.whyOdoo.points)}`,
    `### ${p.home.appsTeaser.title}\n\n${p.home.appsTeaser.body}`,
    `### ${p.home.industriesTeaser.title}\n\n${p.home.industriesTeaser.body}`,
    `### ${p.home.howWeWork.title}\n\n${p.home.howWeWork.body}\n\n${titled(p.home.howWeWork.steps)}`,
    `### ${p.home.presence.title}\n\n${p.home.presence.body}\n\n${p.home.presence.countries.map((c) => `**${c.name}.** ${c.body}`).join('\n\n')}`,
    `### ${p.home.faqTeaser.title}\n\n${faq(p.home.faqTeaser.items)}`,
    `### ${p.home.finalCta.title}\n\n${p.home.finalCta.body}`,
  ]);

  const w = p['why-odoo'];
  page('why-odoo/', w.seo.title, [
    `${w.intro.title}. ${w.intro.body}`,
    `### ${w.whatIs.title}\n\n${w.whatIs.body.join('\n\n')}`,
    `### ${w.problems.title}\n\n${titled(w.problems.items)}`,
    `### ${w.benefits.title}\n\n${titled(w.benefits.items)}`,
    `### ${w.editions.title}\n\n${w.editions.body}\n\n**${w.editions.community.name}.** ${w.editions.community.body}\n${list(w.editions.community.points)}\n\n**${w.editions.enterprise.name}.** ${w.editions.enterprise.body}\n${list(w.editions.enterprise.points)}\n\n${w.editions.note}`,
    `### ${w.hosting.title}\n\n${titled(w.hosting.items)}`,
    `### ${w.notFit.title}\n\n${w.notFit.body}\n\n${titled(w.notFit.items)}\n\n${w.notFit.closing}`,
    `### ${w.cta.title}\n\n${w.cta.body}`,
  ]);

  page('apps/', p.apps.seo.title, [`${p.apps.intro.title}. ${p.apps.intro.body}`, p.apps.note, ...d.apps.map((a) => `- [${a.name}](${abs(href(lang, `apps/${a.slug}/`))}): ${a.promise}`)]);
  for (const a of d.apps) {
    page(`apps/${a.slug}/`, a.seo.title, [
      `${a.name}. ${a.promise}`,
      `**${d.site.labels.appFor}:** ${a.for}`,
      `### ${d.site.labels.appFeatures}\n\n${list(a.features)}`,
      `### ${d.site.labels.appOutcome}\n\n${a.outcome}`,
      `### ${d.site.labels.appConnects}\n\n${a.connects}`,
      `### ${d.site.labels.faq}\n\n${faq(a.faq)}`,
    ]);
  }

  page('industries/', p.industries.seo.title, [`${p.industries.intro.title}. ${p.industries.intro.body}`, ...d.industries.map((i) => `- [${i.name}](${abs(href(lang, `industries/${i.slug}/`))}): ${i.promise}`)]);
  for (const i of d.industries) {
    page(`industries/${i.slug}/`, i.seo.title, [
      `${i.name}. ${i.promise}`,
      `### ${d.site.labels.industryPains}\n\n${list(i.pains)}`,
      `### ${d.site.labels.industryApps}\n\n${i.appsNote}\n\n${list(i.apps.map((s) => d.apps.find((a) => a.slug === s)!.name))}`,
      `### ${d.site.labels.industryDay}\n\n${i.day.map((t, n) => `${n + 1}. ${t}`).join('\n')}`,
      `### ${d.site.labels.faq}\n\n${faq(i.faq)}`,
    ]);
  }

  page('services/', p.services.seo.title, [
    `${p.services.intro.title}. ${p.services.intro.body}`,
    ...d.services.map((s) => `### ${s.name}\n\n${s.summary}\n\n${list(s.points)}`),
  ]);

  const h = p['how-we-work'];
  page('how-we-work/', h.seo.title, [
    `${h.intro.title}. ${h.intro.body}`,
    ...h.steps.map((s, n) => `### ${d.site.labels.step} ${n + 1}: ${s.title}\n\n${s.body}\n\n**${d.site.labels.fromYou}:** ${s.fromYou}`),
    h.note,
  ]);

  const a = p.about;
  page('about/', a.seo.title, [
    `${a.intro.title}. ${a.intro.body}`,
    `### ${a.whoWeServe.title}\n\n${a.whoWeServe.body}`,
    `### ${a.principles.title}\n\n${titled(a.principles.items)}`,
    `### ${a.presence.title}\n\n${a.presence.body}`,
  ]);

  page('faq/', p.faq.seo.title, [`${p.faq.intro.title}. ${p.faq.intro.body}`, faq(p.faq.items)]);

  const c = p.contact;
  page('contact/', c.seo.title, [
    `${c.intro.title}. ${c.intro.body}`,
    `### ${c.consultation.title}\n\n${list(c.consultation.points)}`,
    `### ${c.whatsapp.title}\n\n${c.whatsapp.body} ${c.whatsapp.number}`,
    `### ${c.offices.title}\n\n${c.offices.body}\n\n${list(d.offices.map((o) => `${o.label}${o.city ? `, ${o.city}` : ''}, ${o.country}: ${o.phone}`))}`,
  ]);
  return out.join('\n\n');
}

export const GET = () =>
  new Response(
    [`# ${DATA.en.site.name}\n\n> ${DATA.en.site.tagline}`, ...LANGS.map((l) => `# ${l === 'ar' ? 'العربية (Arabic)' : 'English'}\n\n${pages(l)}`)].join('\n\n---\n\n') + '\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
