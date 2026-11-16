// The focus-order audit (task input-gamepad-a11y deliverable 4): for one screen or panel, the controls the keyboard and the
// pad can reach, in the order they are reached, and everything that breaks the rules of GDD 08 8 and 12 -- a control with
// no accessible name, a positive tabindex, a control that is focusable but off screen, a Tab order that jumps backwards
// across the layout. `reachOrderIssues` is pure (rectangles in, findings out); `auditLayer` reads a DOM subtree.
import { focusableIn, FOCUSABLE } from '../components/focus';
import type { Rect } from '../components/logic/spatialNav';

export interface AuditItem { name: string; tag: string; testid: string | null; rect: Rect }

export interface FocusAudit {
  /** Number of controls in the Tab order. */
  count: number;
  items: AuditItem[];
  issues: string[];
  /** The control that has focus (or would get it first), by name. */
  first: string | null;
}

/**
 * Reading-order violations: going to the next control in Tab order must not land clearly ABOVE the previous one
 * unless it starts a new column (further right). Items are `rects` in Tab order; returns "i->j" descriptions.
 */
export function reachOrderIssues(rects: readonly Rect[], names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < rects.length; i++) {
    const a = rects[i - 1], b = rects[i];
    const tol = Math.max(8, Math.min(a.h, b.h) * 0.6);
    const above = b.y + b.h / 2 < a.y + a.h / 2 - tol;
    const newColumn = b.x > a.x + a.w - 1;
    if (above && !newColumn) out.push(`order: "${names[i]}" comes after "${names[i - 1]}" but is above it`);
  }
  return out;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A simplified accessible name: aria-label, aria-labelledby, an associated <label>, own text, title, alt, placeholder. */
export function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => textOf(el.ownerDocument.getElementById(id))).filter(Boolean).join(' ');
    if (t) return t;
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) { const t = Array.from(labels).map(textOf).join(' '); if (t) return t; }
  const own = textOf(el);
  if (own) return own;
  return (el.getAttribute('title') ?? el.getAttribute('alt') ?? el.getAttribute('placeholder') ?? '').trim();
}

/** Inside a scrolling area (below the fold): the browser scrolls a focused control into view, so it is reachable. */
function inScrollArea(el: HTMLElement, root: HTMLElement): boolean {
  for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return true;
  }
  return false;
}

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Audits the controls inside `root` (a layer's root element). */
export function auditLayer(root: HTMLElement): FocusAudit {
  const els = focusableIn(root);
  const items: AuditItem[] = els.map((el) => ({ name: accessibleName(el), tag: el.tagName.toLowerCase() + (el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''), testid: el.getAttribute('data-testid'), rect: rectOf(el) }));
  const issues: string[] = [];
  els.forEach((el, i) => {
    const where = `${items[i].tag}${items[i].testid ? `#${items[i].testid}` : ''} "${items[i].name}"`;
    if (!items[i].name) issues.push(`no accessible name: ${where}`);
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) > 0) issues.push(`positive tabindex: ${where}`);
    const r = items[i].rect;
    if ((r.x + r.w < 0 || r.y + r.h < 0 || r.x > innerWidth || r.y > innerHeight) && !inScrollArea(el, root)) issues.push(`focusable but off screen: ${where}`);
  });
  // controls that carry the tab-stop attributes but cannot be focused (display none is skipped by the browser; aria-hidden is not)
  root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
    if (el.closest('[aria-hidden="true"]') && !el.closest('[inert]')) issues.push(`focusable inside aria-hidden: ${el.tagName.toLowerCase()} "${accessibleName(el)}"`);
  });
  issues.push(...reachOrderIssues(items.map((i) => i.rect), items.map((i) => i.name)));
  const a = document.activeElement as HTMLElement | null;
  const first = a && root.contains(a) ? accessibleName(a) : items[0]?.name ?? null;
  return { count: els.length, items, issues, first };
}
