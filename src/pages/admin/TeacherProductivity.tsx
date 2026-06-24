import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  Gauge, Save, RotateCcw, Loader2, Sparkles, ChevronDown, ChevronUp,
  ThumbsUp, Target, AlertCircle, TrendingUp, Search, Calendar, FileText,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, TeacherProductivityEntry } from '../../types';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { logActivity } from '../../services/activityService';
import {
  getProductivityConfig, saveProductivityConfig, DEFAULT_PRODUCTIVITY_PROMPT,
  scoreColor, scoreBand, todayKey,
} from '../../services/productivityService';
import { cn } from '../../lib/utils';

type Tab = 'reviews' | 'prompt';

export default function TeacherProductivity({ user }: { user: UserProfile }) {
  const [tab, setTab] = useState<Tab>('reviews');
  const isSuperAdmin = user.role === 'super_admin';

  return (
    <div className="pad stack" style={{ gap: 20, maxWidth: 960 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{user.role.replace('_', ' ')} · System</div>
          <h1>Teacher Productivity</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className={cn('chip', tab === 'reviews' ? 'solid' : '')} onClick={() => setTab('reviews')}>
          <Gauge size={13} /> Daily Reviews
        </button>
        {isSuperAdmin && (
          <button className={cn('chip', tab === 'prompt' ? 'solid' : '')} onClick={() => setTab('prompt')}>
            <Sparkles size={13} /> Evaluation Prompt
          </button>
        )}
      </div>

      {tab === 'reviews' ? <ReviewsTab /> : <PromptTab user={user} />}
    </div>
  );
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

function ReviewsTab() {
  const { teachers } = useData();
  const [teacherId, setTeacherId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<TeacherProductivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // Filter by a single teacher (across days) OR by a single date (all teachers).
  useEffect(() => {
    setLoading(true);
    const qy = teacherId
      ? query(collection(db, 'teacherProductivity'), where('teacherId', '==', teacherId))
      : query(collection(db, 'teacherProductivity'), where('date', '==', date));
    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherProductivityEntry));
      list.sort((a, b) => b.date.localeCompare(a.date) || (b.review?.score || 0) - (a.review?.score || 0));
      setRows(list);
      setLoading(false);
    }, (err) => { handleFirestoreError(err, OperationType.LIST, 'teacherProductivity'); setLoading(false); });
    return () => unsub();
  }, [teacherId, date]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => r.teacherName?.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const reviewed = filtered.filter(r => r.review);
  const avg = reviewed.length ? Math.round(reviewed.reduce((s, r) => s + (r.review!.score || 0), 0) / reviewed.length) : 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Filters */}
      <div className="card stack" style={{ gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 4 }}>
            <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> Date</label>
            <input type="date" value={date} disabled={!!teacherId} onChange={e => setDate(e.target.value)}
              style={{ padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line)', background: teacherId ? 'var(--cream-2)' : 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="tiny muted">Teacher</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
              style={{ padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)', minWidth: 180 }}>
              <option value="">All teachers (by date)</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teacher name…"
              style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
          </div>
        </div>
        <div className="tiny muted">
          {teacherId ? 'Showing all logged days for the selected teacher.' : 'Showing all teachers for the selected date.'}
          {reviewed.length > 0 && <> · Avg score <b style={{ color: scoreColor(avg) }}>{avg}</b> across {reviewed.length} review{reviewed.length === 1 ? '' : 's'}.</>}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ height: 100, background: 'var(--cream-2)' }} />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <Gauge size={26} style={{ color: 'var(--ink-4)', marginBottom: 8 }} />
          <div style={{ fontWeight: 700 }}>No logs found</div>
          <div className="tiny muted">No teacher has logged productivity for this {teacherId ? 'teacher yet' : 'date yet'}.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {filtered.map(r => {
            const open = openId === r.id;
            const score = r.review?.score;
            return (
              <div key={r.id} className="card stack" style={{ gap: open ? 12 : 0 }}>
                <button onClick={() => setOpenId(open ? null : r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {typeof score === 'number'
                      ? <span className="t-num" style={{ fontSize: 17, color: scoreColor(score) }}>{score}</span>
                      : <Loader2 size={16} className="animate-spin" style={{ color: 'var(--ink-4)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.teacherName}</div>
                    <div className="tiny muted">
                      {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}{r.context?.scheduledPeriodCount ?? r.periods.length} periods
                      {typeof score === 'number' ? ` · ${r.review!.grade || scoreBand(score)}` : ' · awaiting review'}
                    </div>
                  </div>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {open && (
                  <div className="stack" style={{ gap: 12, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                    {r.review ? (
                      <>
                        <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.review.summary}</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <RemarkList icon={ThumbsUp} title="What went well" items={r.review.wentWell} color="var(--leaf)" />
                          <RemarkList icon={Target} title="Where to improve" items={r.review.improve} color="#f59e0b" />
                          {r.review.concerns?.length > 0 && <RemarkList icon={AlertCircle} title="Points to address" items={r.review.concerns} color="var(--coral)" />}
                          <RemarkList icon={TrendingUp} title="Focus for next day" items={r.review.focusTomorrow} color="var(--sky)" />
                        </div>
                      </>
                    ) : (
                      <div className="tiny muted">This log was submitted but its review hasn't been generated yet.</div>
                    )}

                    {/* Submitted self-report */}
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={11} /> Submitted log</div>
                      {r.periods.map((p, i) => (
                        <div key={i} className="tiny" style={{ display: 'flex', gap: 8 }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 600, minWidth: 78, color: 'var(--ink-2)' }}>{p.status}</span>
                          <span style={{ flex: 1 }}>{p.className} · {p.subjectName}{p.topicCovered ? ` — ${p.topicCovered}` : ''}{p.homeworkGiven ? ' · HW' : ''}</span>
                        </div>
                      ))}
                      {r.reflection?.wins && <div className="tiny"><span className="muted">Wins: </span>{r.reflection.wins}</div>}
                      {r.reflection?.challenges && <div className="tiny"><span className="muted">Challenges: </span>{r.reflection.challenges}</div>}
                      {r.reflection?.tomorrowPlan && <div className="tiny"><span className="muted">Tomorrow: </span>{r.reflection.tomorrowPlan}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RemarkList({ icon: Icon, title, items, color }: { icon: any; title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color }}><Icon size={12} /> {title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
            <span style={{ width: 4, height: 4, borderRadius: 999, background: color, marginTop: 6, flexShrink: 0 }} />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Prompt editor (super admin) ──────────────────────────────────────────────

function PromptTab({ user }: { user: UserProfile }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const { showToast } = useToast();

  useEffect(() => {
    getProductivityConfig()
      .then(cfg => { setPrompt(cfg.prompt || ''); setUpdatedAt(cfg.updatedAt); })
      .catch(() => showToast('Failed to load prompt', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveProductivityConfig(prompt, user.uid);
      setUpdatedAt(new Date().toISOString());
      await logActivity(user, 'Productivity Prompt Updated', 'Super Admin', 'Updated the teacher productivity evaluation prompt');
      showToast('Evaluation prompt saved', 'success');
    } catch {
      showToast('Failed to save prompt', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card" style={{ height: 240, background: 'var(--cream-2)' }} />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--ink)', color: 'var(--cream)' }}>
        <Sparkles size={20} style={{ flexShrink: 0, marginTop: 2 }} />
        <div className="tiny" style={{ opacity: 0.85, lineHeight: 1.5 }}>
          This instruction trains how each teacher's daily log is evaluated and scored out of 100. It is applied automatically
          when a teacher submits their day, and is never shown to teachers. Describe the rubric, tone, what to reward, and what
          to penalise. A strict JSON output format is enforced for you automatically.
        </div>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Evaluation Instruction</div>
          <button className="chip" onClick={() => setPrompt(DEFAULT_PRODUCTIVITY_PROMPT)}>
            <RotateCcw size={12} /> Load recommended
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={DEFAULT_PRODUCTIVITY_PROMPT}
          style={{ width: '100%', minHeight: 320, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="tiny muted">
            {updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString('en-IN')}` : 'Not yet configured — the recommended rubric is used until you save one.'}
          </span>
          <Button onClick={save} loading={saving} icon={Save}>Save Prompt</Button>
        </div>
      </div>
    </div>
  );
}
