import en from '../../content/en.json';
import ar from '../../content/ar.json';

export const LANGS = ['ar', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DATA = { en, ar } as const;
export const SITE = String(import.meta.env.SITE).replace(/\/$/, '');
/** Deploy sub-path without trailing slash ('' at the domain root, '/aiodyx' on GitHub Pages). */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const META = {
  ar: { dir: 'rtl', locale: 'ar_JO', other: 'en', switchLabel: 'English' },
  en: { dir: 'ltr', locale: 'en_US', other: 'ar', switchLabel: 'العربية' },
} as const;

// Strings that do not exist in the content JSON (UI chrome only).
export const UI = {
  en: {
    skip: 'Skip to content',
    menu: 'Menu',
    mainNav: 'Main',
    mobileNav: 'Mobile',
    crumbs: 'Breadcrumb',
    wa: (topic?: string) => `Hello, I'd like to book a free Odoo consultation${topic ? ` about ${topic}` : ''}.`,
    notFound: { title: 'Page not found', body: "The page you're looking for isn't here. Try the home page." },
  },
  ar: {
    skip: 'روح للمحتوى',
    menu: 'القائمة',
    mainNav: 'الرئيسية',
    mobileNav: 'الجوال',
    crumbs: 'وين أنت',
    wa: (topic?: string) => `هلا، أبغى جلسة مجانية عن Odoo${topic ? ` (${topic})` : ''}.`,
    notFound: { title: 'الصفحة مو موجودة', body: 'ما لقينا الصفحة اللي تبيها. جرّب الصفحة الرئيسية.' },
  },
} as const;

// Words highlighted with the violet gradient .mark in the home headline.
const HERO_MARK = { en: 'one system', ar: 'نظام واحد' } as const;

export const WA_NUMBER = '962775999908';
export const waUrl = (lang: Lang, topic?: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(UI[lang].wa(topic))}`;
export const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const href = (lang: Lang, path = '') => `${BASE}/${lang}/${path}`;
/** Root-relative public asset path, prefixed with the deploy base. */
export const asset = (path: string) => `${BASE}${path}`;
export const abs = (path: string) => `${SITE}${path}`;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escape text and wrap `words` (or, if omitted, the last word) in the violet gradient highlight. */
export function marked(text: string, words?: string) {
  const t = esc(text);
  const w = words ? esc(words) : t.split(' ').slice(-1)[0];
  const i = t.lastIndexOf(w);
  return i < 0 ? t : `${t.slice(0, i)}<span class="mark">${w}</span>${t.slice(i + w.length)}`;
}
export const heroTitle = (lang: Lang) => marked(DATA[lang].pages.home.hero.title, HERO_MARK[lang]);

export const slugs = {
  apps: en.apps.map((a) => a.slug),
  industries: en.industries.map((a) => a.slug),
};
export const pathsFor = (list: string[]) => LANGS.flatMap((lang) => list.map((slug) => ({ params: { lang, slug } })));
export const langPaths = () => LANGS.map((lang) => ({ params: { lang } }));
