import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Loader2, CheckCircle2, AlertTriangle, Sparkles, RefreshCw, ClipboardList,
  TrendingUp, Flame, BookOpen, ChevronDown, ChevronUp, Target, ThumbsUp, AlertCircle,
} from 'lucide-react';
import { UserProfile, TeacherProductivityEntry, ProductivityPeriodReport, PeriodStatus, ProductivityContext } from '../../types';
import { useData } from '../../contexts/DataContext';
import { db } from '../../firebase';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  deriveTeacherPeriods, saveDailyEntry, requestDailyReview, productivityDocId,
  todayKey, weekdayName, scoreColor, scoreBand,
} from '../../services/productivityService';

const STATUS_OPTIONS: { value: PeriodStatus; label: string; color: string }[] = [
  { value: 'conducted', label: 'Conducted', color: 'var(--leaf)' },
  { value: 'partial', label: 'Partial', color: '#f59e0b' },
  { value: 'substituted', label: 'Substituted', color: 'var(--sky)' },
  { value: 'missed', label: 'Missed', color: 'var(--coral)' },
  { value: 'free', label: 'Free Period', color: 'var(--ink-4)' },
];

export default function ProductivityTracker({ user }: { user: UserProfile }) {
  const { teacherData, timetables, timetableConfig, classesMap, subjectsMap, loading: globalLoading } = useData();
  const { showToast } = useToast();

  const date = todayKey();
  const weekday = weekdayName(date);
  const docId = productivityDocId(date, user.uid);

  const [entry, setEntry] = useState<TeacherProductivityEntry | null | undefined>(undefined); // undefined = loading
  const [history, setHistory] = useState<TeacherProductivityEntry[]>([]);
  const [periods, setPeriods] = useState<ProductivityPeriodReport[]>([]);
  const [reflection, setReflection] = useState<TeacherProductivityEntry['reflection']>({
    wins: '', challenges: '', tomorrowPlan: '', extraDuties: '', energyLevel: 3, syllabusOnTrack: true,
  });
  const [lessonCtx, setLessonCtx] = useState<{ count: number; topics: string[] }>({ count: 0, topics: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const teacherId = teacherData?.id || user.teacherId || user.uid;

  // Today's entry (live).
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'teacherProductivity', docId),
      (snap) => setEntry(snap.exists() ? ({ id: snap.id, ...snap.data() } as TeacherProductivityEntry) : null),
      () => setEntry(null));
    return () => unsub();
  }, [docId]);

  // History (live) — scoped to this teacher; sorted client-side to avoid an index.
  useEffect(() => {
    const qy = query(collection(db, 'teacherProductivity'), where('teacherUid', '==', user.uid));
    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherProductivityEntry));
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setHistory(rows);
    }, () => { /* ignore */ });
    return () => unsub();
  }, [user.uid]);

  // Today's lesson-diary entries (objective signal).
  useEffect(() => {
    if (!teacherId) return;
    const qy = query(collection(db, 'lessonLogs'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(qy, (snap) => {
      const todays = snap.docs.map(d => d.data() as any).filter(l => l.date === date);
      setLessonCtx({ count: todays.length, topics: todays.map(l => l.topic).filter(Boolean).slice(0, 8) });
    }, () => { /* ignore */ });
    return () => unsub();
  }, [teacherId, date]);

  // Period skeleton derived from the timetable.
  const derivedPeriods = useMemo(
    () => teacherId ? deriveTeacherPeriods(teacherId, timetables, timetableConfig, classesMap, subjectsMap, weekday) : [],
    [teacherId, timetables, timetableConfig, classesMap, subjectsMap, weekday],
  );

  // Seed the editable rows from the skeleton, but preserve any edits already made
  // if the timetable data refreshes mid-edit (DataContext loads classes lazily).
  useEffect(() => {
    if (entry !== null) return; // only the blank form is editable
    setPeriods(prev => {
      const byKey = new Map(prev.map(p => [`${p.slotId}_${p.classId}`, p]));
      return derivedPeriods.map(d => {
        const ex = byKey.get(`${d.slotId}_${d.classId}`);
        return ex ? { ...d, status: ex.status, topicCovered: ex.topicCovered, homeworkGiven: ex.homeworkGiven, notes: ex.notes } : d;
      });
    });
  }, [derivedPeriods, entry]);

  const updatePeriod = (i: number, patch: Partial<ProductivityPeriodReport>) =>
    setPeriods(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));

  const buildContext = (): ProductivityContext => ({
    weekday,
    scheduledPeriodCount: periods.length,
    lessonLogsCount: lessonCtx.count,
    lessonTopics: lessonCtx.topics,
    homeworkAssignedCount: periods.filter(p => p.homeworkGiven).length,
  });

  const handleSubmit = async () => {
    if (!teacherId) return;
    setSubmitting(true); setError(null);
    const context = buildContext();
    const teacherName = user.name || teacherData?.name || 'Teacher';
    const entryDoc: TeacherProductivityEntry = {
      id: docId, date, teacherUid: user.uid, teacherId, teacherName,
      periods, reflection, context, status: 'submitted', submittedAt: new Date().toISOString(),
    };
    try {
      await saveDailyEntry(entryDoc);
      await requestDailyReview({ date, teacherUid: user.uid, teacherId, teacherName, periods, reflection, context });
      try { logActivity(user, 'Daily Log Submitted', 'Teachers', `${teacherName} submitted their daily productivity log`); } catch { /* non-fatal */ }
      showToast('Your day has been logged', 'success');
    } catch (e: any) {
      setError(e?.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryReview = async () => {
    if (!entry) return;
    setSubmitting(true); setError(null);
    try {
      await requestDailyReview({
        date: entry.date, teacherUid: entry.teacherUid, teacherId: entry.teacherId,
        teacherName: entry.teacherName, periods: entry.periods, reflection: entry.reflection, context: entry.context,
      });
      showToast('Review ready', 'success');
    } catch (e: any) {
      setError(e?.message || 'Could not generate your review yet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Insights ──
  const reviewed = useMemo(() => history.filter(h => h.review), [history]);
  const avgScore = reviewed.length
    ? Math.round(reviewed.reduce((s, h) => s + (h.review!.score || 0), 0) / reviewed.length) : 0;
  const trend = useMemo(() =>
    [...reviewed].sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(h => ({
      name: new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      score: h.review!.score,
    })), [reviewed]);
  const streak = useMemo(() => {
    // consecutive days up to today with a submitted log
    const set = new Set(history.map(h => h.date));
    let n = 0; const d = new Date();
    while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [history]);

  if (globalLoading && !teacherData) return <Spinner />;

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{weekday} · {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</div>
          <h1>Daily Productivity</h1>
        </div>
      </div>

      {/* Insight strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card stack" style={{ gap: 2 }}>
          <span className="eyebrow">Avg Score</span>
          <span className="t-num" style={{ fontSize: 22, color: scoreColor(avgScore) }}>{reviewed.length ? avgScore : '—'}</span>
          <span className="tiny muted">{reviewed.length} day{reviewed.length === 1 ? '' : 's'}</span>
        </div>
        <div className="card stack" style={{ gap: 2 }}>
          <span className="eyebrow">Streak</span>
          <span className="t-num" style={{ fontSize: 22, display: 'flex', alignItems: 'center', gap: 4 }}>
            {streak}<Flame size={16} style={{ color: streak ? 'var(--coral)' : 'var(--ink-4)' }} />
          </span>
          <span className="tiny muted">day{streak === 1 ? '' : 's'} logged</span>
        </div>
        <div className="card stack" style={{ gap: 2 }}>
          <span className="eyebrow">Lessons Today</span>
          <span className="t-num" style={{ fontSize: 22 }}>{lessonCtx.count}</span>
          <span className="tiny muted">diary entries</span>
        </div>
      </div>

      {/* Trend */}
      {trend.length >= 2 && (
        <div className="card stack hidden lg:block">
          <div className="eyebrow">Productivity Trend</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                <Line type="monotone" dataKey="score" stroke="var(--ink)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Main: review / pending / form ── */}
      {entry === undefined ? (
        <Spinner />
      ) : entry?.review ? (
        <ReviewView entry={entry} showReport={showReport} setShowReport={setShowReport} />
      ) : entry ? (
        <PendingView submitting={submitting} error={error} onRetry={handleRetryReview} />
      ) : (
        <FormView
          periods={periods} updatePeriod={updatePeriod}
          reflection={reflection} setReflection={setReflection}
          submitting={submitting} error={error} onSubmit={handleSubmit}
          lessonCount={lessonCtx.count}
        />
      )}

      {/* Recent reviews */}
      {reviewed.length > 0 && (
        <div className="stack">
          <div className="section-head"><h2>Recent Days</h2></div>
          <div className="stack" style={{ gap: 8 }}>
            {reviewed.filter(h => h.date !== date).slice(0, 7).map(h => (
              <div key={h.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ScoreChip score={h.review!.score} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.review!.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function FormView({ periods, updatePeriod, reflection, setReflection, submitting, error, onSubmit, lessonCount }: {
  periods: ProductivityPeriodReport[];
  updatePeriod: (i: number, patch: Partial<ProductivityPeriodReport>) => void;
  reflection: TeacherProductivityEntry['reflection'];
  setReflection: (r: TeacherProductivityEntry['reflection']) => void;
  submitting: boolean; error: string | null; onSubmit: () => void; lessonCount: number;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)',
    background: 'var(--paper)', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit',
  };
  const set = (k: keyof TeacherProductivityEntry['reflection'], v: any) => setReflection({ ...reflection, [k]: v });

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="card" style={{ background: 'var(--ink)', color: 'var(--cream)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <ClipboardList size={22} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Log your teaching day</div>
          <div className="tiny" style={{ opacity: 0.7 }}>
            {periods.length} period{periods.length === 1 ? '' : 's'} scheduled · {lessonCount} diary entr{lessonCount === 1 ? 'y' : 'ies'} logged today
          </div>
        </div>
      </div>

      {/* Periods */}
      <div className="stack" style={{ gap: 10 }}>
        <div className="eyebrow">Your Periods</div>
        {periods.length === 0 && (
          <div className="card tiny muted">No periods on your timetable today. You can still log any extra duties below.</div>
        )}
        {periods.map((p, i) => (
          <div key={`${p.slotId}-${p.classId}-${i}`} className="card stack" style={{ gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {p.className} · {p.subjectName}
              </div>
              <div className="mono tiny muted">{p.startTime || p.slotLabel || ''}{p.endTime ? `–${p.endTime}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => updatePeriod(i, { status: opt.value })}
                  className="chip" style={p.status === opt.value
                    ? { background: opt.color, color: '#fff', borderColor: 'transparent' }
                    : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
            {(p.status === 'conducted' || p.status === 'partial' || p.status === 'substituted') && (
              <>
                <input style={inputStyle} placeholder="Topic / chapter covered"
                  value={p.topicCovered || ''} onChange={e => updatePeriod(i, { topicCovered: e.target.value })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!p.homeworkGiven} onChange={e => updatePeriod(i, { homeworkGiven: e.target.checked })} />
                  Homework assigned this period
                </label>
              </>
            )}
            <input style={inputStyle} placeholder="Notes (optional)"
              value={p.notes || ''} onChange={e => updatePeriod(i, { notes: e.target.value })} />
          </div>
        ))}
      </div>

      {/* Reflection */}
      <div className="card stack" style={{ gap: 12 }}>
        <div className="eyebrow">Daily Reflection</div>
        <Field label="What went well today?"><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={reflection.wins || ''} onChange={e => set('wins', e.target.value)} /></Field>
        <Field label="Any challenges or what could have gone better?"><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={reflection.challenges || ''} onChange={e => set('challenges', e.target.value)} /></Field>
        <Field label="Plan / priority for tomorrow"><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={reflection.tomorrowPlan || ''} onChange={e => set('tomorrowPlan', e.target.value)} /></Field>
        <Field label="Extra duties / contributions (optional)"><input style={inputStyle} value={reflection.extraDuties || ''} onChange={e => set('extraDuties', e.target.value)} /></Field>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="tiny muted" style={{ marginBottom: 4 }}>Energy level</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => set('energyLevel', n)} className="chip"
                  style={(reflection.energyLevel || 0) >= n ? { background: 'var(--ink)', color: 'var(--cream)', borderColor: 'transparent', width: 34, justifyContent: 'center' } : { width: 34, justifyContent: 'center' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 14 }}>
            <input type="checkbox" checked={reflection.syllabusOnTrack !== false} onChange={e => set('syllabusOnTrack', e.target.checked)} />
            Syllabus on track
          </label>
        </div>
      </div>

      {error && <div className="card" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--coral)', fontSize: 13, display: 'flex', gap: 8 }}><AlertTriangle size={16} /> {error}</div>}

      <button className="btn accent" onClick={onSubmit} disabled={submitting}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {submitting ? 'Submitting your day…' : 'Submit Daily Log'}
      </button>
      <p className="tiny muted" style={{ textAlign: 'center', marginTop: -4 }}>
        Once submitted, you'll receive your productivity review and score for the day.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 5 }}>
      <label className="tiny" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Pending (submitted, awaiting review) ─────────────────────────────────────

function PendingView({ submitting, error, onRetry }: { submitting: boolean; error: string | null; onRetry: () => void }) {
  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', gap: 12, padding: '2rem' }}>
      {!error ? (
        <>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
          <div style={{ fontWeight: 700 }}>Preparing your productivity review…</div>
          <div className="tiny muted">Your log has been saved. This only takes a moment.</div>
          <button className="btn ghost" style={{ width: 'auto' }} onClick={onRetry} disabled={submitting}>
            <RefreshCw size={14} /> Refresh
          </button>
        </>
      ) : (
        <>
          <AlertTriangle size={26} style={{ color: 'var(--coral)' }} />
          <div style={{ fontWeight: 700 }}>Your review isn't ready yet</div>
          <div className="tiny muted">{error}</div>
          <button className="btn accent" style={{ width: 'auto' }} onClick={onRetry} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Generate review
          </button>
        </>
      )}
    </div>
  );
}

// ─── Review ───────────────────────────────────────────────────────────────────

function ReviewView({ entry, showReport, setShowReport }: { entry: TeacherProductivityEntry; showReport: boolean; setShowReport: (v: boolean) => void }) {
  const r = entry.review!;
  const color = scoreColor(r.score);
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* Score hero */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <ScoreRing score={r.score} color={color} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} style={{ color }} /> Daily Productivity Review
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color, marginTop: 2 }}>{r.grade || scoreBand(r.score)}</div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>{r.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RemarkCard icon={ThumbsUp} title="What went well" items={r.wentWell} color="var(--leaf)" />
        <RemarkCard icon={Target} title="Where to improve" items={r.improve} color="#f59e0b" />
        {r.concerns.length > 0 && <RemarkCard icon={AlertCircle} title="Points to address" items={r.concerns} color="var(--coral)" />}
        <RemarkCard icon={TrendingUp} title="Focus for tomorrow" items={r.focusTomorrow} color="var(--sky)" />
      </div>

      {/* Submitted report (collapsible) */}
      <div className="card stack" style={{ gap: 10 }}>
        <button onClick={() => setShowReport(!showReport)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BookOpen size={12} /> Your submitted log</span>
          {showReport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showReport && (
          <div className="stack" style={{ gap: 8 }}>
            {entry.periods.length === 0 && <div className="tiny muted">No periods recorded.</div>}
            {entry.periods.map((p, i) => {
              const opt = STATUS_OPTIONS.find(o => o.value === p.status);
              return (
                <div key={i} className="row" style={{ padding: '8px 0', borderColor: 'var(--line-2)' }}>
                  <span className="chip" style={{ padding: '2px 8px', fontSize: 10, background: opt?.color, color: '#fff', borderColor: 'transparent' }}>{opt?.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.className} · {p.subjectName}</div>
                    {p.topicCovered && <div className="tiny muted">{p.topicCovered}{p.homeworkGiven ? ' · HW assigned' : ''}</div>}
                  </div>
                </div>
              );
            })}
            {entry.reflection.wins && <ReflectionLine label="Wins" value={entry.reflection.wins} />}
            {entry.reflection.challenges && <ReflectionLine label="Challenges" value={entry.reflection.challenges} />}
            {entry.reflection.tomorrowPlan && <ReflectionLine label="Tomorrow" value={entry.reflection.tomorrowPlan} />}
          </div>
        )}
      </div>
    </div>
  );
}

function ReflectionLine({ label, value }: { label: string; value: string }) {
  return <div className="tiny"><span className="muted">{label}: </span>{value}</div>;
}

function RemarkCard({ icon: Icon, title, items, color }: { icon: any; title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
        <Icon size={13} /> {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: color, marginTop: 6, flexShrink: 0 }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="t-num" style={{ fontSize: 26, lineHeight: 1, color }}>{score}</span>
        <span className="tiny muted" style={{ fontSize: 9 }}>/ 100</span>
      </div>
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <span className="t-num" style={{ fontSize: 16, color }}>{score}</span>
    </div>
  );
}
