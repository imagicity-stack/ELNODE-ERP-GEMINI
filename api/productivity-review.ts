import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * Daily productivity review generator.
 *
 * Deliberately named neutrally (no "ai" in the path): the teacher-facing portal
 * presents the output as an objective "Daily Productivity Review", and the
 * evaluation instruction lives ONLY on the server (fetched from Firestore with a
 * service account), so a teacher never sees the prompt or how the score is made.
 *
 * Flow: the teacher's client has already created teacherProductivity/{date_uid}
 * with their self-report (status 'submitted'). This endpoint reads the admin
 * prompt, generates the score + remarks, and writes them back onto that doc with
 * the service account (bypassing the `update: false` client rule, so the score is
 * tamper-proof), then returns the review.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Mirrors firebase-applet-config.json's firestoreDatabaseId (inlined to avoid a
// cross-dir JSON import that can break Vercel's bundler at module load).
const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

const DEFAULT_PROMPT = `You are an experienced school academic supervisor reviewing a teacher's self-reported daily work log. Evaluate how productive and effective their teaching day was, fairly and constructively. Reward lessons conducted as scheduled, clear topics covered, homework assigned, lessons logged in the diary, and thoughtful reflection. Penalise missed periods without reason, vague entries, and syllabus slipping behind. Be encouraging but honest.`;

// Appended server-side to GUARANTEE machine-parseable output regardless of the
// admin prompt. The admin can't break the contract.
const OUTPUT_CONTRACT = `

Return ONLY a JSON object (no markdown, no code fences) with EXACTLY this shape:
{
  "score": <integer 0-100>,
  "grade": "<one of: Outstanding, Excellent, Good, Satisfactory, Needs Improvement, Poor>",
  "summary": "<2-3 sentence overview addressed directly to the teacher as 'you'>",
  "wentWell": ["<short point>", ...],
  "improve": ["<short, specific, actionable point>", ...],
  "concerns": ["<issue worth flagging, or empty array>"],
  "focusTomorrow": ["<concrete focus for the next day>", ...]
}
Rules: 2-4 items per array (concerns may be empty). Keep each point under 22 words. Never mention being an AI, a model, or a prompt. Write as a human supervisor would.`;

interface ServiceAccount { project_id: string; client_email: string; private_key: string; }

let _tokenCache: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 120_000) return _tokenCache.token;
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = b64url(signer.sign(sa.private_key));
  const jwt = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`OAuth2 token error: ${data.error || 'unknown'}`);
  _tokenCache = { token: data.access_token, expiresAt: now + 3_000_000 };
  return data.access_token;
}

function toFS(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFS) } };
  if (typeof v === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFS(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFS(fields: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else if ('arrayValue' in v) out[k] = (v.arrayValue?.values || []).map((x: any) => fromFS({ _: x })._);
    else if ('mapValue' in v) out[k] = fromFS(v.mapValue?.fields);
  }
  return out;
}

class FSClient {
  private base: string;
  private auth: string;
  constructor(projectId: string, dbId: string, token: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
    this.auth = `Bearer ${token}`;
  }
  private h() { return { Authorization: this.auth, 'Content-Type': 'application/json' }; }

  async getDoc(col: string, id: string): Promise<{ exists: boolean; data: Record<string, any> }> {
    const r = await fetch(`${this.base}/${col}/${id}`, { headers: this.h() });
    if (r.status === 404) return { exists: false, data: {} };
    if (!r.ok) throw new Error(`Firestore GET ${col}/${id} → ${r.status}`);
    const doc = await r.json();
    return { exists: true, data: fromFS(doc.fields) };
  }

  /** Merge-patch the given top-level fields onto an EXISTING doc. */
  async patchDoc(col: string, id: string, partial: Record<string, any>): Promise<void> {
    const masks = Object.keys(partial).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(partial)) fields[k] = toFS(v);
    const r = await fetch(`${this.base}/${col}/${id}?${masks}&currentDocument.exists=true`, {
      method: 'PATCH',
      headers: this.h(),
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) throw new Error(`Firestore PATCH ${col}/${id} → ${r.status}: ${await r.text()}`);
  }
}

const clampScore = (n: any): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
};
const asArray = (v: any): string[] =>
  Array.isArray(v) ? v.map(x => String(x)).filter(Boolean).slice(0, 6) : [];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server not configured' });

  let step = 'parse-body';
  try {
    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    const { date, teacherUid, teacherName, periods, reflection, context } = body as {
      date?: string; teacherUid?: string; teacherName?: string;
      periods?: any[]; reflection?: any; context?: any;
    };
    if (!date || !teacherUid) return res.status(400).json({ error: 'Missing date or teacherUid' });

    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saRaw) return res.status(500).json({ error: 'Server not configured' });
    const sa: ServiceAccount = JSON.parse(saRaw);
    const dbId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE_ID;

    step = 'auth';
    const token = await getAccessToken(sa);
    const db = new FSClient(sa.project_id, dbId, token);

    // The teacher's self-report must already exist (created client-side under rules).
    step = 'load-entry';
    const docId = `${date}_${teacherUid}`;
    const entry = await db.getDoc('teacherProductivity', docId);
    if (!entry.exists) return res.status(404).json({ error: 'Entry not found' });

    step = 'load-prompt';
    const cfg = await db.getDoc('productivityConfig', 'global');
    const adminPrompt = (cfg.exists && typeof cfg.data.prompt === 'string' && cfg.data.prompt.trim())
      ? cfg.data.prompt.trim()
      : DEFAULT_PROMPT;

    // Build the evaluation input from objective context + the teacher's self-report.
    const periodLines = (periods || []).map((p: any, i: number) =>
      `  ${i + 1}. ${p.startTime || ''}-${p.endTime || ''} | ${p.className || p.classId || '?'} ${p.subjectName || ''} | status: ${p.status}`
      + `${p.topicCovered ? ` | topic: ${p.topicCovered}` : ''}`
      + `${p.homeworkGiven ? ' | homework assigned' : ''}`
      + `${p.notes ? ` | note: ${p.notes}` : ''}`,
    ).join('\n') || '  (no periods scheduled)';

    const userPrompt = `Teacher: ${teacherName || 'Unknown'}
Date: ${date} (${context?.weekday || ''})

SCHEDULE & OBJECTIVE SIGNALS (system-recorded):
- Periods scheduled today: ${context?.scheduledPeriodCount ?? (periods || []).length}
- Lesson-diary entries logged today: ${context?.lessonLogsCount ?? 0}${context?.lessonTopics?.length ? ` (topics: ${context.lessonTopics.join('; ')})` : ''}
- Homework items assigned: ${context?.homeworkAssignedCount ?? 0}

PERIOD-BY-PERIOD SELF REPORT:
${periodLines}

TEACHER'S REFLECTION:
- Wins / what went well: ${reflection?.wins || '(none)'}
- Challenges faced: ${reflection?.challenges || '(none)'}
- Plan for tomorrow: ${reflection?.tomorrowPlan || '(none)'}
- Extra duties / contributions: ${reflection?.extraDuties || '(none)'}
- Self-rated energy (1-5): ${reflection?.energyLevel ?? '(n/a)'}
- Syllabus on track: ${reflection?.syllabusOnTrack === false ? 'No' : reflection?.syllabusOnTrack === true ? 'Yes' : '(n/a)'}

Evaluate this teaching day and produce the review.`;

    step = 'gemini';
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: adminPrompt + OUTPUT_CONTRACT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: 'application/json' },
      }),
    });
    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('[productivity-review] gemini error', geminiRes.status, errText.slice(0, 300));
      return res.status(502).json({ error: 'Review service unavailable' });
    }
    const gData = await geminiRes.json();
    const raw: string = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    step = 'parse-review';
    let parsed: any = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    const review = {
      score: clampScore(parsed.score),
      grade: typeof parsed.grade === 'string' ? parsed.grade.slice(0, 40) : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1000) : 'Your daily review could not be summarised.',
      wentWell: asArray(parsed.wentWell),
      improve: asArray(parsed.improve),
      concerns: asArray(parsed.concerns),
      focusTomorrow: asArray(parsed.focusTomorrow),
      generatedAt: new Date().toISOString(),
    };

    // Persist server-side so the score is authoritative and cannot be self-edited.
    step = 'persist';
    await db.patchDoc('teacherProductivity', docId, {
      review,
      status: 'reviewed',
      reviewedAt: review.generatedAt,
    });

    return res.status(200).json({ review });
  } catch (err: any) {
    console.error('[productivity-review] failed at', step, err?.message || err);
    return res.status(500).json({ error: 'Could not generate review', step });
  }
}
