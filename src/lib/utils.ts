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
