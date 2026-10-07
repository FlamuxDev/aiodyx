import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Single source of truth for the domain (not final yet). Everything else reads it via import.meta.env.SITE.
// GitHub Pages builds override these via SITE_URL / BASE_PATH (see .github/workflows/pages.yml).
const SITE = process.env.SITE_URL || 'https://aiodyx.com';
const BASE = process.env.BASE_PATH || '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // hreflang alternates in the sitemap; root redirect and 404s stay out
      filter: (page) => !page.includes('/404') && page !== new URL(BASE, SITE).href,
      i18n: { defaultLocale: 'ar', locales: { ar: 'ar', en: 'en' } },
    }),
  ],
});
