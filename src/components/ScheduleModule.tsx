import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  Search, 
  Sparkles, 
  MapPin, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Move,
  CheckCircle2,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  X,
  Edit2,
  Info,
  Layers,
  Eye,
  AlertTriangle,
  Grid,
  CalendarDays,
  PanelLeft
} from 'lucide-react';

interface EventItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  date: string; // "YYYY-MM-DD" Start Date
  endDate?: string; // "YYYY-MM-DD" End Date
  category: 'creative' | 'finance' | 'secure' | 'strategy';
  location: string;
  completed: boolean;
  status: 'todo' | 'progress' | 'review' | 'done';
}

interface ScheduleModuleProps {
  lang: 'zh' | 'en';
  defaultView?: 'kanban' | 'calendar';
}

type ViewMode = 'month' | 'week' | 'day' | 'kanban';
type ColumnId = 'todo' | 'progress' | 'review' | 'done';

export default function ScheduleModule({ lang, defaultView = 'kanban' }: ScheduleModuleProps) {
  const LOCAL_STORAGE_KEY = 'identity_lab_schedule';

  // Compute today's date string once (YYYY-MM-DD) — never hardcode a date
  const todayDate = new Date();
  const todayString = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

  // Master State
  const [events, setEvents] = useState<EventItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView === 'calendar' ? 'month' : 'kanban');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Primary calendar selected date focus
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Category toggles in Google Calendar style sidebar (My Calendars)
  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({
    creative: true,
    finance: true,
    secure: true,
    strategy: true
  });

  // Drag-and-Drop States
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Form input states
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [newDate, setNewDate] = useState(todayString);
  const [newEndDate, setNewEndDate] = useState(todayString);
  const [newCategory, setNewCategory] = useState<'creative' | 'finance' | 'secure' | 'strategy'>('creative');
  const [newLocation, setNewLocation] = useState('');
  const [newStatus, setNewStatus] = useState<ColumnId>('todo');
  const [showAddForm, setShowAddForm] = useState(false);

  // Detail Modal / Edit Event
  const [selectedEventForView, setSelectedEventForView] = useState<EventItem | null>(null);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editCategory, setEditCategory] = useState<'creative' | 'finance' | 'secure' | 'strategy'>('creative');
  const [editLocation, setEditLocation] = useState('');
  const [editStatus, setEditStatus] = useState<ColumnId>('todo');

  // Quick Inline Add Popover on Month Grid Cells
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Toast / System Notification
  const [notification, setNotification] = useState<string | null>(null);

  // Auto sync start and end date for user convenience
  useEffect(() => {
    if (newDate) {
      setNewEndDate(newDate);
    }
  }, [newDate]);

  // Helper check if event spans a date
  const isEventOnDate = (event: EventItem, dateString: string) => {
    const start = event.date;
    const end = event.endDate || event.date;
    return dateString >= start && dateString <= end;
  };

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized: EventItem[] = parsed.map((item: any) => ({
          ...item,
          status: item.status || (item.completed ? 'done' : 'todo')
        }));
        setEvents(sanitized);
      } catch (e) {
        console.error("Failed to parse schedule:", e);
      }
    } else {
      const defaultEvents: EventItem[] = [
        {
          id: '1',
          title: lang === 'zh' ? '雅致品牌推介会与设计评审' : 'Atelier Brand Pitch & Design Review',
          subtitle: lang === 'zh' ? '首席设计师审核矢量徽志第一阶段草图比例' : 'Review Phase 1 layout proportion & vector metrics',
          time: '10:00',
          date: '2026-05-26',
          endDate: '2026-05-28',
          category: 'creative',
          location: 'Atelier Room III',
          completed: false,
          status: 'todo'
        },
        {
          id: '2',
          title: lang === 'zh' ? '中世纪美学季度财务审计' : 'Mid-century Atelier Financial Audit',
          subtitle: lang === 'zh' ? '整理资产负债表与原浆纸浆采购耗料发票' : 'Consolidate double-entry asset ledger lists & stock invoices',
          time: '14:30',
          date: '2026-05-26',
          endDate: '2026-05-26',
          category: 'finance',
          location: 'Boardroom Annex',
          completed: false,
          status: 'progress'
        },
        {
          id: '3',
          title: lang === 'zh' ? '机密系统服务器 PGP 与 SSL 轮转' : 'PGP Key Rotation & Server SSL Audit',
          subtitle: lang === 'zh' ? '更新本地多端数据库独立高强度访问密钥对' : 'Refresh database high-strength cryptographic key matrices',
          time: '17:00',
          date: '2026-05-27',
          endDate: '2026-05-27',
          category: 'secure',
          location: 'Citadel Operations Vault',
          completed: true,
          status: 'done'
        },
        {
          id: '4',
          title: lang === 'zh' ? '品牌定位战略圆桌会议' : 'Brand Positioning Master Workshop',
          subtitle: lang === 'zh' ? '制定下半年奢侈印刷工艺推广纲领' : 'Establish luxury letterpress printing promotion strategy',
          time: '09:00',
          date: '2026-05-24',
          endDate: '2026-05-25',
          category: 'strategy',
          location: 'Studio Loft A',
          completed: false,
          status: 'todo'
        },
        {
          id: '5',
          title: lang === 'zh' ? '设计方案交付与客户签收确认' : 'Creative Mockups Handover & Receipt',
          subtitle: lang === 'zh' ? '提交全部高分辨率向量化资产及版权契约说明' : 'Deliver all vector resources and physical copyright certificates',
          time: '15:30',
          date: '2026-05-30',
          endDate: '2026-05-30',
          category: 'creative',
          location: 'Client Agency Office',
          completed: false,
          status: 'review'
        }
      ];
      setEvents(defaultEvents);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultEvents));
    }
  }, [lang]);

  // Handle external defaultView changes
  useEffect(() => {
    setViewMode(defaultView === 'calendar' ? 'month' : 'kanban');
  }, [defaultView]);

  // Save events helper
  const saveEvents = (updated: EventItem[]) => {
    setEvents(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };

  const triggerNotification = (text: string) => {
    setNotification(text);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Add event handler
  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const event: EventItem = {
      id: Date.now().toString(),
      title: newTitle,
      subtitle: newSubtitle || (lang === 'zh' ? '自主拟定日程项目' : 'Self-defined agenda block'),
      time: newTime || '12:00',
      date: newDate || todayString,
      endDate: newEndDate || newDate || todayString,
      category: newCategory,
      location: newLocation || (lang === 'zh' ? '总部工作坊' : 'Atelier Headquarters'),
      status: newStatus,
      completed: newStatus === 'done'
    };

    const updated = [...events, event].sort((a, b) => {
      const datetimeA = `${a.date}T${a.time}`;
      const datetimeB = `${b.date}T${b.time}`;
      return datetimeA.localeCompare(datetimeB);
    });

    saveEvents(updated);
    triggerNotification(lang === 'zh' ? `信条安排 Deploy 成功: ${newTitle}` : `Card successfully deployed: ${newTitle}`);

    // Reset inputs
    setNewTitle('');
    setNewSubtitle('');
    setNewLocation('');
    setShowAddForm(false);
  };

  // Quick creation popover for day click
  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim() || !quickAddDate) return;

    const event: EventItem = {
      id: Date.now().toString(),
      title: quickAddTitle,
      subtitle: lang === 'zh' ? '快速记点日程' : 'Quick grid-created item',
      time: '10:00',
      date: quickAddDate,
      category: 'creative',
      location: lang === 'zh' ? '主设计工坊' : 'Atelier HQ Loft B',
      status: 'todo',
      completed: false
    };

    const updated = [...events, event].sort((a, b) => {
      const datetimeA = `${a.date}T${a.time}`;
      const datetimeB = `${b.date}T${b.time}`;
      return datetimeA.localeCompare(datetimeB);
    });

    saveEvents(updated);
    triggerNotification(lang === 'zh' ? `快速建立: ${quickAddTitle}` : `Quick added: ${quickAddTitle}`);
    setQuickAddTitle('');
    setQuickAddDate(null);
  };

  // Delete event
  const handleDeleteEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentItem = events.find(item => item.id === id);
    const updated = events.filter(item => item.id !== id);
    saveEvents(updated);
    if (selectedEventForView?.id === id) {
      setSelectedEventForView(null);
      setIsEditingInModal(false);
    }
    triggerNotification(lang === 'zh' ? `丢弃卡片: ${currentItem?.title}` : `Incident card purged from database`);
  };

  // Open view/edit modal
  const handleOpenEventModal = (item: EventItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedEventForView(item);
    setIsEditingInModal(false);
    
    // Copy item details for editing state
    setEditTitle(item.title);
    setEditSubtitle(item.subtitle);
    setEditTime(item.time);
    setEditDate(item.date);
    setEditEndDate(item.endDate || item.date);
    setEditCategory(item.category);
    setEditLocation(item.location);
    setEditStatus(item.status);
  };

  // Save edits made in details modal
  const handleSaveModalEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForView || !editTitle.trim()) return;

    const updated = events.map(item => {
      if (item.id === selectedEventForView.id) {
        return {
          ...item,
          title: editTitle,
          subtitle: editSubtitle,
          time: editTime,
          date: editDate,
          endDate: editEndDate || editDate,
          category: editCategory,
          location: editLocation,
          status: editStatus,
          completed: editStatus === 'done'
        };
      }
      return item;
    });

    saveEvents(updated);
    setSelectedEventForView(null);
    setIsEditingInModal(false);
    triggerNotification(lang === 'zh' ? '信条变动调整已同步保存' : 'Manuscript revisions deployed & updated successfully');
  };

  // HTML5 Drag handlers for columns (Kanban)
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
    setDragOverDate(null);
  };

  const handleDragOverColumn = (e: React.DragEvent, status: ColumnId) => {
    e.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDropColumn = (e: React.DragEvent, targetStatus: ColumnId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    if (id) {
      const updated = events.map(event => {
        if (event.id === id) {
          return {
            ...event,
            status: targetStatus,
            completed: targetStatus === 'done'
          };
        }
        return event;
      });
      saveEvents(updated);
      triggerNotification(lang === 'zh' ? `阶段迁移至 ${targetStatus.toUpperCase()}` : `Stage updated to ${targetStatus.toUpperCase()}`);
    }
    setDraggingId(null);
    setDragOverColumn(null);
  };

  // HTML5 Drag handlers for dates (Calendar view dynamic rescheduling!)
  const handleDragOverDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDropDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    if (id) {
      const updated = events.map(event => {
        if (event.id === id) {
          if (event.endDate && event.endDate !== event.date) {
            try {
              const prevStart = new Date(event.date);
              const prevEnd = new Date(event.endDate);
              const durationMs = prevEnd.getTime() - prevStart.getTime();
              
              const newStart = new Date(dateStr);
              const newEnd = new Date(newStart.getTime() + durationMs);
              
              const formatYMD = (d: Date) => d.toISOString().split('T')[0];
              
              return { 
                ...event, 
                date: dateStr, 
                endDate: formatYMD(newEnd) 
              };
            } catch (err) {
              return { ...event, date: dateStr, endDate: dateStr };
            }
          }
          return { ...event, date: dateStr, endDate: dateStr };
        }
        return event;
      });
      saveEvents(updated);
      const movedItem = events.find(item => item.id === id);
      triggerNotification(lang === 'zh' ? `日程已拖拽至: ${dateStr}` : `Event "${movedItem?.title}" rescheduled to ${dateStr}`);
    }
    setDraggingId(null);
    setDragOverDate(null);
  };

  const handleShiftCard = (id: string, direction: 'back' | 'forward', e: React.MouseEvent) => {
    e.stopPropagation();
    const statusCycle: ColumnId[] = ['todo', 'progress', 'review', 'done'];
    const event = events.find(item => item.id === id);
    if (!event) return;

    const currentStatus = event.status || (event.completed ? 'done' : 'todo');
    const currentIndex = statusCycle.indexOf(currentStatus);
    let targetIndex = currentIndex;

    if (direction === 'forward' && currentIndex < statusCycle.length - 1) {
      targetIndex = currentIndex + 1;
    } else if (direction === 'back' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    }

    if (targetIndex !== currentIndex) {
      const updated = events.map(item => {
        if (item.id === id) {
          return {
            ...item,
            status: statusCycle[targetIndex],
            completed: statusCycle[targetIndex] === 'done'
          };
        }
        return item;
      });
      saveEvents(updated);
    }
  };

  // Category parameters
  const categoryMap = {
    creative: {
      zhLabel: '创意设计',
      enLabel: 'Creative & Graphics',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
      textAccent: 'text-emerald-700',
      dot: 'bg-emerald-500',
      // Dynamic color segments for Google Calendar look
      accentBg: 'bg-emerald-500',
      pastelBg: 'bg-emerald-50/95 text-emerald-800 border-emerald-500/10',
      solidBg: 'bg-emerald-600 text-[#F9F8F6] border-emerald-700/20 font-bold',
      borderColor: 'border-l-emerald-500'
    },
    finance: {
      zhLabel: '资产流转',
      enLabel: 'Capital & Flows',
      color: 'bg-amber-50 text-amber-800 border-amber-200/80',
      textAccent: 'text-amber-700',
      dot: 'bg-amber-500',
      accentBg: 'bg-amber-500',
      pastelBg: 'bg-amber-50/95 text-amber-800 border-amber-500/10',
      solidBg: 'bg-amber-600 text-[#F9F8F6] border-amber-700/20 font-bold',
      borderColor: 'border-l-amber-500'
    },
    secure: {
      zhLabel: '保密机制',
      enLabel: 'Citadel Sec Ops',
      color: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
      textAccent: 'text-indigo-700',
      dot: 'bg-indigo-500',
      accentBg: 'bg-indigo-500',
      pastelBg: 'bg-indigo-50/95 text-indigo-800 border-indigo-500/10',
      solidBg: 'bg-indigo-600 text-[#F9F8F6] border-indigo-700/20 font-bold',
      borderColor: 'border-l-indigo-500'
    },
    strategy: {
      zhLabel: '路线决策',
      enLabel: 'Strategic Blueprints',
      color: 'bg-teal-50 text-teal-800 border-teal-200/80',
      textAccent: 'text-teal-700',
      dot: 'bg-teal-500',
      accentBg: 'bg-teal-500',
      pastelBg: 'bg-teal-50/95 text-teal-800 border-teal-500/10',
      solidBg: 'bg-teal-600 text-[#F9F8F6] border-teal-700/20 font-bold',
      borderColor: 'border-l-teal-500'
    }
  };

  const columns: { id: ColumnId; zhTitle: string; enTitle: string; colorClass: string; borderFocus: string }[] = [
    { 
      id: 'todo', 
      zhTitle: '预约待编', 
      enTitle: 'Backlog Tasks', 
      colorClass: 'bg-[#F9F8F6]/40 border-zinc-200',
      borderFocus: 'border-[#1A1A1A] bg-zinc-200/40'
    },
    { 
      id: 'progress', 
      zhTitle: '执行中柜', 
      enTitle: 'In Progress', 
      colorClass: 'bg-[#F9F8F6]/20 border-[#1A1A1A]/5',
      borderFocus: 'border-amber-500 bg-amber-50/10'
    },
    { 
      id: 'review', 
      zhTitle: '评审阶段', 
      enTitle: 'Under Review', 
      colorClass: 'bg-[#F9F8F6]/20 border-[#1A1A1A]/5',
      borderFocus: 'border-indigo-500 bg-indigo-50/10'
    },
    { 
      id: 'done', 
      zhTitle: '极速已成', 
      enTitle: 'Completed', 
      colorClass: 'bg-emerald-50/10 border-emerald-200/30',
      borderFocus: 'border-emerald-500 bg-emerald-50/20'
    }
  ];

  // Primary filtering query
  const getFilteredEvents = () => {
    return events.filter(item => {
      // General filters: Search term & Category drop-down
      const matchesSearch = item.title.toLowerCase().includes(searchText.toLowerCase()) || 
                            item.subtitle.toLowerCase().includes(searchText.toLowerCase());
      const matchesCategoryDropdown = filterCategory === 'all' || item.category === filterCategory;
      
      // Sidebar "My Calendars" category visibility toggle
      const categoryIsChecked = visibleCategories[item.category] !== false;

      return matchesSearch && matchesCategoryDropdown && categoryIsChecked;
    });
  };

  const activeFilteredList = getFilteredEvents();

  // Kanban view items per column
  const getKanbanEventsForColumn = (colId: ColumnId) => {
    return activeFilteredList.filter(e => {
      const currentStatus = e.status || (e.completed ? 'done' : 'todo');
      return currentStatus === colId;
    });
  };

  // Navigation Logic
  const handleNavigateToday = () => {
    setSelectedDate(new Date());
    triggerNotification(lang === 'zh' ? `已转跳回今天 ${todayString}` : `Centered calendar back to today ${todayString}`);
  };

  const handleNavigateDiff = (amount: number) => {
    const nextDate = new Date(selectedDate);
    if (viewMode === 'month') {
      nextDate.setMonth(nextDate.getMonth() + amount);
    } else if (viewMode === 'week') {
      nextDate.setDate(nextDate.getDate() + (amount * 7));
    } else if (viewMode === 'day') {
      nextDate.setDate(nextDate.getDate() + amount);
    }
    setSelectedDate(nextDate);
  };

  // Mini side-calendar date generation logic (Month layout grid picker)
  const miniCalendarDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    
    // First day of current month (0-Sunday, 6-Saturday)
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Number of days in previous month
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    // Number of days in current month
    const daysInCurrMonth = new Date(year, month + 1, 0).getDate();

    const daysArray: { dayNum: number; dateString: string; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Prior month overflow days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayVal = daysInPrevMonth - i;
      const prevMonthObj = new Date(year, month - 1, dayVal);
      const prY = prevMonthObj.getFullYear();
      const prM = String(prevMonthObj.getMonth() + 1).padStart(2, '0');
      const prD = String(dayVal).padStart(2, '0');
      daysArray.push({
        dayNum: dayVal,
        dateString: `${prY}-${prM}-${prD}`,
        isCurrentMonth: false,
        isToday: `${prY}-${prM}-${prD}` === todayString
      });
    }

    // Current month days
    const curMIndex = String(month + 1).padStart(2, '0');
    for (let i = 1; i <= daysInCurrMonth; i++) {
      const curDIndex = String(i).padStart(2, '0');
      daysArray.push({
        dayNum: i,
        dateString: `${year}-${curMIndex}-${curDIndex}`,
        isCurrentMonth: true,
        isToday: `${year}-${curMIndex}-${curDIndex}` === todayString
      });
    }

    // Next month overflow days
    const totalSlots = 35; // Standard grid size
    const remaining = totalSlots - daysArray.length;
    const paddingCount = remaining > 0 ? remaining : (remaining + 7) % 7; // Handle variable length month
    
    for (let i = 1; i <= paddingCount; i++) {
      const nextMonthObj = new Date(year, month + 1, i);
      const nxtY = nextMonthObj.getFullYear();
      const nxtM = String(nextMonthObj.getMonth() + 1).padStart(2, '0');
      const nxtD = String(i).padStart(2, '0');
      daysArray.push({
        dayNum: i,
        dateString: `${nxtY}-${nxtM}-${nxtD}`,
        isCurrentMonth: false,
        isToday: `${nxtY}-${nxtM}-${nxtD}` === todayString
      });
    }

    return daysArray;
  }, [selectedDate]);

  // Main interactive grid dates calculation (returns exactly 42 days grid blocks)
  const mainCalendarGridDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    
    const startDayIndex = new Date(year, month, 1).getDay();
    const prevMonthDaysCount = new Date(year, month, 0).getDate();
    const curMonthDaysCount = new Date(year, month + 1, 0).getDate();

    const daysList: { dayNum: number; dateString: string; isCurrentMonth: boolean; isToday: boolean; hasEvents: boolean }[] = [];

    // Previous Month padding days
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const day = prevMonthDaysCount - i;
      const prevMonth = month - 1 < 0 ? 11 : month - 1;
      const prevYear = month - 1 < 0 ? year - 1 : year;
      const dateStringStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      daysList.push({
        dayNum: day,
        dateString: dateStringStr,
        isCurrentMonth: false,
        isToday: dateStringStr === todayString,
        hasEvents: events.some(e => isEventOnDate(e, dateStringStr))
      });
    }

    // Current Month days
    const curMonthPad = String(month + 1).padStart(2, '0');
    for (let i = 1; i <= curMonthDaysCount; i++) {
      const dateStringStr = `${year}-${curMonthPad}-${String(i).padStart(2, '0')}`;
      daysList.push({
        dayNum: i,
        dateString: dateStringStr,
        isCurrentMonth: true,
        isToday: dateStringStr === todayString,
        hasEvents: events.some(e => isEventOnDate(e, dateStringStr))
      });
    }

    // Next Month padding days to complete exactly 42 slots (6 weeks grid layout)
    const paddingRequired = 42 - daysList.length;
    for (let i = 1; i <= paddingRequired; i++) {
      const nextMonth = month + 1 > 11 ? 0 : month + 1;
      const nextYear = month + 1 > 11 ? year + 1 : year;
      const dateStringStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

      daysList.push({
        dayNum: i,
        dateString: dateStringStr,
        isCurrentMonth: false,
        isToday: dateStringStr === todayString,
        hasEvents: events.some(e => isEventOnDate(e, dateStringStr))
      });
    }

    return daysList;
  }, [selectedDate, events]);

  // Week View dates helper (Sunday to Saturday around selectedDate focus)
  const currentWeekDaysList = useMemo(() => {
    const sundayOffset = selectedDate.getDay();
    const result = [];
    const base = new Date(selectedDate);
    base.setDate(base.getDate() - sundayOffset); // rewinds to Sunday

    for (let i = 0; i < 7; i++) {
      const loopDate = new Date(base);
      loopDate.setDate(base.getDate() + i);
      const y = loopDate.getFullYear();
      const m = String(loopDate.getMonth() + 1).padStart(2, '0');
      const d = String(loopDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      result.push({
        label: loopDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }),
        dayNum: loopDate.getDate(),
        dateString: dateStr,
        isToday: dateStr === todayString
      });
    }
    return result;
  }, [selectedDate, lang]);

  // Sidebar toggler for all visibility categories
  const handleToggleVisibleCategory = (category: string) => {
    setVisibleCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleSelectAllCategories = (status: boolean) => {
    setVisibleCategories({
      creative: status,
      finance: status,
      secure: status,
      strategy: status
    });
  };

  return (
    <div className="space-y-6 text-[#1A1A1A] font-sans animate-fadeIn">
      
      {/* Toast Notification Container */}
      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 border border-amber-900/40 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" />
          <span>{notification}</span>
        </div>
      )}

      {/* Dynamic Module Header Section following the rigid Atelier Kanban aesthetic */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif text-[#1A1A1A] font-bold tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-[#1A1A1A] text-white rounded-none">
              <CalendarIcon className="w-4 h-4" />
            </span>
            <span>{lang === 'zh' ? 'Chronos 极速格栅日程空间' : 'Chronos Multi-Interactive Calendar'}</span>
          </h2>
          <p className="text-xs text-[#1A1A1A]/40 font-mono uppercase tracking-widest mt-1">
            {lang === 'zh' ? '融合传统 Google Calendar 侧栏联动与极低延迟拖拽，守护本地机密文册' : 'Atelier workspace integrating day-grid visualizers and bespoke task schedulers'}
          </p>
        </div>

        {/* Global Progress Indicators */}
        <div className="flex gap-4 items-center bg-white border border-[#1A1A1A]/10 px-4 py-2 text-[10px] font-mono text-[#1A1A1A]/70 uppercase tracking-widest">
          <div>
            {lang === 'zh' ? '总日程安排:' : 'TOTAL ENGAGED:'} <strong className="text-amber-800 font-bold">{events.length} 项</strong>
          </div>
          <div className="w-[1px] h-4 bg-[#1A1A1A]/10" />
          <div>
            {lang === 'zh' ? '当前筛选视图:' : 'DISPLAYING:'} <strong className="text-[#1A1A1A]">{activeFilteredList.length} 项</strong>
          </div>
        </div>
      </div>

      {/* Search and Global Command Toolbar strip */}
      <div className="bg-white border border-[#1A1A1A]/10 p-3.5 flex flex-col xl:flex-row items-center justify-between gap-4">
        
        {/* Search controls */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {viewMode !== 'kanban' && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all flex items-center justify-center ${isSidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'bg-transparent text-[#1A1A1A]/70'}`}
              title={lang === 'zh' ? '切换侧边栏' : 'Toggle Sidebar'}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#1A1A1A]/40" />
            <input
              type="text"
              placeholder={lang === 'zh' ? '搜索文书卡片...' : 'Filter schedule archives...'}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-64 pl-9 pr-4 py-1.5 text-xs border border-[#1A1A1A]/10 rounded-none bg-[#F9F8F6]/40 focus:bg-white focus:outline-none focus:border-[#1A1A1A]/40 transition-colors text-[#1A1A1A]"
            />
          </div>

          {/* Quick category select dropdown */}
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="p-1 px-3 border border-[#1A1A1A]/10 rounded-none text-xs font-mono uppercase tracking-wider bg-transparent text-[#1A1A1A] cursor-pointer"
          >
            <option value="all">■ {lang === 'zh' ? '全领域分流' : 'ALL CATEGORIES'}</option>
            <option value="creative">{lang === 'zh' ? '创意与排版' : 'CREATIVE & DESIGN'}</option>
            <option value="finance">{lang === 'zh' ? '资产与发票' : 'CAPITAL & FLOWS'}</option>
            <option value="secure">{lang === 'zh' ? '保密机制' : 'SECURITY SCHEMES'}</option>
            <option value="strategy">{lang === 'zh' ? '战略圆桌' : 'STRATEGIC ROUND'}</option>
          </select>
        </div>

        {/* View switching panel - Month / Week / Day / Kanban (Trello style!) */}
        <div className="flex items-center justify-between w-full xl:w-auto gap-4 flex-wrap">
          <div className="flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40">
            <button
              onClick={() => setViewMode('month')}
              className={`p-1.5 px-3.5 text-[9px] font-mono uppercase tracking-wider transition-all rounded-none ${
                viewMode === 'month' ? 'bg-[#1A1A1A] text-white font-bold' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
              }`}
            >
              {lang === 'zh' ? '格网月历' : 'Month Grid'}
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`p-1.5 px-3.5 text-[9px] font-mono uppercase tracking-wider transition-all rounded-none ${
                viewMode === 'week' ? 'bg-[#1A1A1A] text-white font-bold' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
              }`}
            >
              {lang === 'zh' ? '执行周历' : 'Week Timeline'}
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`p-1.5 px-3.5 text-[9px] font-mono uppercase tracking-wider transition-all rounded-none ${
                viewMode === 'day' ? 'bg-[#1A1A1A] text-white font-bold' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
              }`}
            >
              {lang === 'zh' ? '单日重点' : 'Day Focus'}
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 px-3.5 text-[9px] font-mono uppercase tracking-wider transition-all rounded-none ${
                viewMode === 'kanban' ? 'bg-[#1A1A1A] text-white font-bold' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'
              }`}
            >
              👑 {lang === 'zh' ? '阶段看板' : 'Kanban Board'}
            </button>
          </div>

          {/* Quick Create Event toggle button */}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`px-4 py-1.5 font-bold text-[10px] font-mono tracking-widest uppercase transition-all flex items-center gap-2 rounded-none ${
              showAddForm ? 'bg-red-800 text-white hover:bg-red-900' : 'bg-[#1A1A1A] text-white'
            }`}
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showAddForm ? (lang === 'zh' ? '收回表单' : 'Collapse Scribe') : (lang === 'zh' ? '签发事件' : 'Sealed Event')}</span>
          </button>
        </div>
      </div>

      {/* Sealed Event Manuscript Writer form drawer */}
      {showAddForm && (
        <form 
          onSubmit={handleAddEvent} 
          className="bg-white border border-[#1A1A1A] p-6 space-y-4 max-w-4xl mx-auto shadow-sm animate-fadeIn"
        >
          <div className="pb-3 border-b border-[#1A1A1A]/10 flex items-center justify-between">
            <h3 className="text-xs font-serif tracking-widest text-[#1A1A1A] font-bold uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
              <span>{lang === 'zh' ? '极速日程信条拟书契约' : 'ATELIER MEMORANDUM DEPLOYMENT ENGINE'}</span>
            </h3>
            <span className="text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest">
              LANE PRESET: {newStatus.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div>
              <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '日程核心标题 (简述)' : 'Primary Event Title'}
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Atelier Brand Typography Scribe"
                className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
              />
            </div>

            {/* Subtitle */}
            <div>
              <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '实施大纲或行动意图 (选填)' : 'Strategic Intent (Optional)'}
              </label>
              <input
                type="text"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
                placeholder="e.g. Confirm geometric serif spacing constraints at 400dpi"
                className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none focus:outline-none"
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                  {lang === 'zh' ? '起始日期' : 'Start Date'}
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                  {lang === 'zh' ? '结束日期' : 'End Date (Optional)'}
                </label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  min={newDate}
                  className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                  {lang === 'zh' ? '计划时间' : 'Exact Timeline'}
                </label>
                <input
                  type="time"
                  required
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono"
                />
              </div>
            </div>

            {/* Lane and Category Option */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                  {lang === 'zh' ? '分流领域' : 'Category Domain'}
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-neutral-800"
                >
                  <option value="creative">{lang === 'zh' ? '创意与排版' : 'Creative & Design'}</option>
                  <option value="finance">{lang === 'zh' ? '资产与发票' : 'Capital & Flows'}</option>
                  <option value="secure">{lang === 'zh' ? '机密级安全' : 'Citadel Security'}</option>
                  <option value="strategy">{lang === 'zh' ? '战略发展' : 'Strategic Roadmap'}</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                  {lang === 'zh' ? '投放看板分类段' : 'Initial Status'}
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as ColumnId)}
                  className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-neutral-800"
                >
                  <option value="todo">{lang === 'zh' ? '预约待编 (Backlog)' : 'Backlog Tasks'}</option>
                  <option value="progress">{lang === 'zh' ? '执行中柜 (Progress)' : 'In Progress'}</option>
                  <option value="review">{lang === 'zh' ? '评审阶段 (Review)' : 'Under Review'}</option>
                  <option value="done">{lang === 'zh' ? '极速已成 (Complete)' : 'Completed'}</option>
                </select>
              </div>
            </div>

            {/* Location */}
            <div className="md:col-span-2">
              <label className="block text-[9px] tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '指定研讨保密节点/场所' : 'Secure Vault Node or Venue'}
              </label>
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="e.g. Secure PGP Ledger Vault III / Studio Loft C"
                className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#1A1A1A]/10 mt-3">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] font-mono text-[9px] uppercase tracking-widest rounded-none"
            >
              {lang === 'zh' ? '取消起草' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1A1A1A] text-[#F9F8F6] font-mono font-bold text-[9px] uppercase tracking-widest rounded-none"
            >
              {lang === 'zh' ? '密封下发执行' : 'Seal and Dispatch'}
            </button>
          </div>
        </form>
      )}

      {/* TWO-COLUMN GRID IMPLEMENTING GOOGLE CALENDAR SPLIT INTERFACE OR DRIFTING KANBAN BOARD */}
      <div className="flex flex-col lg:flex-row gap-6 items-start" id="main-calendar-layout-engine">
        
        {/* LEFT COLUMN: Google Calendar Style sidebar widgets only visible in month / week / day view modes */}
        {viewMode !== 'kanban' && (
          <aside 
            className={`bg-white border-[#1A1A1A]/10 rounded-none shadow-sm flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
              isSidebarOpen 
                ? 'w-full lg:w-[280px] p-4 border opacity-100' 
                : 'w-0 lg:w-0 p-0 border-transparent opacity-0 pointer-events-none'
            }`} 
            id="calendar-left-widgetry"
          >
            <div className="space-y-6 flex flex-col min-w-[246px]">
            
            {/* A. Speed Dial "+ Create Event" Mini button inside sidebar */}
            <button 
              onClick={() => {
                setNewDate(selectedDate.toISOString().split('T')[0]);
                setShowAddForm(true);
              }}
              className="w-full py-2 bg-[#1A1A1A] text-white font-mono text-center hover:bg-[#2A2A2A] transition-all uppercase tracking-widest font-bold text-[10px] flex items-center justify-center gap-2 rounded-none"
            >
              <Plus className="w-3.5 h-3.5 text-amber-500" />
              <span>{lang === 'zh' ? '写新事件备忘' : 'Bespoke Task'}</span>
            </button>

            {/* B. Elegant interactive Mini-Month calendar widget */}
            <div className="space-y-2 border-t border-[#1A1A1A]/10 pt-4 text-center">
              <div className="flex items-center justify-between text-xs font-mono px-1">
                <span className="font-serif italic font-bold">
                  {selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })}
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => handleNavigateDiff(-1)} className="p-0.5 hover:bg-[#1A1A1A]/5 rounded-none border border-neutral-200">
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleNavigateToday()} className="px-1.5 text-[8px] font-mono font-bold hover:bg-[#1A1A1A]/5 border border-neutral-200">
                    T
                  </button>
                  <button onClick={() => handleNavigateDiff(1)} className="p-0.5 hover:bg-[#1A1A1A]/5 rounded-none border border-neutral-200">
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Day headers (S M T W T F S) */}
              <div className="grid grid-cols-7 gap-1 text-[8px] font-mono text-[#1A1A1A]/40 uppercase text-center font-bold">
                {lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'].map((d) => <span key={d}>{d}</span>) : ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => <span key={d}>{d}</span>)}
              </div>

              {/* Day dates grid cells */}
              <div className="grid grid-cols-7 gap-1">
                {miniCalendarDays.map((cell, idx) => {
                  const isCurrentSelection = selectedDate.toISOString().split('T')[0] === cell.dateString;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(new Date(cell.dateString));
                        setNewDate(cell.dateString);
                      }}
                      className={`py-1 text-[9px] font-mono transition-all text-center rounded-none relative ${
                        isCurrentSelection 
                          ? 'bg-[#1A1A1A] text-white font-bold' 
                          : cell.isToday 
                            ? 'border border-[#1A1A1A] text-[#1A1A1A] font-bold bg-[#1A1A1A]/5' 
                            : cell.isCurrentMonth 
                              ? 'text-neutral-800 hover:bg-[#1A1A1A]/5' 
                              : 'text-neutral-400/60 hover:bg-[#1A1A1A]/5'
                      }`}
                    >
                      <span>{cell.dayNum}</span>
                      {/* Event locator bullet */}
                      {events.some(e => isEventOnDate(e, cell.dateString)) && !isCurrentSelection && (
                        <span className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-amber-600 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* C. Bespoke Calendar categories toggle checkboxes (Google Calendar "My Calendars" list!) */}
            <div className="space-y-3 border-t border-[#1A1A1A]/10 pt-4" id="calendar-lists-categories">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest">
                <span>{lang === 'zh' ? '书案分类目录' : 'MY CALENDARS'}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleSelectAllCategories(true)} 
                    className="hover:text-[#1A1A1A] font-bold text-[8px]"
                  >
                    {lang === 'zh' ? '全选' : 'ALL'}
                  </button>
                  <button 
                    onClick={() => handleSelectAllCategories(false)} 
                    className="hover:text-red-800 font-bold text-[8px]"
                  >
                    {lang === 'zh' ? '清除' : 'CLEAR'}
                  </button>
                </div>
              </div>

              {/* Map list of categories checkboxes */}
              <div className="space-y-2 text-xs">
                {Object.entries(categoryMap).map(([key, info]) => {
                  const isChecked = visibleCategories[key] !== false;
                  return (
                    <label 
                      key={key} 
                      className="flex items-center gap-2.5 cursor-pointer hover:bg-[#1A1A1A]/5 p-1 px-1.5 transition select-none rounded-none text-[#1A1A1A]"
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleVisibleCategory(key)}
                        className="w-3.5 h-3.5 accent-[#1A1A1A] border-neutral-300 rounded-none cursor-pointer"
                      />
                      <span className={`w-2 h-2 rounded-full ${info.dot}`} />
                      <span className="font-mono text-[9px] uppercase tracking-wider flex-1">
                        {lang === 'zh' ? info.zhLabel : info.enLabel}
                      </span>
                      <span className="text-[9px] font-mono text-neutral-400">
                        ({events.filter(e => e.category === key).length})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* D. Elegant informational sidebar box */}
            <div className="bg-[#F9F8F6] border border-dashed border-[#1A1A1A]/15 p-3 text-[10px] space-y-1 text-[#1A1A1A]/55 font-mono uppercase tracking-wide">
              <div className="font-serif italic font-bold text-[#1A1A1A] capitalize text-xs mb-1 tracking-normal">
                {lang === 'zh' ? '保密沙箱保障' : 'SANDBOX ISOLATION SECURE'}
              </div>
              <p className="text-[9px] leading-relaxed text-[#1A1A1A]/60">
                {lang === 'zh' 
                  ? '此排字月历运行于高可靠的客户端状态，所有日记录直接注入 indexDB，支持敏捷拖拽和无损离线。'
                  : 'All calendars run strictly in a sandboxed runtime. Draggable elements automatically re-write dates in compliance.'}
              </p>
            </div>
            </div>
          </aside>
        )}

        {/* RIGHT COLUMN: The primary dynamic rendering views (Month grid, Week grid, Day list or classic Kanban) */}
        <section className="flex-grow flex-1 min-w-0 w-full">
          
          {/* Main workspace dynamic wrapper based on viewMode switch */}
          {viewMode === 'month' && (
            <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="month-grid-wrapper">
              
              {/* Google Calendar Style Month view header */}
              <div className="p-3 bg-neutral-50/50 border-b border-[#1A1A1A]/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleNavigateToday}
                    className="px-3.5 py-1 bg-white border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition text-[10px] font-bold tracking-widest uppercase rounded-none"
                  >
                    {lang === 'zh' ? `今天 ${todayDate.getDate()}日` : `TODAY ${todayDate.getDate()}`}
                  </button>
                  <div className="flex items-center border border-[#1A1A1A]/15 bg-white">
                    <button onClick={() => handleNavigateDiff(-1)} className="p-1 px-2.5 hover:bg-neutral-100 border-r border-[#1A1A1A]/10">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleNavigateDiff(1)} className="p-1 px-2.5 hover:bg-neutral-100">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="text-sm font-serif font-bold tracking-tight px-1 italic">
                    {selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>

                <div className="text-[9px] text-neutral-400 max-w-[200px] truncate">
                  {lang === 'zh' ? '💡 支持托拽事件到别日期，点击日期空白行增事件' : '💡 Tip: Drag and drop cards to rearrange dates.'}
                </div>
              </div>

              {/* 7 Days of the Week headings bar */}
              <div className="grid grid-cols-7 border-b border-[#1A1A1A]/10 text-center text-[10px] font-mono uppercase bg-neutral-50/30 text-neutral-500 py-2 select-none tracking-widest font-bold">
                {lang === 'zh' ? ['周日 Sun', '周一 Mon', '周二 Tue', '周三 Wed', '周四 Thu', '周五 Fri', '周六 Sat'].map(d => <div key={d}>{d}</div>) : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <div key={d}>{d}</div>)}
              </div>

              {/* Month Grid Cell Blocks - exactly 6 rows (42 slots) */}
              <div className="grid grid-cols-7 xl:grid-rows-6 auto-rows-fr border-t border-l border-[#1A1A1A]/10 bg-neutral-100/10 min-h-[550px]">
                {mainCalendarGridDays.map((cell, index) => {
                  // Filter events falling on this date and verified active filter query
                  const dayEvents = activeFilteredList.filter(e => isEventOnDate(e, cell.dateString));
                  
                  return (
                    <div
                      key={index}
                      onDragOver={(e) => handleDragOverDate(e, cell.dateString)}
                      onDrop={(e) => handleDropDate(e, cell.dateString)}
                      className={`border-r border-b border-[#1A1A1A]/10 p-2 min-h-[100px] transition-all flex flex-col justify-between ${
                        cell.isCurrentMonth ? 'bg-white' : 'bg-neutral-100 text-neutral-300'
                      } ${dragOverDate === cell.dateString ? 'bg-amber-500/15 ring-2 ring-[#1A1A1A] ring-inset' : ''}`}
                    >
                      {/* Day Header index number & trigger quick-add popover */}
                      <div className="flex items-center justify-between pointer-events-auto">
                        <button
                          onClick={() => {
                            setQuickAddDate(cell.dateString);
                            setQuickAddTitle('');
                          }}
                          className="p-1 hover:bg-[#1A1A1A]/5 text-[9px] text-[#1A1A1A]/35 hover:text-[#1A1A1A] font-mono tracking-wider flex items-center gap-0.5 rounded-none"
                          title={lang === 'zh' ? '在这一天快捷新增记事' : 'Quick task on this date'}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>ADD</span>
                        </button>
                        
                        <span className={`text-xs font-mono font-bold p-1 px-2 ${
                          cell.isToday
                            ? 'bg-[#1A1A1A] text-[#F9F8F6] font-extrabold'
                            : cell.isCurrentMonth
                              ? 'text-[#1A1A1A]'
                              : 'text-neutral-300'
                        }`}>
                          {cell.dayNum}
                        </span>
                      </div>

                      {/* Small list of events on this day */}
                      <div className="flex-1 mt-1.5 space-y-[2px] overflow-y-auto max-h-[85px] scroller-hidden">
                        {dayEvents.map(item => {
                          const catInfo = categoryMap[item.category] || categoryMap.creative;
                          const isCrossDay = item.endDate && item.endDate !== item.date;
                          
                          let spanClass = "";
                          let roundedClass = "rounded-none";
                          if (isCrossDay) {
                            if (cell.dateString === item.date) {
                              spanClass = "mr-[-10px] ml-0 border-r-0";
                              roundedClass = "rounded-l-sm rounded-r-none";
                            } else if (cell.dateString === item.endDate) {
                              spanClass = "ml-[-10px] mr-0 border-l-0";
                              roundedClass = "rounded-r-sm rounded-l-none";
                            } else {
                              spanClass = "ml-[-10px] mr-[-10px] border-x-0";
                              roundedClass = "rounded-none";
                            }
                          }

                          return (
                            <div
                              key={`${item.id}-${cell.dateString}`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => handleOpenEventModal(item, e)}
                              className={`p-0.5 px-1 md:py-1 transition-all text-[9.5px] cursor-grab active:cursor-grabbing truncate font-mono select-none flex items-center justify-between ${
                                isCrossDay
                                  ? `border-y ${catInfo.solidBg} ${spanClass} ${roundedClass}`
                                  : `border-y border-r border-l-[3.5px] ${catInfo.pastelBg} ${catInfo.borderColor} rounded-none hover:bg-[#1A1A1A] hover:text-white`
                              }`}
                              title={`${item.time} - ${item.title} (${isCrossDay ? (lang === 'zh' ? '跨日日程' : 'Cross-date duration') : ''})`}
                            >
                              <div className="flex items-center gap-1 truncate w-full">
                                <span className={`text-[8px] shrink-0 font-bold ${isCrossDay ? 'text-[#F9F8F6]/80' : 'text-[#1A1A1A]/50'}`}>
                                  {isCrossDay ? '⇄' : item.time}
                                </span>
                                <span className={`truncate ${isCrossDay ? 'text-[#F9F8F6] font-bold' : ''}`}>{item.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Quick inline creation widget if toggled for this day */}
                      {quickAddDate === cell.dateString && (
                        <div className="mt-2 p-1.5 border border-amber-900/40 bg-amber-50/5 text-left z-10 animate-scaleUp">
                          <form onSubmit={handleQuickAddSubmit} className="space-y-1.5">
                            <input 
                              type="text"
                              required
                              autoFocus
                              placeholder={lang === 'zh' ? '指令书写 (回车保存)' : 'Title... + ENTER'}
                              value={quickAddTitle}
                              onChange={(e) => setQuickAddTitle(e.target.value)}
                              className="w-full text-[9px] p-1 bg-white border border-[#1A1A1A]/20 outline-none rounded-none"
                            />
                            <div className="flex justify-between items-center text-[7.5px] font-mono uppercase tracking-widest text-neutral-400">
                              <span>PRESET: CREATIVE</span>
                              <button 
                                type="button" 
                                onClick={() => setQuickAddDate(null)}
                                className="text-red-700 hover:underline"
                              >
                                CLOSE
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: Weekly timeline list view resembling calendar metrics */}
          {viewMode === 'week' && (
            <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="week-timeline-wrapper">
              
              <div className="p-3.5 bg-neutral-50/50 border-b border-[#1A1A1A]/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleNavigateToday}
                    className="px-3 py-1 bg-white border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition text-[9px] font-bold tracking-widest uppercase rounded-none"
                  >
                    {lang === 'zh' ? '回到本周' : 'THIS WEEK'}
                  </button>
                  <div className="flex items-center border border-[#1A1A1A]/15 bg-white">
                    <button onClick={() => handleNavigateDiff(-1)} className="p-1 px-2 hover:bg-neutral-100 border-r border-[#1A1A1A]/10">
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleNavigateDiff(1)} className="p-1 px-2 hover:bg-neutral-100">
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <h3 className="text-xs font-serif font-bold italic">
                    WEEK DURATION RANGE OF: {currentWeekDaysList[0].dateString} to {currentWeekDaysList[6].dateString}
                  </h3>
                </div>
              </div>

              {/* 7 Columns Grid representing Week view days */}
              <div className="grid grid-cols-1 md:grid-cols-7 border-b border-[#1A1A1A]/10">
                {currentWeekDaysList.map((day, idx) => {
                  const dayEventsList = activeFilteredList.filter(e => isEventOnDate(e, day.dateString));
                  
                  return (
                    <div 
                      key={idx} 
                      onDragOver={(e) => handleDragOverDate(e, day.dateString)}
                      onDrop={(e) => handleDropDate(e, day.dateString)}
                      className={`border-r last:border-r-0 border-[#1A1A1A]/10 min-h-[450px] flex flex-col p-3 bg-white ${
                        day.isToday ? 'bg-[#1A1A1A]/5 shadow-inner' : ''
                      } ${dragOverDate === day.dateString ? 'bg-amber-500/10' : ''}`}
                    >
                      {/* Day Header details */}
                      <div className="pb-2 border-b border-dashed border-[#1A1A1A]/10 flex items-center justify-between">
                        <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">{day.label}</span>
                        <span className={`text-xs font-mono font-bold w-6 h-6 flex items-center justify-center ${
                          day.isToday ? 'bg-[#1A1A1A] text-[#F9F8F6] rounded-none' : 'text-[#1A1A1A]'
                        }`}>
                          {day.dayNum}
                        </span>
                      </div>

                      {/* Day specific events block timeline */}
                      <div className="flex-1 mt-3 space-y-[3px] overflow-y-auto max-h-[400px]">
                        {dayEventsList.length === 0 ? (
                          <div className="h-32 border border-dashed border-[#1A1A1A]/10 flex items-center justify-center p-2 text-center">
                            <span className="text-[8px] font-mono text-neutral-400 uppercase tracking-wider">
                              {lang === 'zh' ? '暂无安排' : 'EMPTY CELL'}
                            </span>
                          </div>
                        ) : (
                          dayEventsList.map(item => {
                            const catInfo = categoryMap[item.category] || categoryMap.creative;
                            const isCrossDay = item.endDate && item.endDate !== item.date;
                            return (
                              <div
                                key={`${item.id}-${day.dateString}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleOpenEventModal(item)}
                                className={`p-2.5 transition-all text-left text-[10px] cursor-grab active:cursor-grabbing space-y-1 rounded-none shadow-xs ${
                                  isCrossDay
                                    ? `border ${catInfo.solidBg}`
                                    : `border-y border-r border-l-[4px] ${catInfo.pastelBg} ${catInfo.borderColor} hover:bg-[#1A1A1A] hover:text-[#F9F8F6]`
                                }`}
                              >
                                <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider">
                                  <span className={`flex items-center gap-1 ${isCrossDay ? 'text-[#F9F8F6]/85 font-mono' : 'text-neutral-400'}`}>
                                    <Clock className="w-2.5 h-2.5 text-[#1A1A1A]/50 group-hover:text-white" />
                                    {item.time}
                                  </span>
                                  <span className={isCrossDay ? 'text-[#F9F8F6]/90 font-bold' : catInfo.textAccent}>{item.category.toUpperCase()}</span>
                                </div>
                                <h4 className={`font-bold leading-tight font-sans truncate ${isCrossDay ? 'text-[#F9F8F6]' : 'text-neutral-800'}`}>{item.title}</h4>
                                <p className={`text-[8.5px] italic truncate ${isCrossDay ? 'text-[#F9F8F6]/75' : 'text-[#1A1A1A]/50'}`}>{item.location}</p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: Hour timelines for a single selected date focus option */}
          {viewMode === 'day' && (
            <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="day-timeline-wrapper">
              
              <div className="p-4 bg-neutral-50/50 border-b border-[#1A1A1A]/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleNavigateToday}
                    className="px-3 py-1 bg-white border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition text-[9px] font-bold tracking-widest uppercase rounded-none"
                  >
                    {lang === 'zh' ? '回到今天' : 'REF TODAY'}
                  </button>
                  <div className="flex items-center border border-[#1A1A1A]/15 bg-white">
                    <button onClick={() => handleNavigateDiff(-1)} className="p-1 px-2.5 hover:bg-neutral-100 border-r border-[#1A1A1A]/10">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleNavigateDiff(1)} className="p-1 px-2.5 hover:bg-neutral-100">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="text-sm font-serif font-bold italic">
                    SPECIFIC SINGLE DAY FOCUS SPHERE: {selectedDate.toISOString().split('T')[0]}
                  </h3>
                </div>
              </div>

              {/* Day focus rendering list */}
              <div className="p-6 max-w-3xl mx-auto space-y-6">
                
                <div className="pb-3 border-b border-[#1A1A1A]/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h2 className="text-xl font-serif text-[#1A1A1A] font-bold italic uppercase tracking-tight">
                      {selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </h2>
                    <p className="text-[9px] font-mono text-[#1A1A1A]/50 uppercase tracking-widest">
                      CHRONOS REGISTRY HOUR LOGS
                    </p>
                  </div>
                  {selectedDate.toISOString().split('T')[0] === todayString && (
                    <span className="bg-red-800 text-[#F9F8F6] px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest animate-pulse">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Event list */}
                <div className="space-y-3">
                  {activeFilteredList.filter(e => isEventOnDate(e, selectedDate.toISOString().split('T')[0])).length === 0 ? (
                    <div className="p-12 border border-dashed border-[#1A1A1A]/15 max-w-lg mx-auto text-center space-y-2">
                      <span className="text-xs font-serif italic text-neutral-400">
                        {lang === 'zh' ? '这个特定日期暂无下发的信条或战略工作。' : 'Silence and solitude on this calendar index.'}
                      </span>
                      <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">
                        {lang === 'zh' ? '点击侧边栏的 "+写新事件" 键以部署' : 'Use the "+ Bespoke Task" button to schedule something.'}
                      </p>
                    </div>
                  ) : (
                    activeFilteredList
                      .filter(e => isEventOnDate(e, selectedDate.toISOString().split('T')[0]))
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((item, idx) => {
                        const catInfo = categoryMap[item.category] || categoryMap.creative;
                        const isRange = item.endDate && item.endDate !== item.date;
                        return (
                          <div 
                            key={idx}
                            onClick={() => handleOpenEventModal(item)}
                            className={`p-4 border hover:border-[#1A1A1A]/30 transition bg-white shadow-sm flex items-start gap-4 cursor-pointer`}
                          >
                            <div className="text-center font-mono py-1 border-r border-[#1A1A1A]/10 pr-4 shrink-0 min-w-[70px]">
                              <p className="text-xs font-bold text-[#1A1A1A]/80 flex items-center gap-1 justify-center">
                                <Clock className="w-3.5 h-3.5 text-amber-800" />
                                <span>{item.time}</span>
                              </p>
                              <span className="text-[8px] text-neutral-400 uppercase tracking-wider block mt-1">
                                {isRange ? (
                                  <span>{item.date.substring(5)} ~ {item.endDate!.substring(5)}</span>
                                ) : (
                                  item.date.substring(5)
                                )}
                              </span>
                            </div>

                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[8px] font-mono uppercase px-2 py-0.5 border ${catInfo.color}`}>
                                  {lang === 'zh' ? catInfo.zhLabel : catInfo.enLabel}
                                </span>
                                <span className="text-neutral-400 text-xs font-mono">•</span>
                                <span className="text-[9px] text-[#1A1A1A]/60 font-mono tracking-widest uppercase flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5" />
                                  <span>{item.location}</span>
                                </span>
                              </div>

                              <h3 className="text-sm font-sans font-bold text-[#1A1A1A] leading-snug">{item.title}</h3>
                              <p className="text-xs font-serif italic text-[#1A1A1A]/60 leading-relaxed">{item.subtitle}</p>
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span className={`text-[9px] font-mono px-2 py-0.5 border uppercase ${
                                item.status === 'done' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                item.status === 'review' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                                item.status === 'progress' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                'bg-zinc-100 text-zinc-700 border-zinc-200'
                              }`}>
                                {item.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: The standard premium drag-and-drop Kanban View (Chronos board) */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 align-stretch" id="kanban-lanes-master">
              {columns.map((col) => {
                const columnEvents = getKanbanEventsForColumn(col.id);
                const isOver = dragOverColumn === col.id;
                
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => handleDragOverColumn(e, col.id)}
                    onDrop={(e) => handleDropColumn(e, col.id)}
                    className={`flex flex-col min-h-[500px] p-4 border transition-all rounded-none ${col.colorClass} ${
                      isOver ? col.borderFocus + ' ring-1 ring-[#1A1A1A]/10 bg-[#F9F8F6]' : 'border-[#1A1A1A]/10 bg-white shadow-xs'
                    }`}
                  >
                    {/* Lane Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-[#1A1A1A]/10 mb-4 select-none">
                      <div className="space-y-0.5">
                        <h4 className="text-[11px] font-sans font-bold tracking-wider text-[#1A1A1A] uppercase flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            col.id === 'todo' ? 'bg-zinc-500' :
                            col.id === 'progress' ? 'bg-amber-500' :
                            col.id === 'review' ? 'bg-indigo-500' :
                            'bg-emerald-500'
                          }`} />
                          <span>{lang === 'zh' ? col.zhTitle : col.enTitle}</span>
                        </h4>
                        <p className="text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest">
                          {col.id.toUpperCase()} STATUS
                        </p>
                      </div>
                      <span className="text-[10px] font-mono bg-[#1A1A1A] text-[#F9F8F6] px-2 py-0.5 font-bold">
                        {columnEvents.length}
                      </span>
                    </div>

                    {/* Column Kanban Lane List Body */}
                    <div className="flex-grow space-y-3 overflow-y-auto max-h-[600px] pr-1">
                      {columnEvents.length === 0 ? (
                        <div className="h-44 border border-dashed border-[#1A1A1A]/10 flex flex-col items-center justify-center p-4 text-center select-none bg-neutral-50/20">
                          <p className="text-[10px] font-serif italic text-neutral-400">
                            {lang === 'zh' ? '暂无处于该阶段安排' : 'No active manuscripts'}
                          </p>
                          <button 
                            type="button"
                            onClick={() => {
                              setNewStatus(col.id);
                              setShowAddForm(true);
                            }}
                            className="text-[8.5px] font-mono text-[#1A1A1A]/60 hover:text-[#1A1A1A] mt-1 underline uppercase tracking-widest"
                          >
                            + {lang === 'zh' ? '签发于此' : 'Draft Here'}
                          </button>
                        </div>
                      ) : (
                        columnEvents.map((item) => {
                          const info = categoryMap[item.category] || categoryMap.creative;
                          const isCardDragging = draggingId === item.id;
                          
                          return (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragEnd={handleDragEnd}
                              onClick={() => handleOpenEventModal(item)}
                              className={`group relative border bg-white p-4 transition-all cursor-grab active:cursor-grabbing hover:shadow-md ${
                                isCardDragging ? 'opacity-30 border-dashed border-[#1A1A1A]/20' : 'border-[#1A1A1A]/10 hover:border-[#1A1A1A]/30'
                              }`}
                            >
                              {/* Grab Handle Indication */}
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 select-none text-[#1A1A1A]/40">
                                <span className="text-[8px] font-mono uppercase tracking-widest">DRAG</span>
                                <Move className="w-3 h-3" />
                              </div>

                              {/* Card Class Badge & Clock Time */}
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${info.color}`}>
                                  {lang === 'zh' ? info.zhLabel : info.enLabel}
                                </span>
                                <span className="text-[8px] font-mono text-[#1A1A1A]/45 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {item.time}
                                </span>
                              </div>

                              {/* Title and details */}
                              <h5 className="text-xs font-bold font-sans text-[#1A1A1A] leading-tight mb-1 truncate">
                                {item.title}
                              </h5>
                              <p className="text-[9.5px] leading-relaxed text-[#1A1A1A]/60 font-serif italic mb-3 line-clamp-2">
                                {item.subtitle}
                              </p>

                              {/* Location Pin & Date */}
                              <div className="flex items-center justify-between pt-2 border-t border-[#1A1A1A]/5 text-[8.5px] font-mono uppercase tracking-wider text-[#1A1A1A]/50 select-none">
                                <span className="flex items-center gap-1 max-w-[124px] truncate">
                                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">{item.location}</span>
                                </span>
                                <span>{item.date}</span>
                              </div>

                              {/* Manual layout adjustment buttons under hover */}
                              <div className="mt-3.5 pt-2 border-t border-neutral-100 flex items-center justify-between opacity-30 group-hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => handleShiftCard(item.id, 'back', e)}
                                    disabled={col.id === 'todo'}
                                    className="p-1 border border-[#1A1A1A]/10 text-neutral-600 hover:bg-neutral-50 disabled:opacity-20 rounded-none"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                  <span className="text-[8px] font-mono tracking-widest uppercase px-1 text-neutral-400">SHIFT</span>
                                  <button
                                    onClick={(e) => handleShiftCard(item.id, 'forward', e)}
                                    disabled={col.id === 'done'}
                                    className="p-1 border border-[#1A1A1A]/10 text-neutral-600 hover:bg-neutral-50 disabled:opacity-20 rounded-none"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteEvent(item.id, e)}
                                  className="p-1 text-red-800 hover:bg-red-50 transition-all rounded-none"
                                  title={lang === 'zh' ? '删除卡片' : 'Purge card'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* EVENT DETAIL VIEW VIEW/EDIT MODAL OVERLAY (GOOGLE CALENDAR DIALOG STYLE, ATELIER LOOK) */}
      {selectedEventForView && (
        <div className="fixed inset-0 bg-[#1A1A1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border-2 border-[#1A1A1A] max-w-lg w-full p-6 space-y-4 shadow-xl relative animate-scaleUp">
            
            {/* Modal header actions */}
            <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
              <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                <Info className="w-3 h-3" />
                <span>CHRONOS MANUSCRIPT RECORD : {selectedEventForView.id}</span>
              </span>
              <button 
                onClick={() => {
                  setSelectedEventForView(null);
                  setIsEditingInModal(false);
                }}
                className="p-1 hover:bg-[#1A1A1A]/5 rounded-none text-neutral-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If NOT editing: show pristine typography details */}
            {!isEditingInModal ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-mono uppercase px-2 py-0.5 border ${categoryMap[selectedEventForView.category].color}`}>
                      {lang === 'zh' ? categoryMap[selectedEventForView.category].zhLabel : categoryMap[selectedEventForView.category].enLabel}
                    </span>
                    <span className={`text-[8px] font-mono uppercase px-2 py-0.5 border ${
                      selectedEventForView.status === 'done' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      selectedEventForView.status === 'review' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                      selectedEventForView.status === 'progress' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-zinc-100 text-zinc-700 border-zinc-200'
                    }`}>
                      {selectedEventForView.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-base font-sans font-bold text-[#1A1A1A] leading-snug">{selectedEventForView.title}</h3>
                  <p className="text-xs font-serif italic text-neutral-500 leading-relaxed">{selectedEventForView.subtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-[#F9F8F6] p-3 border border-[#1A1A1A]/10 font-mono text-neutral-600">
                  <div className="space-y-1">
                    <p className="text-[8px] text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '日程期间' : 'DATE RANGE'}</p>
                    <p className="font-bold text-[#1A1A1A]">
                      {selectedEventForView.endDate && selectedEventForView.endDate !== selectedEventForView.date ? (
                        <span>{selectedEventForView.date} {lang === 'zh' ? '至' : 'to'} {selectedEventForView.endDate}</span>
                      ) : (
                        selectedEventForView.date
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '精确时刻' : 'SCHED TIMELINE'}</p>
                    <p className="font-bold text-[#1A1A1A] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{selectedEventForView.time}</span>
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2 mt-1 pt-1.5 border-t border-neutral-200/50">
                    <p className="text-[8px] text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '保密地址保密节点' : 'VENUE LOCATION'}</p>
                    <p className="font-bold text-[#1A1A1A] flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{selectedEventForView.location}</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(selectedEventForView.id)}
                    className="px-4 py-1.5 bg-red-50 text-red-800 hover:bg-red-100 border border-red-200 text-[10px] font-mono uppercase tracking-widest rounded-none"
                  >
                    {lang === 'zh' ? '销毁日程' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingInModal(true)}
                    className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5 rounded-none"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>{lang === 'zh' ? '修改编纂' : 'Revise'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* If EDITING: show elegant input fields */
              <form onSubmit={handleSaveModalEdits} className="space-y-3.5">
                <div>
                  <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '标题' : 'TITLE'}</label>
                  <input 
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none outline-none focus:border-[#1A1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '内容' : 'SUBTITLE'}</label>
                  <textarea 
                    value={editSubtitle}
                    onChange={(e) => setEditSubtitle(e.target.value)}
                    className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none outline-none focus:border-[#1A1A1A] h-16"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '起始日期' : 'START DATE'}</label>
                    <input 
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '结束日期' : 'END DATE'}</label>
                    <input 
                      type="date"
                      required
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      min={editDate}
                      className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '时间' : 'TIME'}</label>
                    <input 
                      type="time"
                      required
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '分类' : 'CATEGORY'}</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as any)}
                      className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none"
                    >
                      <option value="creative">{lang === 'zh' ? '创意与排版' : 'Creative & Design'}</option>
                      <option value="finance">{lang === 'zh' ? '资产与发票' : 'Capital & Flows'}</option>
                      <option value="secure">{lang === 'zh' ? '保密机制' : 'Citadel Security'}</option>
                      <option value="strategy">{lang === 'zh' ? '战略圆桌会议' : 'Strategic'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '执行阶段' : 'STAGE'}</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none"
                    >
                      <option value="todo">TODO</option>
                      <option value="progress">PROGRESS</option>
                      <option value="review">REVIEW</option>
                      <option value="done">COMPLETED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '会场场所' : 'LOCATION'}</label>
                  <input 
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setIsEditingInModal(false)}
                    className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 text-[10px] font-mono uppercase tracking-widest rounded-none"
                  >
                    {lang === 'zh' ? '返回详情' : 'Back'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-[10px] font-mono uppercase tracking-widest rounded-none"
                  >
                    {lang === 'zh' ? '确认保存变动' : 'Save revision'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Aesthetic Suite Footer statistics info */}
      <footer className="bg-white border border-[#1A1A1A]/10 p-4 flex flex-col md:flex-row items-center justify-between text-[10px] font-mono text-[#1A1A1A]/50 uppercase tracking-widest gap-2 select-none">
        <div className="flex gap-4 flex-wrap items-center">
          <span>{lang === 'zh' ? '双重沙盒隔离:' : 'SANDBOX STATUS:'} <strong className="text-emerald-800">ISOLATION SECURE</strong></span>
          <span className="hidden md:inline text-zinc-300">|</span>
          <span>{lang === 'zh' ? '本地记事项:' : 'TOTAL ENGAGEMENTS RECORDED:'} <strong className="text-[#1A1A1A]">{events.length}</strong></span>
          <span className="hidden md:inline text-zinc-300">|</span>
          <span>{lang === 'zh' ? '筛选匹配数:' : 'ACTIVE RESULTS:'} <strong className="text-[#1A1A1A]">{activeFilteredList.length}</strong></span>
        </div>
        <div className="flex items-center gap-1 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{lang === 'zh' ? '本地沙盒自旋同步完毕' : 'Local matrix synchronize complete'}</span>
        </div>
      </footer>
    </div>
  );
}
