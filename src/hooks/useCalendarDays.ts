import { useMemo } from 'react';
import { EventItem } from '../types/schedule';

interface CalendarDay {
  dayNum: number;
  dateString: string;    // "YYYY-MM-DD"
  isCurrentMonth: boolean;
  isToday: boolean;
  hasEvents: boolean;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isEventOnDate(event: EventItem, dateStr: string): boolean {
  const end = event.endDate ?? event.date;
  return dateStr >= event.date && dateStr <= end;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 35-slot mini calendar (sidebar) */
export function useMiniCalendarDays(
  selectedDate: Date
): Omit<CalendarDay, 'hasEvents'>[] {
  const today = todayString();

  return useMemo(() => {
    const year  = selectedDate.getFullYear();
    const month = selectedDate.getMonth();           // 0-based
    const firstIdx  = new Date(year, month, 1).getDay();
    const prevCount = new Date(year, month, 0).getDate();
    const currCount = new Date(year, month + 1, 0).getDate();
    const days: Omit<CalendarDay, 'hasEvents'>[] = [];

    // Previous month overflow
    for (let i = firstIdx - 1; i >= 0; i--) {
      const day = prevCount - i;
      const d   = new Date(year, month - 1, day);
      const ds  = ymd(d.getFullYear(), d.getMonth() + 1, day);
      days.push({ dayNum: day, dateString: ds, isCurrentMonth: false, isToday: ds === today });
    }
    // Current month
    const curMonthPad = String(month + 1).padStart(2, '0');
    for (let i = 1; i <= currCount; i++) {
      const ds = `${year}-${curMonthPad}-${String(i).padStart(2, '0')}`;
      days.push({ dayNum: i, dateString: ds, isCurrentMonth: true, isToday: ds === today });
    }
    // Next month overflow (fill to 35)
    const remaining = 35 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d  = new Date(year, month + 1, i);
      const ds = ymd(d.getFullYear(), d.getMonth() + 1, i);
      days.push({ dayNum: i, dateString: ds, isCurrentMonth: false, isToday: ds === today });
    }
    return days;
  }, [selectedDate, today]);
}

/** 42-slot main grid (6 complete weeks) */
export function useMainCalendarDays(
  selectedDate: Date,
  events: EventItem[]
): CalendarDay[] {
  const today = todayString();

  return useMemo(() => {
    const year  = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstIdx  = new Date(year, month, 1).getDay();
    const prevCount = new Date(year, month, 0).getDate();
    const currCount = new Date(year, month + 1, 0).getDate();
    const days: CalendarDay[] = [];

    // Previous month overflow
    for (let i = firstIdx - 1; i >= 0; i--) {
      const day     = prevCount - i;
      const prevM   = month === 0 ? 11 : month - 1;
      const prevY   = month === 0 ? year - 1 : year;
      const ds      = ymd(prevY, prevM + 1, day);
      days.push({ dayNum: day, dateString: ds, isCurrentMonth: false, isToday: ds === today, hasEvents: events.some(e => isEventOnDate(e, ds)) });
    }
    // Current month
    const curPad = String(month + 1).padStart(2, '0');
    for (let i = 1; i <= currCount; i++) {
      const ds = `${year}-${curPad}-${String(i).padStart(2, '0')}`;
      days.push({ dayNum: i, dateString: ds, isCurrentMonth: true, isToday: ds === today, hasEvents: events.some(e => isEventOnDate(e, ds)) });
    }
    // Next month overflow (fill to 42)
    const padding = 42 - days.length;
    for (let i = 1; i <= padding; i++) {
      const nextM = month === 11 ? 0 : month + 1;
      const nextY = month === 11 ? year + 1 : year;
      const ds    = ymd(nextY, nextM + 1, i);
      days.push({ dayNum: i, dateString: ds, isCurrentMonth: false, isToday: ds === today, hasEvents: events.some(e => isEventOnDate(e, ds)) });
    }
    return days;
  }, [selectedDate, events, today]);
}

/** 7-day week view */
export function useWeekDays(
  selectedDate: Date,
  lang: 'zh' | 'en'
): { label: string; dayNum: number; dateString: string; isToday: boolean }[] {
  const today = todayString();

  return useMemo(() => {
    const base = new Date(selectedDate);
    base.setDate(base.getDate() - base.getDay()); // rewind to Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d  = new Date(base);
      d.setDate(base.getDate() + i);
      const ds = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return {
        label: d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        dateString: ds,
        isToday: ds === today,
      };
    });
  }, [selectedDate, lang, today]);
}

/** Re-export the helper so ScheduleModule doesn't need its own copy */
export { isEventOnDate };
