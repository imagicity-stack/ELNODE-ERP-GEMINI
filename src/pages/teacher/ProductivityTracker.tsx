import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Loader2, CheckCircle2, AlertTriangle, Sparkles, RefreshCw, ClipboardList,
  TrendingUp, Flame, BookOpen, ChevronDown, ChevronUp, Target, ThumbsUp, AlertCircle,
  CalendarDays, ListChecks, X, Send,
} from 'lucide-react';
import {
  UserProfile, TeacherProductivityEntry, ProductivityPeriodReport, PeriodStatus,
  ProductivityContext, AssessmentEntry, ProductivityReview,
} from '../../types';
import { useData } from '../../contexts/DataContext';
import { db } from '../../firebase';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import { buildTeacherContext } from '../../lib/aiContext';
import {
  deriveTeacherPeriods, saveDailyEntry, requestDailyReview, productivityDocId,
  todayKey, weekdayName, scoreColor, scoreBand, ASSESSMENT_DIMENSIONS,
} from '../../services/productivityService';

const STATUS_OPTIONS: { value: PeriodStatus; label: string; color: string }[] = [
  { value: 'conducted', label: 'Conducted', color: 'var(--leaf)' },
  { value: 'partial', label: 'Partial', color: '#f59e0b' },
  { value: 'substituted', label: 'Substituted', color: 'var(--sky)' },
  { value: 'missed', label: 'Missed', color: 'var(--coral)' },
  { value: 'free', label: 'Free', color: 'var(--ink-4)' },
];
const ENGAGEMENT_OPTIONS = [
  { value: 'high', label: 'High', color: 'var(--leaf)' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'low', label: 'Low', color: 'var(--coral)' },
];
const HW_OPTIONS = [
  { value: 'given', label: 'Given', color: 'var(--leaf)' },
  { value: 'not_needed', label: 'Not needed', color: 'var(--ink-4)' },
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
];

// Sentiment colour: first option = positive (green) → last = negative (coral).
function sentimentColor(index: number, total: number): string {
  if (total <= 1) return 'var(--leaf)';
  const t = index / (total - 1);
  if (t <= 0.34) return 'var(--leaf)';
  if (t <= 0.67) return '#f59e0b';
  return 'var(--coral)';
}

interface AssessState { [key: string]: { rating?: string; remark?: string } }

export default function ProductivityTracker({ user }: { user: UserProfile }) {
  const { teacherData, timetables, timetableConfig, classesMap, subjectsMap, loading: globalLoading } = useData();
  const { showToast } = useToast();

  const date = todayKey();
  const weekday = weekdayName(date);
  const docId = productivityDocId(date, user.uid);
  const teacherId = teacherData?.id || user.teacherId || user.uid;

  const [entry, setEntry] = useState<TeacherProductivityEntry | null | undefined>(undefined);
  const [history, setHistory] = useState<TeacherProductivityEntry[]>([]);
  const [periods, setPeriods] = useState<ProductivityPeriodReport[]>([]);
  const [assess, setAssess] = useState<AssessState>({});
  const [reflection, setReflection] = useState<TeacherProductivityEntry['reflection']>({
    highlight: '', couldImprove: '', tomorrowPlan: '', extraDuties: '', energyLevel: 3,
  });
  const [lessonCtx, setLessonCtx] = useState<{ count: number; topics: string[] }>({ count: 0, topics: [] });
  const [portalCtx, setPortalCtx] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // Submission flow: confirm dialog → result modal (loading → done/error).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalPhase, setModalPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [modalReview, setModalReview] = useState<ProductivityReview | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Live: today's entry
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'teacherProductivity', docId),
      (snap) => setEntry(snap.exists() ? ({ id: snap.id, ...snap.data() } as TeacherProductivityEntry) : null),
      () => setEntry(null));
    return () => unsub();
  }, [docId]);

  // Live: this teacher's history (sorted client-side)
  useEffect(() => {
    const qy = query(collection(db, 'teacherProductivity'), where('teacherUid', '==', user.uid));
    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherProductivityEntry));
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setHistory(rows);
    }, () => { /* ignore */ });
    return () => unsub();
  }, [user.uid]);

  // Live: today's lesson-diary entries (objective signal)
  useEffect(() => {
    if (!teacherId) return;
    const qy = query(collection(db, 'lessonLogs'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(qy, (snap) => {
      const todays = snap.docs.map(d => d.data() as any).filter(l => l.date === date);
      setLessonCtx({ count: todays.length, topics: todays.map(l => l.topic).filter(Boolean).slice(0, 8) });
    }, () => { /* ignore */ });
    return () => unsub();
  }, [teacherId, date]);

  // Objective portal signals (attendance marked today, homework on record, upcoming
  // exams, class exam performance) so the review is grounded in real data.
  useEffect(() => {
    if (!teacherData?.id) return;
    let active = true;
    buildTeacherContext(teacherData.id, teacherData.classes || [])
      .then((c: any) => { if (active) setPortalCtx(c?.summary || null); })
      .catch(() => { /* non-fatal */ });
    return () => { active = false; };
  }, [teacherData?.id]);

  const derivedPeriods = useMemo(
    () => teacherId ? deriveTeacherPeriods(teacherId, timetables, timetableConfig, classesMap, subjectsMap, weekday) : [],
    [teacherId, timetables, timetableConfig, classesMap, subjectsMap, weekday],
  );

  // Seed editable rows, preserving in-progress edits if timetable data refreshes.
  useEffect(() => {
    if (entry !== null) return;
    setPeriods(prev => {
      const byKey = new Map(prev.map(p => [`${p.slotId}_${p.classId}`, p]));
      return derivedPeriods.map(d => {
        const ex = byKey.get(`${d.slotId}_${d.classId}`);
        return ex ? { ...d, status: ex.status, engagement: ex.engagement, homeworkStatus: ex.homeworkStatus, topicCovered: ex.topicCovered, notes: ex.notes } : d;
      });
    });
  }, [derivedPeriods, entry]);

  const updatePeriod = (i: number, patch: Partial<ProductivityPeriodReport>) =>
    setPeriods(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const setReflect = (k: keyof TeacherProductivityEntry['reflection'], v: any) => setReflection(r => ({ ...r, [k]: v }));
  const setDim = (key: string, patch: { rating?: string; remark?: string }) =>
    setAssess(a => ({ ...a, [key]: { ...a[key], ...patch } }));

  const buildAssessment = (): AssessmentEntry[] =>
    ASSESSMENT_DIMENSIONS
      .filter(d => assess[d.key]?.rating)
      .map(d => ({ key: d.key, label: d.label, rating: assess[d.key].rating!, remark: (assess[d.key].remark || '').trim() }));

  const buildContext = (): ProductivityContext => {
    const reviewedAsc = history.filter(h => h.review).sort((a, b) => a.date.localeCompare(b.date));
    const recentScores = reviewedAsc.slice(-5).map(h => h.review!.score);
    const prior = reviewedAsc.length ? Math.round(reviewedAsc.reduce((s, h) => s + (h.review!.score || 0), 0) / reviewedAsc.length) : undefined;
    const raw: any = {
      weekday,
      scheduledPeriodCount: periods.length,
      lessonLogsCount: lessonCtx.count,
      lessonTopics: lessonCtx.topics,
      homeworkAssignedCount: periods.filter(p => p.homeworkStatus === 'given').length,
      presentToday: portalCtx?.presentToday,
      absentToday: portalCtx?.absentToday,
      attendanceMarkedToday: portalCtx ? (portalCtx.presentToday + portalCtx.absentToday) : undefined,
      homeworkActive: portalCtx?.homeworkAssigned,
      upcomingExams: portalCtx?.upcomingExams,
      classAvgScore: portalCtx?.avgExamScore ?? undefined,
      classCount: portalCtx?.classCount,
      studentCount: portalCtx?.studentCount,
      recentScores: recentScores.length ? recentScores : undefined,
      priorAverage: prior,
    };
    Object.keys(raw).forEach(k => raw[k] === undefined && delete raw[k]);
    return raw as ProductivityContext;
  };

  // All option dimensions must be rated AND justified; conducted periods need a
  // topic + engagement; missed/partial periods need a reason.
  const validate = (): string | null => {
    for (const d of ASSESSMENT_DIMENSIONS) {
      const a = assess[d.key];
      if (!a?.rating) return `Please rate “${d.label}”.`;
      if (!a.remark || !a.remark.trim()) return `Add a remark for “${d.label}” — say why you chose “${a.rating}”.`;
    }
    for (const p of periods) {
      const conducted = p.status === 'conducted' || p.status === 'partial' || p.status === 'substituted';
      if (conducted) {
        if (!p.topicCovered || !p.topicCovered.trim()) return `Add the topic covered for ${p.className} · ${p.subjectName}.`;
        if (!p.engagement) return `Select engagement for ${p.className} · ${p.subjectName}.`;
      }
      if ((p.status === 'missed' || p.status === 'partial') && (!p.notes || !p.notes.trim())) {
        return `Add a reason for ${p.className} · ${p.subjectName} (why ${p.status}).`;
      }
    }
    return null;
  };

  const onSubmitClick = () => {
    setTriedSubmit(true);
    const err = validate();
    if (err) { setError(err); showToast(err, 'error'); return; }
    setError(null);
    setConfirmOpen(true);
  };

  const assembleSubmission = () => {
    const context = buildContext();
    const assessment = buildAssessment();
    const teacherName = user.name || teacherData?.name || 'Teacher';
    const periodsToSave = periods.map(p => ({ ...p, homeworkGiven: p.homeworkStatus === 'given' }));
    const entryDoc: TeacherProductivityEntry = {
      id: docId, date, teacherUid: user.uid, teacherId, teacherName,
      periods: periodsToSave, assessment, reflection, context,
      status: 'submitted', submittedAt: new Date().toISOString(),
    };
    const payload = { date, teacherUid: user.uid, teacherId, teacherName, periods: periodsToSave, assessment, reflection, context };
    return { entryDoc, payload };
  };

  // Confirm → save the log → generate the review, all surfaced in the result modal.
  const runSubmission = async () => {
    if (!teacherId) return;
    setModalPhase('loading'); setModalError(null); setModalReview(null);
    const { entryDoc, payload } = assembleSubmission();
    try {
      try { await saveDailyEntry(entryDoc); } catch { /* may already exist — proceed to review */ }
      const review = await requestDailyReview(payload);
      setModalReview(review); setModalPhase('done');
      try { logActivity(user, 'Daily Log Submitted', 'Teachers', `${entryDoc.teacherName} logged their day — productivity score ${review.score}/100`); } catch { /* non-fatal */ }
    } catch (e: any) {
      setModalError(e?.message || 'Could not generate your review. Please try again.');
      setModalPhase('error');
    }
  };

  const handleConfirm = () => { setConfirmOpen(false); runSubmission(); };

  // Inline retry — used only if the user closed the modal while the review was pending.
  const handleRetryReview = async () => {
    if (!entry) return;
    setSubmitting(true); setError(null);
    try {
      await requestDailyReview({
        date: entry.date, teacherUid: entry.teacherUid, teacherId: entry.teacherId, teacherName: entry.teacherName,
        periods: entry.periods, assessment: entry.assessment || [], reflection: entry.reflection, context: entry.context,
      });
      showToast('Review ready', 'success');
    } catch (e: any) {
      setError(e?.message || 'Could not generate your review yet. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Insights
  const reviewed = useMemo(() => history.filter(h => h.review), [history]);
  const avgScore = reviewed.length ? Math.round(reviewed.reduce((s, h) => s + (h.review!.score || 0), 0) / reviewed.length) : 0;
  const trend = useMemo(() =>
    [...reviewed].sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(h => ({
      name: new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      score: h.review!.score,
    })), [reviewed]);
  const streak = useMemo(() => {
    const set = new Set(history.map(h => h.date));
    let n = 0; const d = new Date();
    while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [history]);

  const markedPeriods = periods.filter(p => p.status).length;
  const ratedDims = ASSESSMENT_DIMENSIONS.filter(d => assess[d.key]?.rating).length;

  if (globalLoading && !teacherData) return <Spinner />;

  return (
    <div className="pad stack" style={{ gap: 18 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{weekday} · {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</div>
          <h1>Daily Productivity</h1>
        </div>
      </div>

      {/* Insight strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Avg Score" value={reviewed.length ? String(avgScore) : '—'} sub={`${reviewed.length} day${reviewed.length === 1 ? '' : 's'}`} color={scoreColor(avgScore)} />
        <StatTile label="Streak" value={`${streak}`} sub={`day${streak === 1 ? '' : 's'} logged`} icon={<Flame size={15} style={{ color: streak ? 'var(--coral)' : 'var(--ink-4)' }} />} />
        <StatTile label="Lessons Today" value={String(lessonCtx.count)} sub="diary entries" />
      </div>

      {trend.length >= 2 && (
        <div className="card stack hidden lg:block" style={{ gap: 10 }}>
          <div className="eyebrow">Productivity Trend</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
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

      {entry === undefined ? (
        <Spinner />
      ) : entry?.review ? (
        <ReviewView entry={entry} showReport={showReport} setShowReport={setShowReport} />
      ) : entry ? (
        <PendingView submitting={submitting} error={error} onRetry={handleRetryReview} />
      ) : (
        <FormView
          periods={periods} updatePeriod={updatePeriod}
          assess={assess} setDim={setDim}
          reflection={reflection} setReflect={setReflect}
          submitting={modalPhase === 'loading'} error={error} onSubmit={onSubmitClick} triedSubmit={triedSubmit}
          lessonCount={lessonCtx.count} markedPeriods={markedPeriods} ratedDims={ratedDims}
        />
      )}

      {reviewed.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="section-head" style={{ padding: '6px 0 2px' }}><h2>Recent Days</h2></div>
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
      )}
      {confirmOpen && (
        <ConfirmSubmitModal
          periodsMarked={markedPeriods} periodTotal={periods.length} ratedDims={ratedDims}
          onCancel={() => setConfirmOpen(false)} onConfirm={handleConfirm}
        />
      )}
      {modalPhase !== 'idle' && (
        <ResultModal
          phase={modalPhase} review={modalReview} error={modalError}
          dateLabel={`${weekday}, ${new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
          onClose={() => setModalPhase('idle')}
          onRetry={runSubmission}
        />
      )}
    </div>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="eyebrow" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className="t-num" style={{ fontSize: 22, color: color || 'var(--ink)', display: 'flex', alignItems: 'center', gap: 5 }}>{value}{icon}</span>
      <span className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
    </div>
  );
}

function OptionChips({ options, value, onChange, colorFor }: {
  options: { value: string; label: string; color?: string }[];
  value?: string; onChange: (v: string) => void; colorFor?: (v: string, i: number) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {options.map((o, i) => {
        const active = value === o.value;
        const color = o.color || colorFor?.(o.value, i) || 'var(--ink)';
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className="chip"
            style={active
              ? { background: color, color: '#fff', borderColor: 'transparent', fontWeight: 600 }
              : { background: 'var(--paper)' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LineInput({ value, onChange, placeholder, invalid }: { value?: string; onChange: (v: string) => void; placeholder: string; invalid?: boolean }) {
  return (
    <input
      value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: `1px solid ${invalid ? 'var(--coral)' : 'var(--line)'}`, background: invalid ? 'rgba(239,68,68,0.05)' : 'var(--cream)', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit' }}
    />
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <div className="tiny" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{children}{required && <span style={{ color: 'var(--coral)' }}> *</span>}</div>;
}

function MissingHint({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return <span className="tiny" style={{ color: 'var(--coral)' }}>{text}</span>;
}

function SectionTitle({ icon: Icon, title, meta }: { icon: any; title: string; meta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={15} style={{ color: 'var(--ink)' }} />
        </div>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{title}</span>
      </div>
      {meta && <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{meta}</span>}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function FormView({ periods, updatePeriod, assess, setDim, reflection, setReflect, submitting, error, onSubmit, triedSubmit, lessonCount, markedPeriods, ratedDims }: {
  periods: ProductivityPeriodReport[];
  updatePeriod: (i: number, patch: Partial<ProductivityPeriodReport>) => void;
  assess: AssessState;
  setDim: (key: string, patch: { rating?: string; remark?: string }) => void;
  reflection: TeacherProductivityEntry['reflection'];
  setReflect: (k: keyof TeacherProductivityEntry['reflection'], v: any) => void;
  submitting: boolean; error: string | null; onSubmit: () => void; triedSubmit: boolean;
  lessonCount: number; markedPeriods: number; ratedDims: number;
}) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Hero */}
      <div className="card" style={{ background: 'var(--ink)', color: 'var(--cream)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <ClipboardList size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Log your teaching day</div>
          <div className="tiny" style={{ opacity: 0.75 }}>
            {periods.length} period{periods.length === 1 ? '' : 's'} · {lessonCount} diary entr{lessonCount === 1 ? 'y' : 'ies'} · pick an option and say why for each item
          </div>
        </div>
      </div>

      {/* Periods */}
      <div className="card stack" style={{ gap: 14 }}>
        <SectionTitle icon={CalendarDays} title="Period-by-period" meta={periods.length ? `${markedPeriods}/${periods.length} marked` : undefined} />
        {periods.length === 0 && (
          <div className="tiny muted" style={{ padding: '8px 0' }}>No periods on your timetable today — you can still complete the day assessment and reflection below.</div>
        )}
        {periods.map((p, i) => {
          const conducted = p.status === 'conducted' || p.status === 'partial' || p.status === 'substituted';
          const needReason = p.status === 'missed' || p.status === 'partial';
          const topicBad = triedSubmit && conducted && !(p.topicCovered || '').trim();
          const engBad = triedSubmit && conducted && !p.engagement;
          const reasonBad = triedSubmit && needReason && !(p.notes || '').trim();
          return (
            <div key={`${p.slotId}-${p.classId}-${i}`} className="stack" style={{ gap: 10, padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--cream)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{p.className}</div>
                  <div className="tiny muted">{p.subjectName}</div>
                </div>
                <div className="mono tiny muted" style={{ flexShrink: 0, textAlign: 'right' }}>
                  {p.startTime || p.slotLabel || ''}{p.endTime ? ` – ${p.endTime}` : ''}
                </div>
              </div>

              <div className="stack" style={{ gap: 5 }}>
                <FieldLabel>Status</FieldLabel>
                <OptionChips options={STATUS_OPTIONS} value={p.status} onChange={v => updatePeriod(i, { status: v as PeriodStatus })} />
              </div>

              {conducted && (
                <>
                  <div className="stack" style={{ gap: 5 }}>
                    <FieldLabel required>Topic / chapter covered</FieldLabel>
                    <LineInput value={p.topicCovered} onChange={v => updatePeriod(i, { topicCovered: v })} placeholder="e.g. Photosynthesis — light reaction" invalid={topicBad} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div className="stack" style={{ gap: 5 }}>
                      <FieldLabel required>Engagement</FieldLabel>
                      <OptionChips options={ENGAGEMENT_OPTIONS} value={p.engagement} onChange={v => updatePeriod(i, { engagement: v as any })} />
                      <MissingHint show={engBad} text="Select one" />
                    </div>
                    <div className="stack" style={{ gap: 5 }}>
                      <FieldLabel>Homework</FieldLabel>
                      <OptionChips options={HW_OPTIONS} value={p.homeworkStatus} onChange={v => updatePeriod(i, { homeworkStatus: v as any })} />
                    </div>
                  </div>
                </>
              )}

              <div className="stack" style={{ gap: 5 }}>
                <FieldLabel required={needReason}>{needReason ? 'Reason' : 'Remark'} {!needReason && <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>}</FieldLabel>
                <LineInput value={p.notes} onChange={v => updatePeriod(i, { notes: v })} invalid={reasonBad}
                  placeholder={needReason ? `Why was this period ${p.status}? (required)` : 'Anything notable about this period'} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Day assessment */}
      <div className="card stack" style={{ gap: 14 }}>
        <SectionTitle icon={ListChecks} title="Day assessment" meta={`${ratedDims}/${ASSESSMENT_DIMENSIONS.length} rated`} />
        <div className="tiny muted" style={{ marginTop: -6 }}>Rate each item and add a one-line reason for your choice — all are required.</div>
        {ASSESSMENT_DIMENSIONS.map(dim => {
          const rating = assess[dim.key]?.rating;
          const remark = assess[dim.key]?.remark;
          const ratingBad = triedSubmit && !rating;
          const remarkBad = triedSubmit && !(remark || '').trim();
          return (
            <div key={dim.key} className="stack" style={{ gap: 7, paddingBottom: 12, borderBottom: '1px solid var(--line-2)' }}>
              <FieldLabel required>{dim.label}</FieldLabel>
              <OptionChips
                options={dim.options.map(o => ({ value: o, label: o }))}
                value={rating}
                onChange={v => setDim(dim.key, { rating: v })}
                colorFor={(_v, i) => sentimentColor(i, dim.options.length)}
              />
              <MissingHint show={ratingBad} text="Please select an option" />
              <LineInput value={remark} onChange={v => setDim(dim.key, { remark: v })} invalid={remarkBad}
                placeholder={rating ? `Why “${rating}”? (required)` : 'Reason for your rating (required)'} />
            </div>
          );
        })}
      </div>

      {/* Reflection */}
      <div className="card stack" style={{ gap: 14 }}>
        <SectionTitle icon={Sparkles} title="Reflection" />
        <div className="stack" style={{ gap: 5 }}><FieldLabel>Highlight of the day</FieldLabel><LineInput value={reflection.highlight} onChange={v => setReflect('highlight', v)} placeholder="One thing that went really well" /></div>
        <div className="stack" style={{ gap: 5 }}><FieldLabel>What could have been done better</FieldLabel><LineInput value={reflection.couldImprove} onChange={v => setReflect('couldImprove', v)} placeholder="Be honest — this guides your feedback" /></div>
        <div className="stack" style={{ gap: 5 }}><FieldLabel>Plan / priority for tomorrow</FieldLabel><LineInput value={reflection.tomorrowPlan} onChange={v => setReflect('tomorrowPlan', v)} placeholder="What you'll focus on next" /></div>
        <div className="stack" style={{ gap: 5 }}><FieldLabel>Extra duties / contributions <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></FieldLabel><LineInput value={reflection.extraDuties} onChange={v => setReflect('extraDuties', v)} placeholder="Substitution, event, meeting, mentoring…" /></div>
        <div className="stack" style={{ gap: 5 }}>
          <FieldLabel>Energy level</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setReflect('energyLevel', n)} className="chip"
                style={(reflection.energyLevel || 0) >= n
                  ? { background: 'var(--ink)', color: 'var(--cream)', borderColor: 'transparent', width: 38, justifyContent: 'center' }
                  : { width: 38, justifyContent: 'center', background: 'var(--paper)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--coral)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <button className="btn accent" onClick={onSubmit} disabled={submitting}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {submitting ? 'Submitting your day…' : 'Submit Daily Log'}
      </button>
      <p className="tiny muted" style={{ textAlign: 'center', marginTop: -6 }}>
        You'll get your productivity score and review for the day right after submitting.
      </p>
    </div>
  );
}

// ─── Pending ──────────────────────────────────────────────────────────────────

function PendingView({ submitting, error, onRetry }: { submitting: boolean; error: string | null; onRetry: () => void }) {
  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', gap: 12, padding: '2rem' }}>
      {!error ? (
        <>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
          <div style={{ fontWeight: 700 }}>Preparing your productivity review…</div>
          <div className="tiny muted">Your log has been saved. This only takes a moment.</div>
          <button className="btn ghost" style={{ width: 'auto' }} onClick={onRetry} disabled={submitting}><RefreshCw size={14} /> Refresh</button>
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

// The score hero + remark cards — shared by the inline view and the result modal.
function ReviewReport({ review }: { review: ProductivityReview }) {
  const color = scoreColor(review.score);
  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <ScoreRing score={review.score} color={color} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} style={{ color }} /> Daily Productivity Review
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color, marginTop: 2 }}>{review.grade || scoreBand(review.score)}</div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>{review.summary}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RemarkCard icon={ThumbsUp} title="What went well" items={review.wentWell} color="var(--leaf)" />
        <RemarkCard icon={Target} title="Where to improve" items={review.improve} color="#f59e0b" />
        {review.concerns?.length > 0 && <RemarkCard icon={AlertCircle} title="Points to address" items={review.concerns} color="var(--coral)" />}
        <RemarkCard icon={TrendingUp} title="Focus for tomorrow" items={review.focusTomorrow} color="var(--sky)" />
      </div>
    </>
  );
}

function ReviewView({ entry, showReport, setShowReport }: { entry: TeacherProductivityEntry; showReport: boolean; setShowReport: (v: boolean) => void }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <ReviewReport review={entry.review!} />
      <div className="card stack" style={{ gap: 10 }}>
        <button onClick={() => setShowReport(!showReport)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BookOpen size={12} /> Your submitted log</span>
          {showReport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showReport && <SubmittedLog entry={entry} />}
      </div>
    </div>
  );
}

// ─── Submission modals ────────────────────────────────────────────────────────

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, background: 'rgba(14,15,17,0.55)', backdropFilter: 'blur(2px)',
};

function ConfirmSubmitModal({ periodsMarked, periodTotal, ratedDims, onCancel, onConfirm }: {
  periodsMarked: number; periodTotal: number; ratedDims: number; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div className="eh-app card stack" style={{ width: '100%', maxWidth: 420, gap: 14 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Send size={18} style={{ color: 'var(--ink)' }} />
          </div>
          <div>
            <h2 className="display" style={{ fontSize: 18 }}>Submit today's log?</h2>
            <p className="tiny muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
              You'll get your productivity review for the day right after. Today's entry can't be edited once submitted.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip" style={{ cursor: 'default', background: 'var(--cream-2)' }}>{periodsMarked}/{periodTotal} periods marked</span>
          <span className="chip" style={{ cursor: 'default', background: 'var(--cream-2)' }}>{ratedDims}/{ASSESSMENT_DIMENSIONS.length} dimensions rated</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn accent" style={{ flex: 1 }} onClick={onConfirm}>Submit &amp; review</button>
        </div>
      </div>
    </div>
  );
}

function ResultModal({ phase, review, error, dateLabel, onClose, onRetry }: {
  phase: 'loading' | 'done' | 'error' | 'idle';
  review: ProductivityReview | null; error: string | null; dateLabel: string;
  onClose: () => void; onRetry: () => void;
}) {
  const canClose = phase !== 'loading';
  return (
    <div style={OVERLAY} onClick={() => canClose && onClose()}>
      <div className="eh-app card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
        {phase === 'loading' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 14, padding: '2.25rem 0.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: '5px solid var(--line)', borderTopColor: 'var(--ink)' }} className="animate-spin" />
            <div style={{ fontWeight: 800, fontSize: 17 }}>Tracking your productivity…</div>
            <div className="tiny muted animate-pulse">Reviewing your periods, lessons and reflection</div>
          </div>
        )}
        {phase === 'error' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 12, padding: '1.75rem 0.5rem' }}>
            <AlertTriangle size={28} style={{ color: 'var(--coral)' }} />
            <div style={{ fontWeight: 700 }}>We couldn't finish your review</div>
            <div className="tiny muted">{error}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn ghost" style={{ width: 'auto' }} onClick={onClose}>Close</button>
              <button className="btn accent" style={{ width: 'auto' }} onClick={onRetry}><RefreshCw size={14} /> Try again</button>
            </div>
          </div>
        )}
        {phase === 'done' && review && (
          <div className="stack" style={{ gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div className="eyebrow">{dateLabel}</div>
                <h2 className="display" style={{ fontSize: 20 }}>Your Daily Review</h2>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
            </div>
            <ReviewReport review={review} />
            <button className="btn accent" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SubmittedLog({ entry }: { entry: TeacherProductivityEntry }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {entry.periods.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {entry.periods.map((p, i) => {
            const opt = STATUS_OPTIONS.find(o => o.value === p.status);
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="chip" style={{ padding: '2px 8px', fontSize: 10, background: opt?.color, color: '#fff', borderColor: 'transparent', flexShrink: 0 }}>{opt?.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.className} · {p.subjectName}</div>
                  {(p.topicCovered || p.engagement || p.homeworkStatus) && (
                    <div className="tiny muted">
                      {p.topicCovered}
                      {p.engagement ? `${p.topicCovered ? ' · ' : ''}engagement: ${p.engagement}` : ''}
                      {p.homeworkStatus ? ` · HW: ${p.homeworkStatus.replace('_', ' ')}` : ''}
                    </div>
                  )}
                  {p.notes && <div className="tiny muted">“{p.notes}”</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entry.assessment?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {entry.assessment.map(a => (
            <span key={a.key} className="chip" style={{ cursor: 'default', background: 'var(--cream-2)' }} title={a.remark || ''}>
              <span className="muted" style={{ fontSize: 11 }}>{a.label}:</span>&nbsp;<b style={{ fontSize: 11 }}>{a.rating}</b>
            </span>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 3 }}>
        {entry.reflection?.highlight && <div className="tiny"><span className="muted">Highlight: </span>{entry.reflection.highlight}</div>}
        {entry.reflection?.couldImprove && <div className="tiny"><span className="muted">Could improve: </span>{entry.reflection.couldImprove}</div>}
        {entry.reflection?.tomorrowPlan && <div className="tiny"><span className="muted">Tomorrow: </span>{entry.reflection.tomorrowPlan}</div>}
        {entry.reflection?.extraDuties && <div className="tiny"><span className="muted">Extra: </span>{entry.reflection.extraDuties}</div>}
        {entry.reflection?.energyLevel ? <div className="tiny"><span className="muted">Energy: </span>{entry.reflection.energyLevel}/5</div> : null}
      </div>
    </div>
  );
}

function RemarkCard({ icon: Icon, title, items, color }: { icon: any; title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color }}><Icon size={13} /> {title}</div>
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
