// Geometry for the real Odoo 19 screenshots in public/odoo/. All coordinates are in source pixels (1800 x 1075).
// All text (alt, captions, callout labels) lives in content/*.json under "odoo".
import { asset } from './site';

export const SHOT_W = 1800;
export const SHOT_H = 1075;

export type Crop = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number; side: 'l' | 'r' };
export const FULL: Crop = { x: 0, y: 0, w: SHOT_W, h: SHOT_H };

export const shotSrc = (key: string) => asset(`/odoo/${key}.jpg`);

/** Default visible area per screenshot: trims the empty lower part of sparse screens. */
export const VIEW: Record<string, Crop> = {
  'crm-sales': { x: 0, y: 0, w: SHOT_W, h: 900 },
  'inventory-purchase': { x: 0, y: 0, w: SHOT_W, h: 950 },
  projects: { x: 0, y: 0, w: SHOT_W, h: 640 },
  manufacturing: { x: 0, y: 0, w: SHOT_W, h: 470 },
  sales: { x: 0, y: 0, w: SHOT_W, h: 910 },
};
export const viewOf = (key: string): Crop => VIEW[key] ?? FULL;

/** App slug to hero screenshot. */
export const APP_SHOT: Record<string, string> = {
  accounting: 'accounting',
  'sales-crm': 'crm-sales',
  inventory: 'inventory-purchase',
  purchase: 'sales',
  manufacturing: 'manufacturing',
  'hr-payroll': 'hr',
  'point-of-sale': 'point-of-sale',
  'website-ecommerce': 'ecommerce',
  'project-timesheets': 'projects',
};

/** Zoomed detail per app: the screenshot, the visible crop, and one anchor point per callout label (same order as the JSON). */
export const DETAIL: Record<string, { shot: string; crop: Crop; points: Point[] }> = {
  accounting: { shot: 'accounting', crop: { x: 600, y: 600, w: 540, h: 440 }, points: [{ x: 848, y: 671, side: 'r' }, { x: 766, y: 908, side: 'l' }, { x: 818, y: 997, side: 'l' }] },
  'sales-crm': { shot: 'crm-sales', crop: { x: 880, y: 150, w: 840, h: 580 }, points: [{ x: 1100, y: 182, side: 'r' }, { x: 1000, y: 365, side: 'r' }, { x: 1235, y: 708, side: 'r' }] },
  inventory: { shot: 'inventory-purchase', crop: { x: 905, y: 145, w: 890, h: 395 }, points: [{ x: 1060, y: 227, side: 'r' }, { x: 1040, y: 455, side: 'r' }, { x: 1715, y: 425, side: 'l' }] },
  purchase: { shot: 'sales', crop: { x: 860, y: 135, w: 930, h: 420 }, points: [{ x: 1628, y: 207, side: 'r' }, { x: 1478, y: 157, side: 'l' }, { x: 970, y: 464, side: 'r' }] },
  manufacturing: { shot: 'manufacturing', crop: { x: 700, y: 135, w: 1060, h: 290 }, points: [{ x: 1506, y: 205, side: 'r' }, { x: 935, y: 259, side: 'l' }, { x: 1502, y: 360, side: 'r' }] },
  'hr-payroll': { shot: 'hr', crop: { x: 790, y: 148, w: 995, h: 435 }, points: [{ x: 1428, y: 330, side: 'r' }, { x: 1642, y: 228, side: 'r' }, { x: 1614, y: 282, side: 'r' }] },
  'point-of-sale': { shot: 'point-of-sale', crop: { x: 0, y: 95, w: 1200, h: 600 }, points: [{ x: 140, y: 190, side: 'r' }, { x: 415, y: 598, side: 'l' }, { x: 1102, y: 140, side: 'r' }] },
  'website-ecommerce': { shot: 'ecommerce', crop: { x: 380, y: 100, w: 1340, h: 800 }, points: [{ x: 578, y: 120, side: 'r' }, { x: 560, y: 273, side: 'r' }, { x: 500, y: 845, side: 'r' }] },
  'project-timesheets': { shot: 'projects', crop: { x: 0, y: 135, w: 1130, h: 480 }, points: [{ x: 897, y: 200, side: 'r' }, { x: 762, y: 396, side: 'r' }, { x: 760, y: 457, side: 'r' }] },
};

/** Tabs of the home viewer: screenshot key plus the app page it links to (null = apps index). */
export const HOME_TABS: { shot: string; app: string | null }[] = [
  { shot: 'accounting', app: 'accounting' },
  { shot: 'crm-sales', app: 'sales-crm' },
  { shot: 'hr', app: 'hr-payroll' },
  { shot: 'business-intelligence', app: null },
  { shot: 'point-of-sale', app: 'point-of-sale' },
  { shot: 'ecommerce', app: 'website-ecommerce' },
  { shot: 'inventory-purchase', app: 'inventory' },
];
