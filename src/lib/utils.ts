import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert "YYYY-MM" (e.g. "2026-05") to "Month YYYY" (e.g. "May 2026").
 * Returns the input unchanged if format is not YYYY-MM.
 */
export function fmtMonthYear(m?: string): string {
  if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '';
  try {
    return new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch { return m; }
}

function toDateObj(date: string | Date | undefined | null): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  const d = new Date(date.length === 10 ? date + 'T00:00:00' : date);
  return isNaN(d.getTime()) ? null : d;
}

/** "DD/MM/YYYY" — e.g. 16/05/2026 */
export function fmtDate(date: string | Date | undefined | null): string {
  const d = toDateObj(date);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "DD MMM YYYY" — e.g. 16 May 2026 */
export function fmtDateLong(date: string | Date | undefined | null): string {
  const d = toDateObj(date);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "DD MMM" (no year) — e.g. 16 May */
export function fmtDateShort(date: string | Date | undefined | null): string {
  const d = toDateObj(date);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
