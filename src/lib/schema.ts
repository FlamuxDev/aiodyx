import { DATA, SITE, abs, asset, href, tel, type Lang } from './site';

export type Crumb = { name: string; href: string };

const ORG = `${SITE}/#organization`;
const COUNTRY = { '+962': 'JO', '+966': 'SA' } as const;
const AREA = [
  { '@type': 'Country', name: 'Jordan' },
  { '@type': 'Country', name: 'Saudi Arabia' },
];

/** Organization + one ProfessionalService per office + WebSite. Emitted on every page. */
export function baseGraph(lang: Lang) {
  const d = DATA[lang];
  const logo = { '@type': 'ImageObject', url: abs(asset('/logo.svg')) };
  const offices = d.offices.map((o, i) => {
    const address: Record<string, string> = {
      '@type': 'PostalAddress',
      addressCountry: COUNTRY[o.phone.slice(0, 4) as keyof typeof COUNTRY],
    };
    if (o.city) address.addressLocality = o.city;
    return {
      '@type': 'ProfessionalService',
      '@id': `${SITE}/#office-${i + 1}`,
      name: 'AIODYX',
      alternateName: o.label,
      description: d.site.tagline,
      url: abs(href(lang, 'contact/')),
      image: logo.url,
      telephone: tel(o.phone).slice(4),
      address,
      areaServed: AREA,
      parentOrganization: { '@id': ORG },
    };
  });
  return [
    {
      '@type': 'Organization',
      '@id': ORG,
      name: d.site.name,
      url: abs(href(lang)),
      logo,
      description: d.site.tagline,
      areaServed: AREA,
      contactPoint: d.offices.map((o) => ({
        '@type': 'ContactPoint',
        contactType: 'sales',
        name: o.label,
        telephone: tel(o.phone).slice(4),
        areaServed: COUNTRY[o.phone.slice(0, 4) as keyof typeof COUNTRY],
        availableLanguage: ['ar', 'en'],
      })),
    },
    ...offices,
    {
      '@type': 'WebSite',
      '@id': `${SITE}/${lang}/#website`,
      name: d.site.name,
      url: abs(href(lang)),
      inLanguage: lang,
      publisher: { '@id': ORG },
    },
  ];
}

export function pageGraph(o: {
  lang: Lang; url: string; title: string; description: string; crumbs: Crumb[]; type?: string; extra?: object[];
}) {
  const nodes: object[] = [
    {
      '@type': o.type ?? 'WebPage',
      '@id': `${o.url}#webpage`,
      url: o.url,
      name: o.title,
      description: o.description,
      inLanguage: o.lang,
      isPartOf: { '@id': `${SITE}/${o.lang}/#website` },
      about: { '@id': ORG },
      ...(o.crumbs.length > 1 && { breadcrumb: { '@id': `${o.url}#breadcrumb` } }),
    },
  ];
  if (o.crumbs.length > 1) {
    nodes.push({
      '@type': 'BreadcrumbList',
      '@id': `${o.url}#breadcrumb`,
      itemListElement: o.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.href) })),
    });
  }
  return [...baseGraph(o.lang), ...nodes, ...(o.extra ?? [])];
}

export const faqNode = (lang: Lang, url: string, items: { q: string; a: string }[]) => ({
  '@type': 'FAQPage',
  '@id': `${url}#faq`,
  url,
  inLanguage: lang,
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const serviceNode = (o: { id: string; name: string; description: string; url: string; type?: string; lang: Lang }) => ({
  '@type': 'Service',
  '@id': o.id,
  name: o.name,
  description: o.description,
  url: o.url,
  serviceType: o.type ?? 'Odoo ERP implementation',
  inLanguage: o.lang,
  provider: { '@id': ORG },
  areaServed: AREA,
});

export const ldJson = (nodes: object[]) =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
