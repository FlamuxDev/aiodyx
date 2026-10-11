// Geometry for the real Odoo 19 screenshots in public/odoo/v2/ (one Arabic and one English file per screen).
// Coordinates live in the 2400 x 1500 space of the source captures; the files on disk are 2000 / 1000 px wide
// and are positioned by percentages, so any crop works at any size.
// Layouts are written once in "English" terms; for Arabic pages the crop and the callout anchors are mirrored
// (the Odoo UI is right-to-left there), except for screens whose layout is identical in both languages.
// All text (alt, captions, callout labels) lives in content/*.json under "odoo".
import { asset, type Lang } from './site';
import { RECTS } from './shot-rects';

export const SHOT_W = 2400;
export const SHOT_H = 1500;
export const IMG_W = 2000;
export const IMG_H = 1250;

export type Crop = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number; side: 'l' | 'r' };
export const FULL: Crop = { x: 0, y: 0, w: SHOT_W, h: SHOT_H };

/** File of a screen in the page language; `sm` is the 1000 px version. */
export const shotSrc = (stem: string, lang: Lang, sm = false) => asset(`/odoo/v2/${stem}-${lang}${sm ? '-sm' : ''}.jpg`);
export const shotSet = (stem: string, lang: Lang) => `${shotSrc(stem, lang, true)} 1000w, ${shotSrc(stem, lang)} 2000w`;

/** Screens whose layout is the same in both languages (the printed invoice keeps one layout). */
const FIXED = new Set(['einvoice-zatca']);
const mirrored = (stem: string, lang: Lang) => lang === 'ar' && !FIXED.has(stem);

/** Visible height of each screen: trims the empty lower part of sparse screens. */
const VIEW_H: Record<string, number> = {
  'accounting-invoice': 1330,
  'accounting-dashboard': 980,
  'sales-order': 1320,
  'inventory-product': 1090,
  'purchase-order': 1200,
  'manufacturing-orders': 930,
  'hr-employees': 1090,
  'expenses': 1000,
  attendance: 820,
  'sales-quotes': 900,
  'projects-tasks': 1010,
  fleet: 1210,
  marketing: 750,
  'einvoice-jofotara': 1300,
};
export const defaultCrop = (stem: string): Crop => ({ x: 0, y: 0, w: SHOT_W, h: VIEW_H[stem] ?? SHOT_H });

type Spec = { r: string; fx: number; fy: number; side: 'l' | 'r'; fa?: number } | { x: number; y: number; side: 'l' | 'r' };
export type View = { stem: string; crop: Crop; points: Spec[] };

/**
 * Zoomed views with numbered callouts. `points` follow the order of `odoo.views[id].callouts` in the JSON.
 * A point is either a position inside a measured element (r = element name, fx/fy = 0..1 inside it) or an
 * absolute position (x, y). `side` is where the label opens (written for the English layout).
 */
export const VIEWS: Record<string, View> = {
  'home-hero': {
    stem: 'accounting-invoice', crop: { x: 0, y: 0, w: 2400, h: 1250 },
    points: [{ r: 'paid ribbon', fx: 0.5, fy: 0.5, side: 'l' }, { r: 'totals', fx: -0.05, fy: 0.2, side: 'l' }],
  },
  'invoice-totals': {
    stem: 'accounting-invoice', crop: { x: 640, y: 650, w: 1520, h: 680 },
    points: [{ r: 'invoice lines', fx: 0.49, fy: 0.5, side: 'r' }, { r: 'totals', fx: -0.05, fy: 0.2, side: 'l' }, { r: 'totals', fx: -0.05, fy: 0.87, side: 'l' }],
  },
  'order-lines': {
    stem: 'sales-order', crop: { x: 640, y: 60, w: 1470, h: 1200 },
    points: [{ r: 'status bar', fx: 0.85, fy: 1.5, side: 'l' }, { x: 1400, y: 105, side: 'r' }, { r: 'order lines', fx: 0.54, fy: 1.22, side: 'l' }, { r: 'totals', fx: -0.05, fy: 0.85, side: 'l' }],
  },
  'product-form': {
    stem: 'inventory-product', crop: { x: 600, y: 60, w: 1520, h: 880 },
    points: [{ x: 790, y: 156, side: 'r' }, { r: 'price and cost', fx: 0.78, fy: 0.03, side: 'r' }, { r: 'price and cost', fx: 0.78, fy: 0.31, side: 'r' }],
  },
  'purchase-lines': {
    stem: 'purchase-order', crop: { x: 620, y: 60, w: 1500, h: 1120 },
    points: [{ r: 'status bar', fx: 0.85, fy: 1.5, side: 'l' }, { x: 1400, y: 105, side: 'r' }, { r: 'order lines', fx: 0.62, fy: 1.2, side: 'l' }, { r: 'totals', fx: -0.05, fy: 0.85, side: 'l' }],
  },
  'mo-states': {
    stem: 'manufacturing-orders', crop: { x: 1000, y: 130, w: 1400, h: 760 },
    points: [{ r: 'state badges', fx: 1.12, fy: 0.5, side: 'r' }, { x: 1470, y: 559, side: 'l' }, { x: 2092, y: 746, side: 'r' }],
  },
  'time-off-cal': {
    stem: 'time-off', crop: { x: 0, y: 200, w: 2400, h: 1300 },
    points: [{ r: 'first leave bar', fx: 1, fy: 0.5, side: 'r' }, { x: 1370, y: 1250, side: 'r' }, { r: 'side panel', fx: -0.02, fy: 0.62, side: 'l' }],
  },
  'pos-order': {
    stem: 'pos-register', crop: { x: 0, y: 90, w: 1500, h: 900 },
    points: [{ r: 'order lines', fx: 0.5, fy: 0.15, side: 'r' }, { r: 'order total', fx: 0.5, fy: -0.9, side: 'r' }, { r: 'category tabs', fx: 0.5, fy: 0.5, side: 'r' }],
  },
  'shop-filters': {
    stem: 'ecommerce-shop', crop: { x: 100, y: 40, w: 1400, h: 900 },
    points: [{ x: 300, y: 380, side: 'r' }, { r: 'category pills', fx: 1, fy: 0.5, side: 'r' }, { r: 'first product card', fx: 0.08, fy: 0.1, side: 'r' }],
  },
  'tasks-board': {
    stem: 'projects-tasks', crop: { x: 0, y: 150, w: 1250, h: 860 },
    points: [{ x: 200, y: 192, side: 'r' }, { r: 'task card', fx: 0.3, fy: 0.38, side: 'r' }, { r: 'task card', fx: 0.36, fy: 0.8, side: 'r' }],
  },
  'zatca-invoice': {
    stem: 'einvoice-zatca', crop: { x: 420, y: 300, w: 1560, h: 1150 },
    points: [{ r: 'seller VAT line', fx: 1.25, fy: 0.9, side: 'r' }, { r: 'title', fx: 1.12, fa: 1.3, fy: 0.15, side: 'r' }, { r: 'QR code', fx: 1, fy: 0.5, side: 'r' }],
  },
  'jofotara-state': {
    stem: 'einvoice-jofotara', crop: { x: 0, y: 0, w: 2400, h: 1300 },
    points: [{ r: 'JoFotara State field', fx: 1.12, fy: 0.5, side: 'r' }, { r: 'company in navbar', fx: 0.2, fy: 4.2, side: 'l' }],
  },
};

/** Resolve a view for a page language: mirrored crop and anchors, in 2400 x 1500 space. */
export function resolveView(id: string, lang: Lang): { stem: string; crop: Crop; points: Point[] } {
  const v = VIEWS[id];
  const m = mirrored(v.stem, lang);
  const c = m ? { ...v.crop, x: SHOT_W - v.crop.x - v.crop.w } : v.crop;
  const flip = (s: 'l' | 'r') => (m ? (s === 'l' ? 'r' : 'l') : s);
  const points = v.points.map((p): Point => {
    if ('r' in p) {
      const [x, y, w, h] = RECTS[lang][v.stem][p.r];
      const fx = lang === 'ar' && p.fa !== undefined ? p.fa : m ? 1 - p.fx : p.fx;
      return { x: x + fx * w, y: y + p.fy * h, side: flip(p.side) };
    }
    return { x: m ? SHOT_W - p.x : p.x, y: p.y, side: flip(p.side) };
  });
  return { stem: v.stem, crop: c, points };
}

/** App page: hero screen, zoomed detail view, and further screens of the same area. */
export const APP_PAGE: Record<string, { hero: string; detail: string; more: string[] }> = {
  accounting: { hero: 'accounting-invoice', detail: 'invoice-totals', more: ['accounting-dashboard'] },
  'sales-crm': { hero: 'crm-pipeline', detail: 'order-lines', more: ['sales-quotes'] },
  inventory: { hero: 'inventory-overview', detail: 'product-form', more: [] },
  purchase: { hero: 'purchase-order', detail: 'purchase-lines', more: [] },
  manufacturing: { hero: 'manufacturing-orders', detail: 'mo-states', more: [] },
  'hr-payroll': { hero: 'hr-employees', detail: 'time-off-cal', more: ['attendance', 'expenses'] },
  'point-of-sale': { hero: 'pos-register', detail: 'pos-order', more: [] },
  'website-ecommerce': { hero: 'ecommerce-shop', detail: 'shop-filters', more: [] },
  'project-timesheets': { hero: 'projects-tasks', detail: 'tasks-board', more: [] },
};

/** Thumbnail on the apps index cards (the apps page hero is different where a second screen suits better). */
export const APP_SHOT: Record<string, string> = Object.fromEntries(Object.entries(APP_PAGE).map(([k, v]) => [k, v.hero]));

/** Tabs of the home viewer: screen plus the app page it links to (null = apps index). */
export const HOME_TABS: { shot: string; app: string | null }[] = [
  { shot: 'accounting-dashboard', app: 'accounting' },
  { shot: 'crm-pipeline', app: 'sales-crm' },
  { shot: 'inventory-overview', app: 'inventory' },
  { shot: 'hr-employees', app: 'hr-payroll' },
  { shot: 'dashboards-sales', app: null },
  { shot: 'pos-register', app: 'point-of-sale' },
  { shot: 'ecommerce-shop', app: 'website-ecommerce' },
  { shot: 'projects-tasks', app: 'project-timesheets' },
];

/** Extra screens on the apps index (apps without a page of their own). */
export const EXTRA_SHOTS = ['fleet', 'marketing'];
