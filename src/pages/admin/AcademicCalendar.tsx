import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { SchoolEvent, UserProfile } from '../../types';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  X, 
  Trash2,
  AlertCircle,
  CheckCircle2,
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
  eachDayOfInterval,
  parseISO
} from 'date-fns';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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

  const isAdmin = user.role === 'super_admin' || user.role === 'principal';

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
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</h1>
        <p className="text-sm text-gray-500">Academic Calendar & Events</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-gray-50 rounded-lg transition-all text-gray-600"
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
            className="p-2 hover:bg-gray-50 rounded-lg transition-all text-gray-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        )}
      </div>
    </div>
  );

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-4">
        {days.map(day => (
          <div key={day} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
              "min-h-[120px] bg-white border border-gray-50 p-2 transition-all hover:bg-gray-50/50",
              !isSameMonth(day, monthStart) && "bg-gray-50/30 text-gray-300",
              isSameDay(day, new Date()) && "bg-indigo-50/30"
            )}
            onClick={() => {
              setSelectedDate(cloneDay);
              setFormData({ ...formData, startDate: format(cloneDay, 'yyyy-MM-dd') });
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                "text-sm font-bold",
                isSameDay(day, new Date()) ? "w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/20" : "text-gray-700"
              )}>
                {formattedDate}
              </span>
            </div>
            <div className="space-y-1">
              {dayEvents.map(event => (
                <div 
                  key={event.id}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold truncate cursor-pointer transition-all hover:opacity-80",
                    event.type === 'holiday' ? "bg-red-50 text-red-600" :
                    event.type === 'exam' ? "bg-amber-50 text-amber-600" :
                    event.type === 'meeting' ? "bg-blue-50 text-blue-600" :
                    "bg-indigo-50 text-indigo-600"
                  )}
                  title={event.title}
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
    return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">{rows}</div>;
  };

  return (
    <div className="space-y-8">
      {renderHeader()}
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          {renderDays()}
          {renderCells()}
        </div>
        
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-600" />
              Upcoming Events
            </h3>
            <div className="space-y-4">
              {events
                .filter(e => parseISO(e.startDate) >= new Date())
                .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
                .slice(0, 5)
                .map(event => (
                  <div key={event.id} className="flex gap-4 group">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 transition-all group-hover:scale-105",
                      event.type === 'holiday' ? "bg-red-50 text-red-600" :
                      event.type === 'exam' ? "bg-amber-50 text-amber-600" :
                      "bg-indigo-50 text-indigo-600"
                    )}>
                      <span className="text-[10px] font-bold uppercase">{format(parseISO(event.startDate), 'MMM')}</span>
                      <span className="text-sm font-bold">{format(parseISO(event.startDate), 'dd')}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-all">{event.title}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {event.allDay ? 'All Day' : format(parseISO(event.startDate), 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
            <h3 className="font-bold mb-2">Academic Year 2026-27</h3>
            <p className="text-xs text-indigo-100 leading-relaxed">
              Stay updated with all school activities, holidays, and examination schedules.
            </p>
          </div>
        </div>
      </div>

      {/* New Event Modal */}
      {/* Modals */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Event?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. This event will be removed from the calendar.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={performDelete}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900">Add New Event</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Event Title</label>
                  <input 
                    type="text" required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    placeholder="e.g. Annual Sports Day"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  >
                    <option value="event">General Event</option>
                    <option value="holiday">Holiday</option>
                    <option value="exam">Examination</option>
                    <option value="meeting">Meeting</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
                    <input 
                      type="date" required
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">End Date</label>
                    <input 
                      type="date" required
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                  <input 
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    placeholder="e.g. School Auditorium"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 mt-4"
                >
                  {loading ? 'Adding...' : 'Add Event'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
