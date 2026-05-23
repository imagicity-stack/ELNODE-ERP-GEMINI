import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, FeeRequest, Class, BroadcastLog } from '../../types';
import { Modal } from '../../components/ui';
import { useToast } from '../../components/Toast';
import {
  Megaphone, Users, Send, CheckCircle2, XCircle, Filter,
  RefreshCw, Search, X, CheckSquare, Square, MessageSquare,
} from 'lucide-react';
import { cn, fmtMonthYear } from '../../lib/utils';
import { logActivity } from '../../services/activityService';

const PAYMENT_LINK = 'https://ehs.elnode.in/parent/fees';

const TEMPLATES = [
  {
    id: 'fees_due_reminder',
    label: 'Fee Due Reminder',
    description: 'Remind parents of upcoming/pending fee dues',
    statuses: ['pending', 'partially_paid'],
  },
  {
    id: 'fees_overdue_notice',
    label: 'Overdue Fee Notice',
    description: 'Stronger notice for overdue fees',
    statuses: ['pending', 'overdue', 'partially_paid'],
  },
  {
    id: 'general_announcement1',
    label: 'General Announcement',
    description: 'Send a custom announcement to selected parents',
    statuses: [],
  },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];

interface Recipient {
  key: string;
  phone: string;
  parentName: string;
  studentName: string;
  classSection: string;
  amount?: string;
  month?: string;
  dueDate?: string;
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

function resolveParentName(student: Student): string {
  return (
    student.parentDetails?.fatherName?.trim() ||
    student.parentDetails?.motherName?.trim() ||
    'Parent'
  );
}

export default function BroadcastCenter({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [broadcastLogs, setBroadcastLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [template, setTemplate] = useState<TemplateId>('fees_due_reminder');
  const [customMessage, setCustomMessage] = useState('');
  const [mode, setMode] = useState<'bulk' | 'individual'>('bulk');
  const [composeOpen, setComposeOpen] = useState(false);

  // Advanced bulk filters
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [sectionFilter, setSectionFilter] = useState<string[]>([]);
  const [genderFilter, setGenderFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Per-row selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Individual send
  const [individualPhone, setIndividualPhone] = useState('');
  const [individualParent, setIndividualParent] = useState('');
  const [studentQuery, setStudentQuery] = useState('');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [stuSnap, reqSnap, clsSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeRequests')),
          getDocs(collection(db, 'classes')),
        ]);
        setStudents(stuSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
        setClasses(clsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
      } catch (err) {
        console.error('BroadcastCenter: failed to load main data', err);
        showToast('Failed to load student/fee data', 'error');
      } finally {
        setLoading(false);
      }

      try {
        const logSnap = await getDocs(
          query(collection(db, 'broadcastLogs'), orderBy('sentAt', 'desc'), limit(20)),
        );
        setBroadcastLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastLog)));
      } catch (err) {
        console.warn('BroadcastCenter: could not load broadcast history', err);
      }
    })();
  }, []);

  const selectedTemplate = TEMPLATES.find(t => t.id === template)!;
  const classNameMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.name])),
    [classes],
  );
  const studentMap = useMemo(
    () => Object.fromEntries(students.map(s => [s.id, s])),
    [students],
  );

  const availableSections = useMemo(() => {
    const pool = classFilter.length > 0 ? classes.filter(c => classFilter.includes(c.id)) : classes;
    const set = new Set<string>();
    pool.forEach(c => (c.sections || []).forEach(s => s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [classes, classFilter]);

  const toggleArr = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const clearFilters = () => {
    setClassFilter([]);
    setSectionFilter([]);
    setGenderFilter([]);
    setSearch('');
  };
  const activeFilterCount =
    classFilter.length + sectionFilter.length + genderFilter.length + (search.trim() ? 1 : 0);

  const recipients: Recipient[] = useMemo(() => {
    const term = search.trim().toLowerCase();

    const passesFilters = (s: Student) => {
      if (classFilter.length > 0 && !classFilter.includes(s.classId)) return false;
      if (sectionFilter.length > 0 && !sectionFilter.includes(s.section)) return false;
      if (genderFilter.length > 0 && !genderFilter.includes(s.gender || '')) return false;
      if (!s.parentDetails?.phone) return false;
      return true;
    };

    if (template === 'general_announcement1') {
      return students
        .filter(s => passesFilters(s))
        .filter(s => {
          if (!term) return true;
          const pn = resolveParentName(s);
          return `${pn} ${s.name} ${s.parentDetails?.phone || ''}`.toLowerCase().includes(term);
        })
        .map(s => ({
          key: s.id,
          phone: s.parentDetails!.phone,
          parentName: resolveParentName(s),
          studentName: s.name,
          classSection: `${classNameMap[s.classId] || s.classId} ${s.section}`.trim(),
        }));
    }

    return requests
      .filter(r => (selectedTemplate.statuses as readonly string[]).includes(r.status))
      .flatMap(r => {
        const student = studentMap[r.studentId];
        if (!passesFilters(student)) return [];
        const parentName = resolveParentName(student);
        if (term && !`${parentName} ${student.name} ${student.parentDetails?.phone || ''}`.toLowerCase().includes(term)) return [];
        return [{
          key: r.id,
          phone: student.parentDetails!.phone,
          parentName,
          studentName: student.name,
          classSection: `${classNameMap[student.classId] || student.classId} ${student.section}`.trim(),
          amount: `Rs. ${((r.totalAmount || 0) - (r.paidAmount || 0)).toLocaleString('en-IN')}`,
          month: fmtMonthYear(r.month),
          dueDate: r.dueDate || '',
        }];
      });
  }, [students, requests, template, classFilter, sectionFilter, genderFilter, search, classNameMap, studentMap]);

  const recipientKey = recipients.map(r => r.key).join('|');
  useEffect(() => {
    setSelectedKeys(new Set(recipients.map(r => r.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientKey]);

  const sendList = useMemo(
    () => recipients.filter(r => selectedKeys.has(r.key)),
    [recipients, selectedKeys],
  );

  const toggleSelect = (key: string) =>
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const allSelected = recipients.length > 0 && sendList.length === recipients.length;
  const selectAll = () => setSelectedKeys(new Set(recipients.map(r => r.key)));
  const clearAll = () => setSelectedKeys(new Set());

  const studentSuggestions = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(s => s.parentDetails?.phone)
      .filter(s => {
        const pn = resolveParentName(s);
        return `${s.name} ${pn} ${s.parentDetails?.phone || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [students, studentQuery]);

  const selectStudent = (s: Student) => {
    setIndividualPhone(s.parentDetails?.phone || '');
    setIndividualParent(resolveParentName(s));
    setStudentQuery('');
  };

  const buildParams = (r: Recipient): string[] => {
    if (template === 'general_announcement1') {
      return [r.parentName, customMessage, r.studentName, r.classSection, PAYMENT_LINK];
    }
    return [r.parentName, r.amount || '', r.studentName, r.classSection, r.month || '', r.dueDate || '', PAYMENT_LINK];
  };

  const handleBulkSend = async () => {
    if (sending || sendList.length === 0) return;
    if (!confirm(`Send "${selectedTemplate.label}" to ${sendList.length} selected parent(s)?`)) return;
    setSending(true);
    setProgress({ done: 0, total: sendList.length, failed: 0 });
    let done = 0;
    let failed = 0;

    for (const r of sendList) {
      try {
        const res = await fetch('/api/whatsapp/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: r.phone, templateName: template, parameters: buildParams(r) }),
        });
        if (res.ok) done++; else failed++;
      } catch { failed++; }
      setProgress({ done: done + failed, total: sendList.length, failed });
    }

    const filterSummary = activeFilterCount === 0 ? 'All Classes' :
      [classFilter.length ? `${classFilter.length} class(es)` : '',
       sectionFilter.length ? `Sec: ${sectionFilter.join('/')}` : '',
       genderFilter.length ? genderFilter.join('/') : ''].filter(Boolean).join(', ');

    try {
      const logEntry = {
        templateName: template,
        audience: filterSummary,
        totalSent: done,
        totalFailed: failed,
        sentAt: new Date().toISOString(),
        sentBy: user.name,
      };
      const docRef = await addDoc(collection(db, 'broadcastLogs'), logEntry);
      setBroadcastLogs(prev => [{ id: docRef.id, ...logEntry }, ...prev.slice(0, 19)]);
    } catch {}

    logActivity(user, 'Broadcast Sent (Bulk)', 'Super Admin',
      `Bulk broadcast sent to ${done}/${sendList.length} recipients`, { count: sendList.length, channel: 'whatsapp', template });

    showToast(`Sent to ${done} recipients${failed > 0 ? `, ${failed} failed` : ''}`, done > 0 ? 'success' : 'error');
    setSending(false);
    setProgress(null);
    setComposeOpen(false);
  };

  const handleIndividualSend = async () => {
    if (sending || !individualPhone.trim()) return;
    const phone = individualPhone.replace(/\D/g, '');
    if (phone.length < 10) { showToast('Enter a valid phone number', 'error'); return; }
    setSending(true);
    try {
      const params = template === 'general_announcement1'
        ? [individualParent || 'Parent', customMessage, '', '', PAYMENT_LINK]
        : [individualParent || 'Parent', '', '', '', '', '', PAYMENT_LINK];

      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, templateName: template, parameters: params }),
      });
      if (res.ok) {
        showToast('Message sent successfully', 'success');
        logActivity(user, 'Broadcast Sent (Individual)', 'Super Admin',
          `Individual broadcast sent to ${individualParent || phone}`,
          { recipientId: phone, recipientName: individualParent || 'Parent', channel: 'whatsapp' });
        try {
          const logEntry = {
            templateName: template,
            audience: `Individual: ${phone}`,
            totalSent: 1,
            totalFailed: 0,
            sentAt: new Date().toISOString(),
            sentBy: user.name,
          };
          const docRef = await addDoc(collection(db, 'broadcastLogs'), logEntry);
          setBroadcastLogs(prev => [{ id: docRef.id, ...logEntry }, ...prev.slice(0, 19)]);
        } catch {}
        setIndividualPhone('');
        setIndividualParent('');
        setComposeOpen(false);
      } else {
        showToast('Send failed', 'error');
      }
    } catch {
      showToast('Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="pad stack" style={{ gap: 'var(--space-4)' }}>
        <div className="topbar">
          <div>
            <div className="eyebrow">WhatsApp</div>
            <h1>Broadcast</h1>
          </div>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="card" style={{ height: 80 }} />
          <div className="card" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">WhatsApp · WATI</div>
          <h1>Broadcast</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn accent" onClick={() => setComposeOpen(true)}>
            <Send style={{ width: 14, height: 14 }} />
            Compose
          </button>
        </div>
      </div>

      {/* Send history */}
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <div className="section-head">Send History</div>
        {broadcastLogs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-3)' }}>
            <Megaphone style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.3 }} />
            <p className="muted tiny">No broadcasts sent yet</p>
          </div>
        ) : (
          broadcastLogs.map(log => (
            <div key={log.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="chip solid" style={{ fontSize: 11 }}>
                    {log.templateName.replace(/_/g, ' ')}
                  </span>
                  <span className="chip" style={{ background: 'var(--leaf)', color: '#fff', fontSize: 11 }}>
                    WhatsApp
                  </span>
                </div>
                <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>
                  {log.audience}
                </p>
                <p className="tiny muted">
                  by {log.sentBy} · {new Date(log.sentAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CheckCircle2 style={{ width: 13, height: 13, color: 'var(--leaf)' }} />
                  <span className="t-num" style={{ fontSize: 13, color: 'var(--leaf)', fontWeight: 700 }}>{log.totalSent}</span>
                </span>
                {log.totalFailed > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <XCircle style={{ width: 13, height: 13, color: 'var(--coral)' }} />
                    <span className="t-num" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 700 }}>{log.totalFailed}</span>
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose Modal */}
      <Modal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Compose Broadcast"
        size="lg"
      >
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['bulk', 'individual'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn('btn', mode === m ? 'accent' : 'ghost')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {m === 'bulk' ? <Users style={{ width: 14, height: 14 }} /> : <Send style={{ width: 14, height: 14 }} />}
                {m === 'bulk' ? 'Bulk Send' : 'Individual'}
              </button>
            ))}
          </div>

          {/* Template chips */}
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Template</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={cn('chip', template === t.id ? 'solid' : '')}
                  style={{ cursor: 'pointer' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="muted tiny" style={{ marginTop: 6 }}>{selectedTemplate.description}</p>
          </div>

          {/* Custom message for announcement */}
          {template === 'general_announcement1' && (
            <div>
              <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Message Content</label>
              <textarea
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                placeholder="Enter your announcement message..."
                rows={3}
                style={{
                  width: '100%', border: '1px solid var(--line)', borderRadius: 10,
                  padding: '8px 12px', fontSize: 14, resize: 'none', outline: 'none',
                  background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box',
                }}
              />
              <p className="tiny muted" style={{ textAlign: 'right', marginTop: 4 }}>
                {customMessage.length} chars
              </p>
            </div>
          )}

          {/* Bulk mode */}
          {mode === 'bulk' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="eyebrow">Audience Filter</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="btn ghost" style={{ padding: '2px 10px', fontSize: 12 }}>
                    <X style={{ width: 12, height: 12 }} /> Clear ({activeFilterCount})
                  </button>
                )}
              </div>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search style={{ width: 14, height: 14, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search parent, student or phone…"
                  style={{
                    width: '100%', paddingLeft: 32, paddingRight: 12, height: 38,
                    border: '1px solid var(--line)', borderRadius: 10, fontSize: 13,
                    outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box',
                  }}
                />
              </div>
              {/* Class chips */}
              {classes.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <p className="tiny muted" style={{ marginBottom: 4 }}>Class</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {classes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => toggleArr(setClassFilter, c.id)}
                        className={cn('chip', classFilter.includes(c.id) ? 'solid' : '')}
                        style={{ cursor: 'pointer', fontSize: 12 }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {availableSections.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <p className="tiny muted" style={{ marginBottom: 4 }}>Section</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availableSections.map(s => (
                      <button
                        key={s}
                        onClick={() => toggleArr(setSectionFilter, s)}
                        className={cn('chip', sectionFilter.includes(s) ? 'solid' : '')}
                        style={{ cursor: 'pointer', fontSize: 12 }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <p className="tiny muted" style={{ marginBottom: 4 }}>Gender</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {GENDERS.map(g => (
                    <button
                      key={g.value}
                      onClick={() => toggleArr(setGenderFilter, g.value)}
                      className={cn('chip', genderFilter.includes(g.value) ? 'solid' : '')}
                      style={{ cursor: 'pointer', fontSize: 12 }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient count + select all */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '8px 0', marginBottom: 10 }}>
                <p style={{ fontSize: 13 }}>
                  <span className="t-num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{sendList.length}</span>
                  <span className="muted"> / {recipients.length} selected</span>
                </p>
                <button onClick={allSelected ? clearAll : selectAll} className="btn ghost" style={{ padding: '2px 10px', fontSize: 12 }}>
                  {allSelected ? <Square style={{ width: 13, height: 13 }} /> : <CheckSquare style={{ width: 13, height: 13 }} />}
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>

              {/* Recipient list */}
              {recipients.length === 0 ? (
                <p className="muted tiny" style={{ textAlign: 'center', padding: '16px 0' }}>No matching recipients</p>
              ) : (
                <div className="stack" style={{ gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {recipients.map(r => {
                    const checked = selectedKeys.has(r.key);
                    return (
                      <button
                        key={r.key}
                        onClick={() => toggleSelect(r.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 10, border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                          background: checked ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--cream-2)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                          background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {checked && <CheckCircle2 style={{ width: 10, height: 10, color: '#fff' }} strokeWidth={3} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.parentName}</p>
                          <p className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.studentName} · {r.classSection}</p>
                        </div>
                        {r.amount && (
                          <p className="t-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{r.amount}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Progress */}
              {progress && (
                <div style={{ marginTop: 12, padding: 12, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--accent)' }}>Sending… {progress.done}/{progress.total}</span>
                    {progress.failed > 0 && <span style={{ color: 'var(--coral)' }}>{progress.failed} failed</span>}
                  </div>
                  <div style={{ height: 4, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 999, width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}

              <button
                onClick={handleBulkSend}
                disabled={sending || sendList.length === 0 || (template === 'general_announcement1' && !customMessage.trim())}
                className="btn accent"
                style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
              >
                {sending
                  ? <><RefreshCw style={{ width: 14, height: 14 }} className="animate-spin" />{`Sending (${progress?.done || 0}/${progress?.total || 0})…`}</>
                  : <><Send style={{ width: 14, height: 14 }} />{`Send to ${sendList.length} Contact${sendList.length !== 1 ? 's' : ''}`}</>}
              </button>
            </div>
          )}

          {/* Individual mode */}
          {mode === 'individual' && (
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Search Student / Parent</label>
                <div style={{ position: 'relative' }}>
                  <Search style={{ width: 14, height: 14, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={e => setStudentQuery(e.target.value)}
                    placeholder="Type student or parent name…"
                    style={{
                      width: '100%', paddingLeft: 32, paddingRight: 12, height: 38,
                      border: '1px solid var(--line)', borderRadius: 10, fontSize: 13,
                      outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box',
                    }}
                  />
                </div>
                {studentSuggestions.length > 0 && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--cream)', marginTop: 4, overflow: 'hidden' }}>
                    {studentSuggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 8, padding: '8px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
                          background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{s.name}</p>
                          <p className="tiny muted">{resolveParentName(s)} · {classNameMap[s.classId] || s.classId}</p>
                        </div>
                        <span className="mono tiny" style={{ flexShrink: 0 }}>{s.parentDetails?.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Parent Name</label>
                <input
                  type="text"
                  value={individualParent}
                  onChange={e => setIndividualParent(e.target.value)}
                  placeholder="Parent name for personalisation"
                  style={{ width: '100%', height: 38, border: '1px solid var(--line)', borderRadius: 10, padding: '0 12px', fontSize: 13, outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Phone Number *</label>
                <input
                  type="tel"
                  value={individualPhone}
                  onChange={e => setIndividualPhone(e.target.value)}
                  placeholder="91XXXXXXXXXX"
                  style={{ width: '100%', height: 38, border: '1px solid var(--line)', borderRadius: 10, padding: '0 12px', fontSize: 13, outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>
              {template === 'general_announcement1' && (
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Message</label>
                  <textarea
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    rows={3}
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', fontSize: 13, resize: 'none', outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box' }}
                  />
                  <p className="tiny muted" style={{ textAlign: 'right' }}>{customMessage.length} chars</p>
                </div>
              )}
              <button
                onClick={handleIndividualSend}
                disabled={sending || !individualPhone.trim() || (template === 'general_announcement1' && !customMessage.trim())}
                className="btn accent"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Send style={{ width: 14, height: 14 }} />
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
