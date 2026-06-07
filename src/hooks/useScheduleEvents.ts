import { useState, useCallback, useEffect } from 'react';
import { EventItem, ColumnId } from '../types/schedule';
import { scheduleStore } from '../stores/scheduleStore';

interface UseScheduleEventsReturn {
  events: EventItem[];
  addEvent: (event: EventItem) => void;
  updateEvent: (id: string, changes: Partial<EventItem>) => void;
  removeEvent: (id: string) => void;
  moveEvent: (id: string, targetDate: string) => void;
  changeStatus: (id: string, status: ColumnId) => void;
  reload: () => void;
}

export function useScheduleEvents(defaults: EventItem[]): UseScheduleEventsReturn {
  const [events, setEvents] = useState<EventItem[]>(() => {
    const stored = scheduleStore.getAll();
    if (stored.length > 0) return stored;
    // First run: persist defaults
    scheduleStore.save(defaults);
    return defaults;
  });

  const sync = (updated: EventItem[]) => setEvents(updated);

  const addEvent = useCallback((event: EventItem) => {
    sync(scheduleStore.add(event));
  }, []);

  const updateEvent = useCallback((id: string, changes: Partial<EventItem>) => {
    sync(scheduleStore.update(id, changes));
  }, []);

  const removeEvent = useCallback((id: string) => {
    sync(scheduleStore.remove(id));
  }, []);

  const moveEvent = useCallback((id: string, targetDate: string) => {
    const event = scheduleStore.getAll().find(e => e.id === id);
    if (!event) return;
    let endDate = targetDate;
    if (event.endDate && event.endDate !== event.date) {
      try {
        const durationMs = new Date(event.endDate).getTime() - new Date(event.date).getTime();
        const newEnd = new Date(new Date(targetDate).getTime() + durationMs);
        endDate = newEnd.toISOString().split('T')[0];
      } catch { /* keep targetDate */ }
    }
    sync(scheduleStore.update(id, { date: targetDate, endDate }));
  }, []);

  const changeStatus = useCallback((id: string, status: ColumnId) => {
    sync(scheduleStore.update(id, { status, completed: status === 'done' }));
  }, []);

  const reload = useCallback(() => {
    setEvents(scheduleStore.getAll());
  }, []);

  // Listen for cross-module updates (e.g. ChatModule adding an event via the bridge)
  useEffect(() => {
    const handler = () => setEvents(scheduleStore.getAll());
    window.addEventListener('schedule-updated', handler);
    return () => window.removeEventListener('schedule-updated', handler);
  }, []);

  return { events, addEvent, updateEvent, removeEvent, moveEvent, changeStatus, reload };
}
