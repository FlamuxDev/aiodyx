// Non-text data for the integrations page and the home strip. All wording lives in content/*.json ("integrations").
import { asset } from './site';

/** Logo files in public/platforms/ with their natural aspect ratio (width / height). */
/** `s` enlarges marks whose wordmark is small inside the artwork (stacked or long text). */
export const LOGO: Record<string, { file: string; ar: number; s?: number }> = {
  zatca: { file: 'zatca.svg', ar: 1.61, s: 1.3 },
  qiwa: { file: 'qiwa.png', ar: 1.12 },
  mudad: { file: 'mudad.png', ar: 1.47 },
  gosi: { file: 'gosi.svg', ar: 2.48 },
  jofotara: { file: 'jofotara.png', ar: 1.64 },
  ssc: { file: 'ssc.png', ar: 4.95, s: 1.3 },
  hyperpay: { file: 'hyperpay.svg', ar: 2.86 },
  tap: { file: 'tap.svg', ar: 0.62 },
  moyasar: { file: 'moyasar.png', ar: 7.85 },
  aramex: { file: 'aramex.svg', ar: 6.12 },
  smsa: { file: 'smsa.svg', ar: 2.2 },
  salla: { file: 'salla.webp', ar: 1.86 },
  zid: { file: 'zid.svg', ar: 2.1 },
  shopify: { file: 'shopify.svg', ar: 3.16 },
  whatsapp: { file: 'whatsapp.svg', ar: 0.99 },
};

/** Rendered size in px: roughly equal visual area for every logo, capped so wide and tall marks stay balanced. */
export function logoSize(id: string) {
  const { ar: r, s = 1 } = LOGO[id];
  let w = Math.sqrt(2900 * r) * s, h = w / r;
  if (w > 104 * s) { w = 104 * s; h = w / r; }
  if (h > 44 * s) { h = 44 * s; w = h * r; }
  return { w: Math.round(w), h: Math.round(h) };
}
export const logoSrc = (id: string) => asset(`/platforms/${LOGO[id].file}`);

/** Fallback icon for items that have no logo. */
export const ITEM_ICON: Record<string, string> = { banks: 'sheet', biometric: 'devices' };

/** Hero diagram: logos on each side of the centre (top to bottom). */
export const HERO_LEFT = ['zatca', 'qiwa', 'mudad', 'gosi'];
export const HERO_RIGHT = ['jofotara', 'hyperpay', 'aramex', 'salla'];

/** Real Odoo screens on the integrations page: view id (src/lib/shots.ts) and screen name (content odoo.shots). */
export const INT_SHOTS = [
  { view: 'zatca-invoice', stem: 'einvoice-zatca' },
  { view: 'jofotara-state', stem: 'einvoice-jofotara' },
];
