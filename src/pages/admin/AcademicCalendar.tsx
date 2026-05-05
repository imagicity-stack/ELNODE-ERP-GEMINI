import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { SchoolEvent, UserProfile } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Bell
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  parseISO
} from 'date-fns';
import { cn } from '../../lib/utils';
import {
  Card, Button, IconButton, Modal, ConfirmModal,
  FormField, Input, Select
} from '../../components/ui';

interface AcademicCalendarProps {
  user: UserProfile;
}

export default function AcademicCalendar({ user }: AcademicCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('calendar');

  const isAdmin = user.role === 'super_admin' || user.role === 'principal';
  const canWrite = user.role === 'super_admin' || (user.role === 'principal' && !readOnly);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'event' as SchoolEvent['type'],
    startDate: '',
    endDate: '',
    allDay: true,
    location: '',
    color: 'indigo'
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'events'));
      setEvents(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolEvent)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'events');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'events'), {
        ...formData,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setIsModalOpen(false);
      fetchEvents();
      setFormData({
        title: '', description: '', type: 'event',
        startDate: '', endDate: '', allDay: true,
        location: '', color: 'indigo'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = (id: string) => {
    if (!isAdmin) return;
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'events', deletingId));
      fetchEvents();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${deletingId}`);
    }
  };

  const renderHeader = () => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl gradient-indigo flex items-center justify-center text-white shadow-lg">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{format(currentMonth, 'MMMM yyyy')}</h1>
          <p className="text-slate-500 text-sm">Academic Calendar & Events</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-slate-50 rounded-lg transition-all text-slate-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-slate-50 rounded-lg transition-all text-slate-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {canWrite && (
          <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
            Add Event
          </Button>
        )}
      </div>
    </div>
  );

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map(day => (
          <div key={day} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        const dayEvents = events.filter(event =>
          isSameDay(parseISO(event.startDate), cloneDay)
        );

        days.push(
          <div
            key={day.toString()}
            className={cn(
              'min-h-[110px] bg-white border border-slate-50 p-2 transition-all hover:bg-slate-50/60 cursor-pointer',
              !isSameMonth(day, monthStart) && 'bg-slate-50/30 opacity-50',
              isSameDay(day, new Date()) && 'ring-1 ring-inset ring-indigo-300 bg-indigo-50/20'
            )}
            onClick={() => {
              setSelectedDate(cloneDay);
              setFormData({ ...formData, startDate: format(cloneDay, 'yyyy-MM-dd') });
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={cn(
                'text-sm font-bold',
                isSameDay(day, new Date())
                  ? 'w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-sm text-xs'
                  : 'text-slate-700'
              )}>
                {formattedDate}
              </span>
            </div>
            <div className="space-y-0.5">
              {dayEvents.map(event => (
                <div
                  key={event.id}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-bold truncate cursor-pointer hover:opacity-80 transition-all',
                    event.type === 'holiday' ? 'bg-red-50 text-red-600' :
                    event.type === 'exam' ? 'bg-amber-50 text-amber-600' :
                    event.type === 'meeting' ? 'bg-sky-50 text-sky-600' :
                    'bg-indigo-50 text-indigo-600'
                  )}
                  title={event.title}
                  onClick={(e) => { e.stopPropagation(); if (canWrite) handleDeleteEvent(event.id); }}
                >
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {rows}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {renderHeader()}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          {renderDays()}
          {renderCells()}
        </div>

        <div className="space-y-5">
          <Card>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-600" />
              Upcoming Events
            </h3>
            <div className="space-y-4">
              {events
                .filter(e => parseISO(e.startDate) >= new Date())
                .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
                .slice(0, 5)
                .map(event => (
                  <div key={event.id} className="flex gap-3 group">
                    <div className={cn(
                      'w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 transition-all group-hover:scale-105',
                      event.type === 'holiday' ? 'bg-red-50 text-red-600' :
                      event.type === 'exam' ? 'bg-amber-50 text-amber-600' :
                      'bg-indigo-50 text-indigo-600'
                    )}>
                      <span className="text-[9px] font-bold uppercase">{format(parseISO(event.startDate), 'MMM')}</span>
                      <span className="text-sm font-bold">{format(parseISO(event.startDate), 'dd')}</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-all truncate">{event.title}</h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {event.allDay ? 'All Day' : format(parseISO(event.startDate), 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              {events.filter(e => parseISO(e.startDate) >= new Date()).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No upcoming events</p>
              )}
            </div>
          </Card>

          <div className="gradient-indigo p-5 rounded-2xl text-white shadow-lg">
            <h3 className="font-bold mb-1">Academic Year 2026-27</h3>
            <p className="text-xs text-white/80 leading-relaxed">
              Stay updated with all school activities, holidays, and examination schedules.
            </p>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Event?"
        message="This action cannot be undone. This event will be removed from the calendar."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Event"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="event-form" type="submit" loading={loading} icon={Plus}>
              Add Event
            </Button>
          </div>
        }
      >
        <form id="event-form" onSubmit={handleCreateEvent} className="space-y-4">
          <FormField label="Event Title" required>
            <Input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Annual Sports Day"
            />
          </FormField>
          <FormField label="Type" required>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
            >
              <option value="event">General Event</option>
              <option value="holiday">Holiday</option>
              <option value="exam">Examination</option>
              <option value="meeting">Meeting</option>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <Input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </FormField>
            <FormField label="End Date" required>
              <Input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Location">
            <Input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g. School Auditorium"
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
