/**
 * Teacher daily productivity tracker — client service.
 *
 * The teacher writes their self-report (teacherProductivity/{date_uid}); a server
 * endpoint then generates the score + remarks and writes them back. The portal
 * presents the result as an objective "Daily Productivity Review" — the scoring
 * mechanism is intentionally not surfaced to teachers.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Timetable, TimetableConfig, TimeSlot,
  ProductivityPeriodReport, ProductivityContext, ProductivityReview,
  TeacherProductivityEntry, ProductivityConfig,
} from '../types';

export const PRODUCTIVITY_COLLECTION = 'teacherProductivity';
const CONFIG_REF = () => doc(db, 'productivityConfig', 'global');

/** Default evaluation instruction — seeds the admin editor and is the server fallback. */
export const DEFAULT_PRODUCTIVITY_PROMPT = `You are an experienced school academic supervisor reviewing a teacher's self-reported daily work log. Evaluate how productive and effective their teaching day was, fairly and constructively.

Reward:
- Periods conducted as scheduled (vs missed/partial).
- Clear, specific topics covered in each period.
- Homework assigned where appropriate.
- Lessons logged in the diary matching the periods taught.
- Thoughtful, honest reflection and a concrete plan for tomorrow.
- Syllabus staying on track and extra contributions/duties.

Penalise:
- Missed or partial periods without a valid reason.
- Vague or empty topic/notes entries.
- Syllabus slipping behind, or no homework over long stretches.

Be encouraging but honest. Give a fair score out of 100 and specific, actionable feedback a teacher can act on tomorrow.`;

export const todayKey = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export const weekdayName = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });

export const productivityDocId = (date: string, teacherUid: string): string => `${date}_${teacherUid}`;

/**
 * Derive the teacher's allotted periods for a given weekday from all class
 * timetables, enriched with slot times and class/subject names. Returns the
 * editable period rows the teacher reports against (default status 'conducted').
 */
export function deriveTeacherPeriods(
  teacherId: string,
  timetables: Timetable[],
  config: TimetableConfig | null,
  classesMap: Record<string, string>,
  subjectsMap: Record<string, string>,
  weekday: string,
): ProductivityPeriodReport[] {
  const slotMap: Record<string, TimeSlot> = {};
  const order: Record<string, number> = {};
  (config?.slots || []).forEach((s, i) => { slotMap[s.id] = s; order[s.id] = i; });

  const rows: ProductivityPeriodReport[] = [];
  timetables.forEach(tt => {
    const day = tt.schedule?.find(s => s.day === weekday);
    if (!day) return;
    day.periods
      .filter(p => p.teacherId === teacherId)
      .forEach(p => {
        const slot = slotMap[p.slotId];
        rows.push({
          slotId: p.slotId,
          slotLabel: slot?.label,
          startTime: slot?.startTime,
          endTime: slot?.endTime,
          classId: tt.classId,
          className: classesMap[tt.classId] || tt.classId,
          subjectId: p.subjectId,
          subjectName: subjectsMap[p.subjectId] || p.subjectId,
          status: 'conducted',
          topicCovered: '',
          homeworkGiven: false,
          notes: '',
        });
      });
  });
  rows.sort((a, b) => (order[a.slotId] ?? 99) - (order[b.slotId] ?? 99));
  return rows;
}

/** Persist the teacher's self-report (create only — one entry per day). */
export async function saveDailyEntry(entry: TeacherProductivityEntry): Promise<void> {
  await setDoc(doc(db, PRODUCTIVITY_COLLECTION, entry.id), entry);
}

export interface ReviewRequest {
  date: string;
  teacherUid: string;
  teacherId: string;
  teacherName: string;
  periods: ProductivityPeriodReport[];
  reflection: TeacherProductivityEntry['reflection'];
  context: ProductivityContext;
}

/**
 * Trigger generation of the daily review. The server reads the (hidden)
 * evaluation instruction, scores the day, persists the result back onto the
 * entry doc, and returns it. Safe to retry if it fails — it only patches an
 * existing entry.
 */
export async function requestDailyReview(payload: ReviewRequest): Promise<ProductivityReview> {
  const res = await fetch('/api/productivity-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch { /* ignore */ }
    throw new Error(detail || `Review failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.review) throw new Error('Empty review response');
  return data.review as ProductivityReview;
}

// ─── Super-admin evaluation config ────────────────────────────────────────────

export async function getProductivityConfig(): Promise<ProductivityConfig> {
  const snap = await getDoc(CONFIG_REF());
  if (snap.exists()) return snap.data() as ProductivityConfig;
  return { prompt: '' };
}

export async function saveProductivityConfig(prompt: string, uid: string): Promise<void> {
  await setDoc(CONFIG_REF(), { prompt, updatedAt: new Date().toISOString(), updatedBy: uid }, { merge: true });
}

// ─── Presentation helpers ─────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 85) return 'var(--leaf)';
  if (score >= 70) return 'var(--accent)';
  if (score >= 50) return '#f59e0b';
  return 'var(--coral)';
}

export function scoreBand(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Work';
}
