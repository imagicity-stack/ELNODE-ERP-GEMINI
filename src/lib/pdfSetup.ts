/**
 * Registers the jspdf-autotable plugin onto jsPDF.
 *
 * jspdf-autotable v5 only auto-attaches the `doc.autoTable()` method when jsPDF
 * is exposed as a browser global (window.jsPDF). Under ESM/Vite it never is, so
 * the plugin-form call `doc.autoTable(...)` throws "doc.autoTable is not a
 * function". Calling applyPlugin() once patches the shared jsPDF class so every
 * instance gets the method (and `doc.lastAutoTable`).
 *
 * Import this module once at app start (main.tsx) — it's also pulled in by
 * pdfTemplate.ts so any PDF entry point is covered. Module caching makes the
 * registration run exactly once. The functional form `autoTable(doc, ...)`
 * does not need this, but registering is harmless for those call sites.
 */
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

try {
  applyPlugin(jsPDF);
} catch (err) {
  console.error('Failed to register jspdf-autotable plugin', err);
}
