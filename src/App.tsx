import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Calendar, 
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Settings,
  CheckSquare,
  Square,
  AlertTriangle,
  BarChart2,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  format, 
  differenceInCalendarDays, 
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  parseISO,
  addMinutes,
  subMinutes,
  addDays,
  addMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  PieChart, 
  Pie,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { Bell, AlertCircle, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  createdAt: string;
  lastUpdatedAt?: string;
  dueDate?: string;
  nextUpdateType?: '15' | '30' | '60' | 'D1' | 'D2' | 'D3' | 'D5' | 'D7' | 'D14' | 'M1';
  recurrentDates?: string[];
}

type SortBy = 'date' | 'lastUpdate' | 'name' | 'dueDate' | 'status' | 'daysUA' | 'daysPA' | 'recurrentCount' | 'prazo';
type SortOrder = 'asc' | 'desc';

const getRecurrencePriorityDate = (recurrentDates: string[]) => {
  if (!recurrentDates || recurrentDates.length === 0) return null;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const sorted = [...recurrentDates].sort();
  const nextDate = sorted.find(d => d >= todayStr);
  if (nextDate) return nextDate;
  return sorted[sorted.length - 1];
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('taskmaster_tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isAdding, setIsAdding] = useState(false);
  const [keywordSearch, setKeywordSearch] = useState('');
  const [showPending, setShowPending] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Column Filters
  const [nameFilter, setNameFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [lastUpdateFilter, setLastUpdateFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [recurrentFilter, setRecurrentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [prazoFilter, setPrazoFilter] = useState('');
  const [daysUAFilter, setDaysUAFilter] = useState('');
  const [daysPAFilter, setDaysPAFilter] = useState('');
  
  // Time-based filtering
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const [isUpdatedFilter, setIsUpdatedFilter] = useState(true);
  const [isScheduledFilter, setIsScheduledFilter] = useState(false);
  
  // Recurrence Selection State
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [currentMonthView, setCurrentMonthView] = useState(new Date());
  
  // Editing State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [editingNextUpdateId, setEditingNextUpdateId] = useState<string | null>(null);
  const [editNextUpdateValue, setEditNextUpdateValue] = useState('');
  
  const [isExpandedAll, setIsExpandedAll] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifications, setNotifications] = useState<{id: string, title: string, taskId: string, type: 'soon' | 'overdue'}[]>([]);
  const [notifiedTasks, setNotifiedTasks] = useState<Set<string>>(new Set());

  // Close recurrence picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activePicker) {
        const picker = document.getElementById(`picker-${activePicker}`);
        const button = document.getElementById(`btn-picker-${activePicker}`);
        if (picker && !picker.contains(event.target as Node) && 
            button && !button.contains(event.target as Node)) {
          setActivePicker(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activePicker]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('taskmaster_theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [appTitle, setAppTitle] = useState(() => {
    const saved = localStorage.getItem('taskmaster_title');
    return saved || 'Lista de Pendências';
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(new Date());
  const [reportEndDate, setReportEndDate] = useState(new Date());
  const [reportSearch, setReportSearch] = useState('');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Save theme and title to localStorage
  useEffect(() => {
    localStorage.setItem('taskmaster_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('taskmaster_title', appTitle);
  }, [appTitle]);

  // Update current time every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Check for tasks entering "Em breve" or "Atrasado" state
  useEffect(() => {
    tasks.forEach(task => {
      if (task.status === 'completed' || !task.dueDate) return;
      
      const due = new Date(task.dueDate);
      const fifteenMinsBefore = subMinutes(due, 15);
      const now = currentTime;
      
      // Notification for "Em Breve"
      const soonKey = `soon-${task.id}-${task.dueDate}`;
      if (now > fifteenMinsBefore && now <= due && !notifiedTasks.has(soonKey)) {
        const newNotification = {
          id: Math.random().toString(36).substr(2, 9),
          title: `Tarefa "${task.title}" vence em breve!`,
          taskId: task.id,
          type: 'soon' as const
        };
        setNotifications(prev => [...prev, newNotification]);
        setNotifiedTasks(prev => new Set(prev).add(soonKey));
      }

      // Notification for "Atrasado"
      const overdueKey = `overdue-${task.id}-${task.dueDate}`;
      if (now > due && !notifiedTasks.has(overdueKey)) {
        const newNotification = {
          id: Math.random().toString(36).substr(2, 9),
          title: `Tarefa "${task.title}" está ATRASADA!`,
          taskId: task.id,
          type: 'overdue' as const
        };
        setNotifications(prev => [...prev, newNotification]);
        setNotifiedTasks(prev => new Set(prev).add(overdueKey));
      }
    });
  }, [tasks, currentTime, notifiedTasks]);
  
  // New Task Form State
  const [newTitle, setNewTitle] = useState('');
  const [newNextUpdateType, setNewNextUpdateType] = useState<'15' | '30' | '60' | 'D1' | 'D2' | 'D3' | 'D5' | 'D7' | 'D14' | 'M1' | null>(null);

  useEffect(() => {
    localStorage.setItem('taskmaster_tasks', JSON.stringify(tasks));
  }, [tasks]);

  const toggleLineStatus = (taskId: string, lineIndex: number) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        const lines = task.title.split('\n');
        const line = lines[lineIndex];
        
        // Regex to match timestamp and optional status
        const lineRegex = /^(\d{2}\/\d{2}\/\d{2} (?:[A-Z]{3} )?\d{2}:\d{2}:\d{2} - )?(\([VR]\) )?(.*)/;
        const match = line.match(lineRegex);
        
        if (match) {
          const timestamp = match[1] || '';
          const currentStatus = match[2] || '';
          const content = match[3] || '';
          
          let nextStatus = '(R) ';
          if (currentStatus === '(R) ') nextStatus = '(V) ';
          else if (currentStatus === '(V) ') nextStatus = '(R) ';
          else nextStatus = '(R) '; // Default to Red on first click
          
          lines[lineIndex] = `${timestamp}${nextStatus}${content}`;
          return { ...task, title: lines.join('\n'), lastUpdatedAt: new Date().toISOString() };
        }
      }
      return task;
    }));
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    let dueDate: string | undefined = undefined;
    if (newNextUpdateType) {
      const base = new Date();
      let nextDate: Date;
      switch (newNextUpdateType) {
        case '15': nextDate = addMinutes(base, 15); break;
        case '30': nextDate = addMinutes(base, 30); break;
        case '60': nextDate = addMinutes(base, 60); break;
        case 'D1': nextDate = addDays(base, 1); break;
        case 'D2': nextDate = addDays(base, 2); break;
        case 'D3': nextDate = addDays(base, 3); break;
        case 'D5': nextDate = addDays(base, 5); break;
        case 'D7': nextDate = addDays(base, 7); break;
        case 'D14': nextDate = addDays(base, 14); break;
        case 'M1': nextDate = addMonths(base, 1); break;
        default: nextDate = base;
      }
      dueDate = nextDate.toISOString();
    }

    const now = new Date();
    const timestamp = `${format(now, 'yy/MM/dd')} ${format(now, 'eee', { locale: ptBR }).replace('.', '').toUpperCase()} ${format(now, 'HH:mm:ss')}`;
    
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: `${timestamp} - ${newTitle}`,
      status: 'pending',
      createdAt: now.toISOString(),
      lastUpdatedAt: now.toISOString(),
      dueDate,
      nextUpdateType: newNextUpdateType || undefined,
    };

    setTasks([newTask, ...tasks]);
    setNewTitle('');
    setNewNextUpdateType(null);
    setIsAdding(false);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => 
      t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const handleManualNextUpdate = (id: string, value: string) => {
    if (!value) return;
    setTasks(tasks.map(t => {
      if (t.id === id) {
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) return t;
          
          let finalDueDate = date.toISOString();
          const priorityDate = getRecurrencePriorityDate(t.recurrentDates || []);
          if (priorityDate) {
            const timePart = format(date, 'HH:mm:ss');
            finalDueDate = new Date(`${priorityDate}T${timePart}`).toISOString();
          }
          
          return { ...t, dueDate: finalDueDate, nextUpdateType: undefined };
        } catch {
          return t;
        }
      }
      return t;
    }));
    setEditingNextUpdateId(null);
  };

  const setNextUpdate = (id: string, type: '15' | '30' | '60' | 'D1' | 'D2' | 'D3' | 'D5' | 'D7' | 'D14' | 'M1') => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        // Toggle off if clicking the same active button
        if (t.nextUpdateType === type) {
          let newDueDate = undefined;
          if (t.recurrentDates && t.recurrentDates.length > 0) {
            const oldestDate = [...t.recurrentDates].sort()[0];
            const baseTime = t.lastUpdatedAt ? new Date(t.lastUpdatedAt) : new Date(t.createdAt);
            const timePart = format(baseTime, 'HH:mm:ss');
            newDueDate = new Date(`${oldestDate}T${timePart}`).toISOString();
          }
          return { ...t, dueDate: newDueDate, nextUpdateType: undefined };
        }

        const base = t.lastUpdatedAt ? new Date(t.lastUpdatedAt) : new Date(t.createdAt);
        let nextDate: Date;

        switch (type) {
          case '15': nextDate = addMinutes(base, 15); break;
          case '30': nextDate = addMinutes(base, 30); break;
          case '60': nextDate = addMinutes(base, 60); break;
          case 'D1': nextDate = addDays(base, 1); break;
          case 'D2': nextDate = addDays(base, 2); break;
          case 'D3': nextDate = addDays(base, 3); break;
          case 'D5': nextDate = addDays(base, 5); break;
          case 'D7': nextDate = addDays(base, 7); break;
          case 'D14': nextDate = addDays(base, 14); break;
          case 'M1': nextDate = addMonths(base, 1); break;
          default: nextDate = base;
        }

        return { ...t, dueDate: nextDate.toISOString(), nextUpdateType: type };
      }
      return t;
    }));
  };

  const toggleRecurrentDate = (id: string, date: string) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const current = t.recurrentDates || [];
        const exists = current.includes(date);
        const newDates = exists 
          ? current.filter(d => d !== date)
          : [...current, date].sort();
        
        let newDueDate = t.dueDate;
        if (!t.nextUpdateType && newDates.length > 0) {
          const oldestDate = [...newDates].sort()[0];
          const baseTime = t.lastUpdatedAt ? new Date(t.lastUpdatedAt) : new Date(t.createdAt);
          const timePart = format(baseTime, 'HH:mm:ss');
          newDueDate = new Date(`${oldestDate}T${timePart}`).toISOString();
        } else if (!t.nextUpdateType && newDates.length === 0) {
          newDueDate = undefined;
        }

        return { ...t, recurrentDates: newDates, dueDate: newDueDate };
      }
      return t;
    }));
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = () => {
    if (!editingTaskId || !editTitle.trim()) {
      setEditingTaskId(null);
      return;
    }
    setTasks(tasks.map(t => {
      if (t.id === editingTaskId) {
        const hasChanged = t.title !== editTitle;
        if (hasChanged) {
          const now = new Date();
          return { 
            ...t, 
            title: editTitle, 
            lastUpdatedAt: now.toISOString()
          };
        }
        return t;
      }
      return t;
    }));
    setEditingTaskId(null);
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
  };

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonthView));
    const end = endOfWeek(endOfMonth(currentMonthView));
    return eachDayOfInterval({ start, end });
  }, [currentMonthView]);

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter(task => {
      const getPrazoStatus = (t: Task) => {
        if (!t.dueDate) return '-';
        const due = new Date(t.dueDate);
        const fifteenMinsBefore = subMinutes(due, 15);
        const now = currentTime;
        if (now > due) return 'Atrasado';
        if (now > fifteenMinsBefore) return 'Em breve';
        return 'Em tempo';
      };

      const statusText = task.status === 'completed' ? 'concluída' : 'pendente';
      const prazoText = getPrazoStatus(task);

      const activeQueries = keywordSearch.split(';').map(q => q.trim()).filter(q => q !== '');
      const matchesSearch = activeQueries.length === 0 || activeQueries.some(query => {
        const q = query.toLowerCase();
        const createdAtDay = format(new Date(task.createdAt), 'eee', { locale: ptBR }).replace('.', '').toLowerCase();
        const lastUpdateDay = task.lastUpdatedAt ? format(new Date(task.lastUpdatedAt), 'eee', { locale: ptBR }).replace('.', '').toLowerCase() : '';
        const dueDateDay = task.dueDate ? format(new Date(task.dueDate), 'eee', { locale: ptBR }).replace('.', '').toLowerCase() : '';
        const recurrentDays = task.recurrentDates?.map(d => format(new Date(d), 'eee', { locale: ptBR }).replace('.', '').toLowerCase()).join(' ') || '';

        return task.title.toLowerCase().includes(q) || 
               statusText.includes(q) ||
               prazoText.toLowerCase().includes(q) ||
               createdAtDay.includes(q) ||
               lastUpdateDay.includes(q) ||
               dueDateDay.includes(q) ||
               recurrentDays.includes(q);
      });
      const matchesFilter = (task.status === 'pending' && showPending) || (task.status === 'completed' && showCompleted);
      
      const matchesName = task.title.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesDate = (format(new Date(task.createdAt), 'yyyy/MM/dd') + ' ' + format(new Date(task.createdAt), 'eee', { locale: ptBR }).replace('.', '')).toLowerCase().includes(dateFilter.toLowerCase());
      const matchesLastUpdate = (task.lastUpdatedAt ? (format(new Date(task.lastUpdatedAt), 'yyyy/MM/dd HH:mm:ss') + ' ' + format(new Date(task.lastUpdatedAt), 'eee', { locale: ptBR }).replace('.', '')) : '').toLowerCase().includes(lastUpdateFilter.toLowerCase());
      const matchesDueDate = (task.dueDate ? (format(new Date(task.dueDate), 'yyyy/MM/dd') + ' ' + format(new Date(task.dueDate), 'eee', { locale: ptBR }).replace('.', '')) : '').toLowerCase().includes(dueDateFilter.toLowerCase());
      const matchesRecurrence = (task.recurrentDates?.map(d => format(new Date(d), 'dd/MM') + ' ' + format(new Date(d), 'eee', { locale: ptBR }).replace('.', '')).join(' ') || '').toLowerCase().includes(recurrentFilter.toLowerCase());
      const matchesStatus = statusText.includes(statusFilter.toLowerCase());
      const matchesPrazo = prazoText.toLowerCase().includes(prazoFilter.toLowerCase());
      
      const taskDaysUA = task.lastUpdatedAt ? differenceInCalendarDays(new Date(), new Date(task.lastUpdatedAt)) : 0;
      const matchesDaysUA = taskDaysUA.toString().includes(daysUAFilter);

      const taskDaysPA = task.dueDate ? differenceInCalendarDays(new Date(task.dueDate), startOfDay(new Date())) : 0;
      const matchesDaysPA = taskDaysPA.toString().includes(daysPAFilter);
      
      // Time-based filters
      let matchesInterval = true;
      if (selectedInterval) {
        const now = currentTime;
        if (isUpdatedFilter) {
          // Filter by last update (within the last X minutes)
          const startTime = subMinutes(now, selectedInterval);
          const lastUpdate = task.lastUpdatedAt ? new Date(task.lastUpdatedAt) : null;
          matchesInterval = !!(lastUpdate && lastUpdate >= startTime);
        } else if (isScheduledFilter) {
          // Filter by next update (within the next X minutes)
          const limitTime = addMinutes(now, selectedInterval);
          const dueDate = task.dueDate ? new Date(task.dueDate) : null;
          // Only show if it's in the future and within the interval
          matchesInterval = !!(dueDate && dueDate >= now && dueDate <= limitTime);
        }
      }

      return matchesSearch && matchesFilter && matchesName && matchesDate && matchesLastUpdate && matchesDueDate && matchesRecurrence && matchesStatus && matchesPrazo && matchesDaysUA && matchesDaysPA && matchesInterval;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'lastUpdate') {
        const dateA = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
        const dateB = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'dueDate') {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortBy === 'daysUA') {
        const daysA = a.lastUpdatedAt ? differenceInCalendarDays(new Date(), new Date(a.lastUpdatedAt)) : 0;
        const daysB = b.lastUpdatedAt ? differenceInCalendarDays(new Date(), new Date(b.lastUpdatedAt)) : 0;
        comparison = daysA - daysB;
      } else if (sortBy === 'daysPA') {
        const daysA = a.dueDate ? differenceInCalendarDays(new Date(a.dueDate), startOfDay(new Date())) : 0;
        const daysB = b.dueDate ? differenceInCalendarDays(new Date(b.dueDate), startOfDay(new Date())) : 0;
        comparison = daysA - daysB;
      } else if (sortBy === 'recurrentCount') {
        comparison = (a.recurrentDates?.length || 0) - (b.recurrentDates?.length || 0);
      } else if (sortBy === 'prazo') {
        const getPrazoValue = (task: Task) => {
          if (!task.dueDate) return 0;
          const due = new Date(task.dueDate);
          const now = new Date();
          if (now > due) return 2; // Atrasado
          if (now > subMinutes(due, 15)) return 1; // Em breve
          return 0; // Em tempo
        };
        comparison = getPrazoValue(a) - getPrazoValue(b);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [tasks, keywordSearch, showPending, showCompleted, sortBy, sortOrder, nameFilter, dateFilter, lastUpdateFilter, dueDateFilter, recurrentFilter, statusFilter, prazoFilter, currentTime]);

  const reportKeywordFilteredTasks = useMemo(() => {
    if (!showReport) return [];
    
    return tasks.filter(task => {
      const activeQueries = reportSearch.split(';').map(q => q.trim()).filter(q => q !== '');
      if (activeQueries.length === 0) return true;
      
      const statusText = task.status === 'completed' ? 'concluída' : 'pendente';
      const taskDaysPA = task.dueDate ? differenceInCalendarDays(new Date(task.dueDate), startOfDay(new Date())) : 0;
      let prazoText = '';
      if (taskDaysPA < 0) prazoText = 'Atrasado';
      else if (taskDaysPA === 0) prazoText = 'Hoje';
      else if (taskDaysPA <= 3) prazoText = 'Em breve';
      else prazoText = 'No prazo';

      return activeQueries.some(query => {
        const q = query.toLowerCase();
        const createdAtDay = format(new Date(task.createdAt), 'eee', { locale: ptBR }).replace('.', '').toLowerCase();
        const lastUpdateDay = task.lastUpdatedAt ? format(new Date(task.lastUpdatedAt), 'eee', { locale: ptBR }).replace('.', '').toLowerCase() : '';
        const dueDateDay = task.dueDate ? format(new Date(task.dueDate), 'eee', { locale: ptBR }).replace('.', '').toLowerCase() : '';
        const recurrentDays = task.recurrentDates?.map(d => format(new Date(d), 'eee', { locale: ptBR }).replace('.', '').toLowerCase()).join(' ') || '';

        return task.title.toLowerCase().includes(q) || 
               statusText.includes(q) ||
               prazoText.toLowerCase().includes(q) ||
               createdAtDay.includes(q) ||
               lastUpdateDay.includes(q) ||
               dueDateDay.includes(q) ||
               recurrentDays.includes(q);
      });
    });
  }, [tasks, reportSearch, showReport]);

  const reportFilteredTasks = useMemo(() => {
    const startStr = format(reportStartDate, 'yyyy-MM-dd');
    const endStr = format(reportEndDate, 'yyyy-MM-dd');
    
    return reportKeywordFilteredTasks.filter(task => {
      const createdAtStr = format(new Date(task.createdAt), 'yyyy-MM-dd');
      const lastUpdateStr = task.lastUpdatedAt ? format(new Date(task.lastUpdatedAt), 'yyyy-MM-dd') : null;
      const dueDateStr = task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : null;
      const recurrentInWindow = task.recurrentDates?.some(d => d >= startStr && d <= endStr);

      return (createdAtStr >= startStr && createdAtStr <= endStr) ||
             (lastUpdateStr && lastUpdateStr >= startStr && lastUpdateStr <= endStr) ||
             (dueDateStr && dueDateStr >= startStr && dueDateStr <= endStr) ||
             recurrentInWindow;
    });
  }, [reportKeywordFilteredTasks, reportStartDate, reportEndDate]);

  const chartData = useMemo(() => {
    const data = [];
    let current = startOfDay(reportStartDate);
    const end = startOfDay(reportEndDate);
    
    while (current <= end) {
      const d = format(current, 'yyyy-MM-dd');
      const stats = {
        created: reportKeywordFilteredTasks.filter(t => format(new Date(t.createdAt), 'yyyy-MM-dd') === d).length,
        updated: reportKeywordFilteredTasks.filter(t => t.lastUpdatedAt && format(new Date(t.lastUpdatedAt), 'yyyy-MM-dd') === d).length,
        scheduled: reportKeywordFilteredTasks.filter(t => {
          const isDue = t.dueDate && format(new Date(t.dueDate), 'yyyy-MM-dd') === d;
          const isRecurrent = t.recurrentDates?.includes(d);
          return isDue || isRecurrent;
        }).length
      };
      
      data.push({
        name: format(current, 'dd/MM'),
        ...stats
      });
      current = addDays(current, 1);
    }
    return data;
  }, [reportStartDate, reportEndDate, reportKeywordFilteredTasks]);

  const totalChartData = useMemo(() => {
    const totals = {
      created: 0,
      updated: 0,
      scheduled: 0
    };

    chartData.forEach(day => {
      totals.created += day.created;
      totals.updated += day.updated;
      totals.scheduled += day.scheduled;
    });

    return [
      { name: 'Iniciadas', value: totals.created, color: '#3b82f6' },
      { name: 'Últ. Atualiz.', value: totals.updated, color: '#10b981' },
      { name: 'Programadas', value: totals.scheduled, color: '#f59e0b' }
    ].filter(item => item.value > 0);
  }, [chartData]);

  const mergeFilteredTasks = () => {
    if (filteredAndSortedTasks.length < 2) {
      setAlertMessage('É necessário ter pelo menos 2 tarefas filtradas para associar.');
      return;
    }

    setConfirmConfig({
      message: `Deseja associar as ${filteredAndSortedTasks.length} tarefas filtradas em uma única tarefa?`,
      onConfirm: () => {
        const parseLineDate = (line: string) => {
          const match = line.match(/^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
          if (match) {
            const [_, d, m, y, h, min, s] = match;
            return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s)).getTime();
          }
          return 0;
        };

        // Collect all lines from all filtered tasks
        let allLines: string[] = [];
        filteredAndSortedTasks.forEach(task => {
          allLines = [...allLines, ...task.title.split('\n')];
        });

        // Sort lines chronologically
        allLines.sort((a, b) => parseLineDate(a) - parseLineDate(b));

        // Remove duplicates (if any exact same line exists)
        const uniqueLines = Array.from(new Set(allLines.filter(line => line.trim() !== '')));

        // Create the merged task
        const firstTask = filteredAndSortedTasks[0];
        const latestTask = [...filteredAndSortedTasks].sort((a, b) => 
          new Date(b.lastUpdatedAt || b.createdAt).getTime() - new Date(a.lastUpdatedAt || a.createdAt).getTime()
        )[0];

        const mergedTask: Task = {
          id: Math.random().toString(36).substr(2, 9),
          title: uniqueLines.join('\n'),
          status: filteredAndSortedTasks.every(t => t.status === 'completed') ? 'completed' : 'pending',
          createdAt: filteredAndSortedTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0].createdAt,
          lastUpdatedAt: new Date().toISOString(),
          dueDate: latestTask.dueDate,
          nextUpdateType: latestTask.nextUpdateType,
          recurrentDates: latestTask.recurrentDates,
        };

        // Update tasks state: remove all filtered tasks and add the merged one
        const filteredIds = new Set(filteredAndSortedTasks.map(t => t.id));
        setTasks(prev => [...prev.filter(t => !filteredIds.has(t.id)), mergedTask]);
        
        // Clear search to show the result
        setKeywordSearch('');
        
        const newNotification = {
          id: Math.random().toString(36).substr(2, 9),
          title: `Associação concluída: ${filteredAndSortedTasks.length} tarefas mescladas.`,
          taskId: mergedTask.id,
          type: 'soon' as const
        };
        setNotifications(prev => [...prev, newNotification]);
        setConfirmConfig(null);
      }
    });
  };

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const selectAllFiltered = () => {
    if (selectedTaskIds.size === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredAndSortedTasks.map(t => t.id)));
    }
  };

  const deleteSelectedTasks = () => {
    if (selectedTaskIds.size === 0) return;
    
    setConfirmConfig({
      message: `Deseja excluir as ${selectedTaskIds.size} tarefas selecionadas?`,
      onConfirm: () => {
        setTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        setSelectedTaskIds(new Set());
        setConfirmConfig(null);
      }
    });
  };

  const exportToExcel = () => {
    const dataToExport = filteredAndSortedTasks.map(task => ({
      'Título': task.title,
      'Status': task.status === 'completed' ? 'Concluída' : 'Pendente',
      'Iniciada': format(new Date(task.createdAt), 'yyyy/MM/dd HH:mm:ss'),
      'Últ. Atualização': task.lastUpdatedAt ? format(new Date(task.lastUpdatedAt), 'yyyy/MM/dd HH:mm:ss') : '-',
      'Próxima Atualização': task.nextUpdateType === 'REC' ? 'RECORRÊNCIA' : (task.dueDate ? format(new Date(task.dueDate), 'yyyy/MM/dd HH:mm:ss') : '-'),
      'Prazo': task.dueDate ? (() => {
        const due = new Date(task.dueDate);
        const now = new Date();
        if (now > due) return 'Atrasado';
        if (now > subMinutes(due, 15)) return 'Em breve';
        return 'Em tempo';
      })() : '-',
      'Dias Corridos': task.dueDate ? differenceInCalendarDays(new Date(task.dueDate), new Date()) : '-',
      'Recorrências': task.recurrentDates?.map(d => format(new Date(d), 'dd/MM')).join(', ') || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tarefas');
    
    XLSX.writeFile(workbook, `tarefas_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
  };

  return (
    <div 
      className={`min-h-screen transition-colors duration-300 font-sans p-4 md:p-6 ${
        theme === 'dark' ? 'bg-[#0a0a0a] text-white' : 'bg-[#f5f5f5] text-[#1a1a1a]'
      }`}
    >
      <div className="max-w-[98%] mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            {isEditingTitle ? (
              <input
                autoFocus
                type="text"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                className={`text-3xl font-bold tracking-tight bg-transparent border-b-2 border-emerald-500 outline-none ${
                  theme === 'dark' ? 'text-white' : 'text-[#1a1a1a]'
                }`}
              />
            ) : (
              <h1 
                onClick={() => setIsEditingTitle(true)}
                className="text-3xl font-bold tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
              >
                {appTitle}
              </h1>
            )}
            <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg ${
              theme === 'dark' ? 'bg-emerald-600 text-white shadow-emerald-900/20' : 'bg-black text-white shadow-black/10'
            }`}>
              {format(new Date(), 'yyyy/MM/dd')}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-2 rounded-xl transition-all shadow-sm border ${
                theme === 'dark' 
                  ? 'bg-[#1a1a1a] border-white/10 text-gray-400 hover:text-white' 
                  : 'bg-white border-gray-200 text-gray-500 hover:text-black'
              }`}
            >
              <Settings className={`w-5 h-5 ${isSettingsOpen ? 'rotate-90' : ''} transition-transform duration-300`} />
            </button>
            <button 
              onClick={() => setShowReport(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm border transition-all text-sm font-medium ${
                theme === 'dark'
                  ? 'bg-[#1a1a1a] border-white/10 text-white hover:bg-[#252525]'
                  : 'bg-white border-gray-200 text-[#1a1a1a] hover:bg-gray-50'
              }`}
            >
              <BarChart2 className="w-4 h-4 text-blue-500" />
              Relatório
            </button>
            <button 
              onClick={exportToExcel}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm border transition-all text-sm font-medium ${
                theme === 'dark'
                  ? 'bg-[#1a1a1a] border-white/10 text-white hover:bg-[#252525]'
                  : 'bg-white border-gray-200 text-[#1a1a1a] hover:bg-gray-50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Exportar Excel
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md transition-all text-sm font-medium ${
                theme === 'dark'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#1a1a1a] hover:bg-[#333] text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </button>
          </div>
        </header>

        {/* Settings Panel */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden mb-6 rounded-2xl border transition-all ${
                theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100 shadow-sm'
              }`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Configurações</h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className={`text-xs font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Tema do Aplicativo</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setTheme('light')}
                        className={`flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-sm ${
                          theme === 'light' ? 'border-emerald-500 bg-emerald-50/50 text-emerald-700' : 'border-transparent bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-300" />
                        Claro
                      </button>
                      <button 
                        onClick={() => setTheme('dark')}
                        className={`flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-sm ${
                          theme === 'dark' ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-transparent bg-[#1a1a1a] text-gray-500 hover:bg-[#222]'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-black border border-white/20" />
                        Escuro
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className={`text-xs font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Título da Lista</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={appTitle}
                        onChange={(e) => setAppTitle(e.target.value)}
                        placeholder="Ex: Minha Agenda"
                        className={`flex-1 px-4 py-3 rounded-xl border transition-all text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                          theme === 'dark' ? 'bg-[#1a1a1a] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-[#1a1a1a]'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Visual Notifications */}
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {notifications.length > 0 && (
            <button 
              onClick={() => setNotifications([])}
              className={`pointer-events-auto self-end mb-1 px-4 py-2 rounded-xl shadow-lg transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2 border ${
                theme === 'dark' 
                  ? 'bg-[#1a1a1a] text-white hover:bg-[#252525] border-white/10' 
                  : 'bg-white text-[#1a1a1a] hover:bg-gray-50 border-gray-200'
              }`}
            >
              <X className="w-3 h-3" />
              Limpar Tudo
            </button>
          )}
          {notifications.map(notification => {
            const isOverdue = notification.type === 'overdue';
            const bgColor = isOverdue ? 'bg-red-600' : 'bg-orange-500';
            const iconBg = isOverdue ? 'bg-red-700' : 'bg-orange-600';
            
            return (
              <div 
                key={notification.id}
                className={`${bgColor} text-white shadow-2xl p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-right-full duration-300 pointer-events-auto min-w-[320px] border border-white/20`}
              >
                <div className={`p-2 ${iconBg} rounded-lg`}>
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-black uppercase tracking-tight">{notification.title}</h4>
                  <p className="text-xs opacity-90 mt-1 font-medium">Verifique a tarefa na lista.</p>
                </div>
                <button 
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                  className="p-1 hover:bg-black/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Report Modal */}
        <AnimatePresence>
          {showReport && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`w-[98vw] max-w-[1600px] h-[95vh] rounded-3xl shadow-2xl overflow-hidden border flex flex-col ${
                  theme === 'dark' ? 'bg-[#0a0a0a] border-white/10' : 'bg-white border-gray-200'
                }`}
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                      <BarChart2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h2 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        Relatório de Atividades
                      </h2>
                      <p className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        Visão geral das tarefas por data selecionada
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowReport(false)}
                    className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1">
                  <div className="flex flex-col xl:flex-row gap-8 mb-8">
                    {/* Left Side: Controls and Calendar */}
                    <div className="flex-1 flex flex-col gap-6">
                      <div className="flex flex-col gap-4">
                        <div className="flex-1">
                          <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                            Filtrar por Termos (Relatório)
                          </label>
                          <div className="relative">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                            <input 
                              type="text"
                              placeholder="Ex: Termo 1; Termo 2..."
                              value={reportSearch}
                              onChange={(e) => setReportSearch(e.target.value)}
                              className={`w-full pl-10 pr-4 py-3 rounded-2xl transition-all text-sm outline-none border ${
                                theme === 'dark' 
                                  ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30' 
                                  : 'bg-gray-50 border-gray-100 focus:ring-2 focus:ring-blue-500/5'
                              }`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                              Data Inicial
                            </label>
                            <input 
                              type="date"
                              value={format(reportStartDate, 'yyyy-MM-dd')}
                              onChange={(e) => setReportStartDate(new Date(e.target.value + 'T12:00:00'))}
                              className={`w-full px-4 py-3 rounded-2xl transition-all outline-none border ${
                                theme === 'dark' 
                                  ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30' 
                                  : 'bg-gray-50 border-gray-100 focus:ring-2 focus:ring-blue-500/5'
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                              Data Final
                            </label>
                            <input 
                              type="date"
                              value={format(reportEndDate, 'yyyy-MM-dd')}
                              onChange={(e) => setReportEndDate(new Date(e.target.value + 'T12:00:00'))}
                              className={`w-full px-4 py-3 rounded-2xl transition-all outline-none border ${
                                theme === 'dark' 
                                  ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30' 
                                  : 'bg-gray-50 border-gray-100 focus:ring-2 focus:ring-blue-500/5'
                              }`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mini Calendar with Counts */}
                      <div className={`p-5 rounded-3xl border ${theme === 'dark' ? 'bg-[#1a1a1a] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            Calendário de Atividades ({format(reportStartDate, 'MMMM yyyy', { locale: ptBR })})
                          </h3>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                const newDate = addMonths(reportStartDate, -1);
                                setReportStartDate(startOfMonth(newDate));
                                setReportEndDate(startOfMonth(newDate));
                              }}
                              className={`p-1 rounded-lg hover:bg-black/5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                            >
                              <ChevronUp className="-rotate-90 w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                const newDate = addMonths(reportStartDate, 1);
                                setReportStartDate(startOfMonth(newDate));
                                setReportEndDate(startOfMonth(newDate));
                              }}
                              className={`p-1 rounded-lg hover:bg-black/5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                            >
                              <ChevronUp className="rotate-90 w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-1">
                          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                            <div key={i} className="text-center text-[14px] font-black text-gray-400 py-2">{day}</div>
                          ))}
                          {(() => {
                            const monthStart = startOfMonth(reportStartDate);
                            const monthEnd = endOfMonth(monthStart);
                            const calendarStart = startOfWeek(monthStart);
                            const calendarEnd = endOfWeek(monthEnd);
                            const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

                            return days.map((day, i) => {
                              const dayStr = format(day, 'yyyy-MM-dd');
                              const isCurrentMonth = isSameMonth(day, monthStart);
                              const isSelected = isSameDay(day, reportStartDate) || isSameDay(day, reportEndDate) || (day > reportStartDate && day < reportEndDate);
                              
                              // Count tasks for this day using keyword filtered tasks
                              const dayStats = {
                                created: reportKeywordFilteredTasks.filter(t => format(new Date(t.createdAt), 'yyyy-MM-dd') === dayStr).length,
                                updated: reportKeywordFilteredTasks.filter(t => t.lastUpdatedAt && format(new Date(t.lastUpdatedAt), 'yyyy-MM-dd') === dayStr).length,
                                scheduled: reportKeywordFilteredTasks.filter(t => (t.dueDate && format(new Date(t.dueDate), 'yyyy-MM-dd') === dayStr) || (t.recurrentDates?.includes(dayStr))).length
                              };
                              const totalDayCount = dayStats.created + dayStats.updated + dayStats.scheduled;

                              return (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setReportStartDate(day);
                                    setReportEndDate(day);
                                  }}
                                  className={`relative h-14 rounded-xl flex flex-col items-center justify-center transition-all ${
                                    !isCurrentMonth ? 'opacity-20 pointer-events-none' : ''
                                  } ${
                                    isSelected 
                                      ? (theme === 'dark' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-blue-600 text-white shadow-lg shadow-blue-200/50')
                                      : (theme === 'dark' ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-white text-gray-600')
                                  }`}
                                >
                                  <span className="text-[16px] font-bold z-10">{format(day, 'd')}</span>
                                  {totalDayCount > 0 && (
                                    <div className="flex gap-1 mt-1 z-10">
                                      {dayStats.created > 0 && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                                      {dayStats.updated > 0 && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                                      {dayStats.scheduled > 0 && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                                    </div>
                                  )}
                                  {totalDayCount > 0 && (
                                    <span className={`absolute -top-1 -right-1 text-[12px] font-black px-2 py-0.5 rounded-full ${
                                      isSelected ? 'bg-white text-blue-600' : (theme === 'dark' ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white')
                                    }`}>
                                      {totalDayCount}
                                    </span>
                                  )}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Statistics and Chart */}
                    <div className="flex-[1.5] flex flex-col gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { 
                            label: 'Iniciadas', 
                            value: reportFilteredTasks.filter(t => {
                              const d = format(new Date(t.createdAt), 'yyyy-MM-dd');
                              return d >= format(reportStartDate, 'yyyy-MM-dd') && d <= format(reportEndDate, 'yyyy-MM-dd');
                            }).length,
                            color: 'text-blue-500',
                            bg: 'bg-blue-500/10'
                          },
                          { 
                            label: 'Últ. Atualiz.', 
                            value: reportFilteredTasks.filter(t => {
                              if (!t.lastUpdatedAt) return false;
                              const d = format(new Date(t.lastUpdatedAt), 'yyyy-MM-dd');
                              return d >= format(reportStartDate, 'yyyy-MM-dd') && d <= format(reportEndDate, 'yyyy-MM-dd');
                            }).length,
                            color: 'text-emerald-500',
                            bg: 'bg-emerald-500/10'
                          },
                          { 
                            label: 'Programadas', 
                            value: reportFilteredTasks.filter(t => {
                              const hasDueInRange = t.dueDate && format(new Date(t.dueDate), 'yyyy-MM-dd') >= format(reportStartDate, 'yyyy-MM-dd') && format(new Date(t.dueDate), 'yyyy-MM-dd') <= format(reportEndDate, 'yyyy-MM-dd');
                              const hasRecurrentInRange = t.recurrentDates?.some(d => d >= format(reportStartDate, 'yyyy-MM-dd') && d <= format(reportEndDate, 'yyyy-MM-dd'));
                              return hasDueInRange || hasRecurrentInRange;
                            }).length,
                            color: 'text-orange-500',
                            bg: 'bg-orange-500/10'
                          }
                        ].map((stat, i) => (
                          <div key={i} className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-[#1a1a1a] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                            <div className={`w-8 h-8 ${stat.bg} rounded-lg flex items-center justify-center mb-2`}>
                              <div className={`w-2 h-2 rounded-full ${stat.color.replace('text', 'bg')}`} />
                            </div>
                            <div className={`text-2xl font-black ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {stat.value}
                            </div>
                            <div className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={`p-6 rounded-3xl border flex-1 ${theme === 'dark' ? 'bg-[#1a1a1a] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                          <h3 className={`text-xs font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {isSameDay(reportStartDate, reportEndDate) 
                              ? `Distribuição de Atividades - ${format(reportStartDate, "dd 'de' MMMM", { locale: ptBR })}`
                              : `Período: ${format(reportStartDate, 'dd/MM/yy')} até ${format(reportEndDate, 'dd/MM/yy')}`
                            }
                          </h3>
                          <div className="flex bg-black/5 rounded-xl p-1 gap-1">
                            {[
                              { id: 'bar', label: 'Barra', icon: BarChart2 },
                              { id: 'line', label: 'Linha', icon: TrendingUp },
                              { id: 'pie', label: 'Pizza', icon: PieChartIcon }
                            ].map((type) => (
                              <button
                                key={type.id}
                                onClick={() => setChartType(type.id as any)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                  chartType === type.id 
                                    ? 'bg-white shadow-sm text-blue-600' 
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <type.icon className="w-3 h-3" />
                                {type.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="h-[350px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            {chartType === 'bar' ? (
                              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#333' : '#ddd'} />
                                <XAxis 
                                  dataKey="name" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 800, fill: theme === 'dark' ? '#666' : '#999' }}
                                  dy={10}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 800, fill: theme === 'dark' ? '#666' : '#999' }}
                                />
                                <Tooltip 
                                  cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                                  contentStyle={{ 
                                    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff',
                                    border: `1px solid ${theme === 'dark' ? '#333' : '#eee'}`,
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }} />
                                <Bar dataKey="created" name="Iniciadas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="updated" name="Últ. Atualiz." fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="scheduled" name="Programadas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            ) : chartType === 'line' ? (
                              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#333' : '#ddd'} />
                                <XAxis 
                                  dataKey="name" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 800, fill: theme === 'dark' ? '#666' : '#999' }}
                                  dy={10}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 800, fill: theme === 'dark' ? '#666' : '#999' }}
                                />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff',
                                    border: `1px solid ${theme === 'dark' ? '#333' : '#eee'}`,
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }} />
                                <Line type="monotone" dataKey="created" name="Iniciadas" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="updated" name="Últ. Atualiz." stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="scheduled" name="Programadas" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 6 }} />
                              </LineChart>
                            ) : (
                              <PieChart>
                                <Pie
                                  data={totalChartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={100}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {totalChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff',
                                    border: `1px solid ${theme === 'dark' ? '#333' : '#eee'}`,
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }} />
                              </PieChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                  </div>
                </div>
              </div>
                  
              <div className="mt-8 flex justify-end">
                    <button 
                      onClick={() => setShowReport(false)}
                      className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all ${
                        theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      Fechar Relatório
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Search and Filter Bar */}
        <div className={`p-2.5 rounded-2xl shadow-sm border mb-4 flex flex-col gap-3 transition-all ${
          theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'
        }`}>
          <div className="w-full relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
            <input 
              type="text"
              placeholder="Pesquisar termos (separe por ';' para múltiplos termos)..."
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl transition-all text-sm outline-none border ${
                theme === 'dark' 
                  ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30' 
                  : 'bg-gray-50 border-gray-100 focus:ring-2 focus:ring-black/5'
              }`}
            />
          </div>
          
          <div className={`flex flex-col md:flex-row gap-2.5 items-center justify-between border-t pt-2.5 ${
            theme === 'dark' ? 'border-white/5' : 'border-gray-50'
          }`}>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className={`flex items-center gap-4 px-3 py-1.5 rounded-xl border transition-all ${
                theme === 'dark' ? 'bg-[#1a1a1a] border-white/5' : 'bg-gray-50 border-gray-100'
              }`}>
                <div className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                  <Filter className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">Exibir:</span>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${showPending ? (theme === 'dark' ? 'bg-emerald-600 border-emerald-600' : 'bg-black border-black') : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                    {showPending && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={showPending} 
                    onChange={(e) => setShowPending(e.target.checked)} 
                  />
                  <span className={`text-[11px] font-bold transition-colors ${showPending ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : 'text-gray-400'}`}>PENDENTES</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${showCompleted ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                    {showCompleted && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={showCompleted} 
                    onChange={(e) => setShowCompleted(e.target.checked)} 
                  />
                  <span className={`text-[11px] font-bold transition-colors ${showCompleted ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : 'text-gray-400'}`}>CONCLUÍDAS</span>
                </label>
              </div>

              <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 hidden md:block" />

              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                {[
                  { label: '30m', value: 30 },
                  { label: '1h', value: 60 },
                  { label: '2h', value: 120 },
                  { label: '4h', value: 240 },
                  { label: '8h', value: 480 },
                  { label: '12h', value: 720 },
                  { label: '24h', value: 1440 },
                  { label: '48h', value: 2880 },
                  { label: '72h', value: 4320 },
                ].map((interval) => (
                  <label key={interval.value} className="flex items-center gap-1 cursor-pointer group shrink-0">
                    <div className={`w-3 h-3 rounded border flex items-center justify-center transition-all ${selectedInterval === interval.value ? (theme === 'dark' ? 'bg-blue-600 border-blue-600' : 'bg-blue-500 border-blue-500') : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                      {selectedInterval === interval.value && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={selectedInterval === interval.value} 
                      onChange={() => setSelectedInterval(selectedInterval === interval.value ? null : interval.value)} 
                    />
                    <span className={`text-[10px] font-bold transition-colors ${selectedInterval === interval.value ? (theme === 'dark' ? 'text-blue-400' : 'text-blue-600') : 'text-gray-400'}`}>{interval.label}</span>
                  </label>
                ))}
              </div>

              <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 hidden md:block" />

              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isUpdatedFilter ? (theme === 'dark' ? 'bg-orange-600 border-orange-600' : 'bg-orange-500 border-orange-500') : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                    {isUpdatedFilter && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={isUpdatedFilter} 
                    onChange={(e) => {
                      setIsUpdatedFilter(e.target.checked);
                      if (e.target.checked) setIsScheduledFilter(false);
                    }} 
                  />
                  <span className={`text-[11px] font-bold transition-colors ${isUpdatedFilter ? (theme === 'dark' ? 'text-orange-400' : 'text-orange-600') : 'text-gray-400'}`}>Atualizado a</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isScheduledFilter ? (theme === 'dark' ? 'bg-orange-600 border-orange-600' : 'bg-orange-500 border-orange-500') : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                    {isScheduledFilter && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={isScheduledFilter} 
                    onChange={(e) => {
                      setIsScheduledFilter(e.target.checked);
                      if (e.target.checked) setIsUpdatedFilter(false);
                    }} 
                  />
                  <span className={`text-[11px] font-bold transition-colors ${isScheduledFilter ? (theme === 'dark' ? 'text-orange-400' : 'text-orange-600') : 'text-gray-400'}`}>Programada para próxima</span>
                </label>
              </div>

              <div className="h-4 w-[1px] bg-gray-200 hidden md:block" />

              <button 
                onClick={selectAllFiltered}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-tight ${
                  selectedTaskIds.size === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : (theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-gray-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')
                }`}
              >
                {selectedTaskIds.size === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0 ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                Selecionar Tudo
              </button>

              {selectedTaskIds.size > 0 && (
                <button 
                  onClick={deleteSelectedTasks}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all text-[10px] font-bold uppercase tracking-tight shadow-sm"
                >
                  <Trash2 className="w-3 h-3" />
                  Excluir Selecionadas ({selectedTaskIds.size})
                </button>
              )}
            </div>
            
            <div className={`text-[10px] font-medium flex items-center gap-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              {keywordSearch.trim() !== '' && filteredAndSortedTasks.length >= 2 && (
                <button 
                  onClick={mergeFilteredTasks}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all uppercase font-bold tracking-tighter shadow-sm ${
                    theme === 'dark' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                >
                  <Plus className="w-2.5 h-2.5" />
                  Associar tarefas pesquisadas
                </button>
              )}
              <button 
                onClick={() => setKeywordSearch('')}
                className={`transition-colors uppercase font-bold tracking-tighter ${
                  theme === 'dark' ? 'text-emerald-400 hover:text-emerald-300' : 'text-blue-500 hover:text-blue-600'
                }`}
              >
                Limpar Pesquisa
              </button>
              <span>{filteredAndSortedTasks.length} tarefas encontradas</span>
            </div>
          </div>
        </div>

        {/* Quick Add Field */}
        <div className="mb-6">
          <div className="relative group">
            <input 
              type="text"
              placeholder="Digite uma nova tarefa e pressione Enter..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask(e as any);
              }}
              className={`w-full pl-5 pr-32 py-4 rounded-2xl shadow-sm transition-all outline-none text-base font-medium border ${
                theme === 'dark' 
                  ? 'bg-[#111] border-white/10 text-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50' 
                  : 'bg-white border-gray-200 text-[#1a1a1a] focus:ring-4 focus:ring-black/5 focus:border-black'
              }`}
            />
            <button 
              onClick={addTask}
              className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-bold uppercase tracking-widest ${
                theme === 'dark'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
              }`}
            >
              <Plus className="w-3 h-3" />
              Adicionar
            </button>
          </div>
        </div>

        {/* Excel-style Header */}
        <div className={`hidden sm:grid grid-cols-[1fr_auto] gap-4 px-4 py-2 mb-1 text-[11px] font-bold uppercase tracking-[0.15em] border-b transition-all ${
          theme === 'dark' ? 'text-gray-500 border-white/5' : 'text-gray-400 border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-5" /> {/* Checkbox spacer */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsExpandedAll(!isExpandedAll)}
                className={`p-1 rounded-md transition-colors ${theme === 'dark' ? 'hover:bg-white/5 text-gray-500 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                title={isExpandedAll ? "Recolher tudo" : "Expandir tudo"}
              >
                {isExpandedAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => toggleSort('name')}
                  className={`transition-colors flex items-center gap-1 text-[13px] font-bold ${sortBy === 'name' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
                >
                  Nome {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <input 
                  type="text"
                  placeholder="Filtrar Nome..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-32 border transition-all ${
                    theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                  }`}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 pr-8">
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('date')}
                className={`transition-colors flex items-center gap-1 w-24 justify-end text-[13px] font-bold h-10 ${sortBy === 'date' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Iniciada {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-24 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('lastUpdate')}
                className={`transition-colors flex items-center gap-1 w-24 justify-end text-[13px] font-bold h-10 ${sortBy === 'lastUpdate' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                <div className="text-right leading-tight">Últ.<br/>Atualização</div>
                {sortBy === 'lastUpdate' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={lastUpdateFilter}
                onChange={(e) => setLastUpdateFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-24 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('daysUA')}
                className={`transition-colors flex items-center gap-1 w-16 justify-end text-[13px] font-bold h-10 ${sortBy === 'daysUA' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Dias Ú.A {sortBy === 'daysUA' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={daysUAFilter}
                onChange={(e) => setDaysUAFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-16 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('dueDate')}
                className={`transition-colors flex items-center gap-1 w-44 justify-end text-[13px] font-bold h-10 ${sortBy === 'dueDate' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                <div className="text-right leading-tight">Próx.<br/>Atualização</div>
                {sortBy === 'dueDate' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={dueDateFilter}
                onChange={(e) => setDueDateFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-44 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('daysPA')}
                className={`transition-colors flex items-center gap-1 w-16 justify-end text-[13px] font-bold h-10 ${sortBy === 'daysPA' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Dias P.A {sortBy === 'daysPA' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={daysPAFilter}
                onChange={(e) => setDaysPAFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-16 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <button 
                onClick={() => toggleSort('recurrentCount')}
                className={`transition-colors flex items-center gap-1 w-24 justify-end text-[13px] font-bold h-10 ${sortBy === 'recurrentCount' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Recorrência {sortBy === 'recurrentCount' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar Rec..."
                value={recurrentFilter}
                onChange={(e) => setRecurrentFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-24 text-right border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-center">
              <button 
                onClick={() => toggleSort('status')}
                className={`transition-colors flex items-center gap-1 w-20 justify-center text-[13px] font-bold h-10 ${sortBy === 'status' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-20 text-center border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1 items-center">
              <button 
                onClick={() => toggleSort('prazo')}
                className={`transition-colors flex items-center gap-1 w-24 justify-center text-[13px] font-bold h-10 ${sortBy === 'prazo' ? (theme === 'dark' ? 'text-emerald-400' : 'text-black') : (theme === 'dark' ? 'hover:text-white' : 'hover:text-gray-600')}`}
              >
                Prazo {sortBy === 'prazo' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <input 
                type="text"
                placeholder="Filtrar..."
                value={prazoFilter}
                onChange={(e) => setPrazoFilter(e.target.value)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-normal lowercase tracking-normal outline-none w-24 text-center border transition-all ${
                  theme === 'dark' ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-emerald-500/10' : 'bg-white border-gray-100 focus:ring-black/5'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedTasks.length > 0 ? (
              filteredAndSortedTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className={`group p-2.5 rounded-xl border transition-all grid grid-cols-[auto_1fr_auto] gap-4 items-center cursor-default select-none ${
                    task.status === 'completed' 
                      ? (theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/20 shadow-none' : 'bg-emerald-50/50 border-emerald-100 shadow-none')
                      : (theme === 'dark' ? 'bg-[#111] border-white/5 shadow-sm hover:shadow-md hover:border-white/10' : 'bg-white border-gray-100 shadow-sm hover:shadow-md')
                  } ${selectedTaskIds.has(task.id) ? (theme === 'dark' ? 'ring-2 ring-emerald-500/50' : 'ring-2 ring-emerald-500/30') : ''}`}
                >
                  <button 
                    onClick={() => toggleTaskSelection(task.id)}
                    className={`p-1 rounded transition-colors ${theme === 'dark' ? 'text-gray-600 hover:text-emerald-400' : 'text-gray-300 hover:text-emerald-500'}`}
                  >
                    {selectedTaskIds.has(task.id) ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4" />}
                  </button>

                  <div className="flex items-center gap-3 min-w-0">
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className="flex-shrink-0 transition-colors"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className={`w-4.5 h-4.5 ${theme === 'dark' ? 'text-emerald-400 fill-emerald-400/10' : 'text-emerald-600 fill-emerald-100'}`} />
                      ) : (
                        <Circle className={`w-4.5 h-4.5 ${theme === 'dark' ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-400'}`} />
                      )}
                    </button>
                    
                    <div className="min-w-0 flex-1">
                      {editingTaskId === task.id ? (
                        <div className="space-y-2 pr-4">
                          <textarea 
                            autoFocus
                            rows={Math.max(1, editTitle.split('\n').length)}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.altKey) {
                                e.preventDefault();
                                const now = new Date();
                                const timestamp = `${format(now, 'yy/MM/dd')} ${format(now, 'eee', { locale: ptBR }).replace('.', '').toUpperCase()} ${format(now, 'HH:mm:ss')}`;
                                const cursorPosition = e.currentTarget.selectionStart;
                                const textBefore = editTitle.substring(0, cursorPosition);
                                const textAfter = editTitle.substring(cursorPosition);
                                setEditTitle(`${textBefore}\n${timestamp} - ${textAfter}`);
                              } else if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit();
                              }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className={`w-full px-2 py-1 rounded-lg text-[13px] font-medium outline-none transition-all resize-none ${
                              theme === 'dark' ? 'bg-[#1a1a1a] border-white/10 text-white focus:ring-emerald-500/20' : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-black/5'
                            }`}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <div 
                            className="cursor-pointer group/text flex flex-col gap-1"
                            onClick={(e) => { e.stopPropagation(); startEditing(task); }}
                          >
                            {task.title.split('\n').map((line, idx) => {
                              if (!isExpandedAll && idx > 0) return null;
                              
                              const timestampRegex = /^(\d{2}\/\d{2}\/\d{2} [A-Z]{3} \d{2}:\d{2}:\d{2} - )/;
                              const oldTimestampRegex = /^(\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} - )/;
                              const statusRegex = /^(\([VR]\) )/;
                              
                              let remaining = line;
                              let timestamp = '';
                              let status = '';
                              
                              const tsMatch = remaining.match(timestampRegex) || remaining.match(oldTimestampRegex);
                              if (tsMatch) {
                                timestamp = tsMatch[1];
                                remaining = remaining.substring(timestamp.length);
                              }
                              
                              const stMatch = remaining.match(statusRegex);
                              if (stMatch) {
                                status = stMatch[1];
                                remaining = remaining.substring(status.length);
                              }
                              
                              const isGreen = status === '(V) ';
                              const isRed = status === '(R) ';
                              
                              const parts = timestamp.split(' ');
                              // New format: "YY/MM/DD DIA HH:MM:SS - " -> parts: ["YY/MM/DD", "DIA", "HH:MM:SS", "-", ""]
                              // Old format: "YY/MM/DD HH:MM:SS - " -> parts: ["YY/MM/DD", "HH:MM:SS", "-", ""]
                              const hasDay = parts.length >= 5;
                              
                              return (
                                <div key={idx} className="flex items-start gap-2 group/line">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); toggleLineStatus(task.id, idx); }}
                                    className={`mt-1 w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors ${
                                      isGreen ? 'bg-emerald-500 border-emerald-600' : 
                                      isRed ? 'bg-red-500 border-red-600' : 
                                      (theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-red-500/20' : 'bg-gray-100 border-gray-300 hover:bg-red-200')
                                    }`}
                                  />
                                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                                    {timestamp && (
                                      <span className={`text-[9px] font-bold whitespace-nowrap tracking-tighter ${theme === 'dark' ? 'text-gray-800' : 'text-gray-200'}`}>
                                        {parts[0]}
                                        {hasDay && <span className="ml-1 opacity-50">{parts[1]}</span>}
                                        <span className="ml-1 opacity-30">{hasDay ? parts[2] : parts[1]}</span>
                                      </span>
                                    )}
                                    <span className={`font-medium text-[15px] ${
                                      isGreen ? (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600') : 
                                      isRed ? (theme === 'dark' ? 'text-red-400' : 'text-red-600') : 
                                      (theme === 'dark' ? 'text-gray-200' : 'text-gray-900')
                                    } ${task.status === 'completed' ? 'opacity-50 line-through' : ''}`}>
                                      {remaining}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {!isExpandedAll && task.title.split('\n').length > 1 && (
                              <div className={`text-[11px] italic mt-0.5 ml-6 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                                + {task.title.split('\n').length - 1} linhas ocultas...
                              </div>
                            )}
                            <div className="opacity-0 group-hover/text:opacity-100 text-[11px] text-blue-500 font-bold uppercase transition-opacity whitespace-nowrap mt-1">
                              Clique para editar
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pr-4">
                    <div className={`hidden sm:flex items-center gap-6 text-[13px] font-medium transition-colors ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      <div className={`w-24 text-right ${task.status === 'completed' ? (theme === 'dark' ? 'text-emerald-400/40' : 'text-emerald-400/60') : (theme === 'dark' ? 'text-gray-300 font-bold' : 'text-gray-900 font-bold')}`}>
                        {format(new Date(task.createdAt), 'yy/MM/dd')} <span className="text-[10px] opacity-70 uppercase">{format(new Date(task.createdAt), 'eee', { locale: ptBR }).replace('.', '')}</span>
                        <div className="text-[11px] opacity-50 font-medium">{format(new Date(task.createdAt), 'HH:mm:ss')}</div>
                      </div>
                      <div className={`w-24 text-right ${task.status === 'completed' ? (theme === 'dark' ? 'text-emerald-400/40' : 'text-emerald-400/60') : (theme === 'dark' ? 'text-gray-300 font-bold' : 'text-gray-900 font-bold')}`}>
                        {task.lastUpdatedAt ? (
                          <>
                            {format(new Date(task.lastUpdatedAt), 'yy/MM/dd')} <span className="text-[10px] opacity-70 uppercase">{format(new Date(task.lastUpdatedAt), 'eee', { locale: ptBR }).replace('.', '')}</span>
                            <div className="text-[11px] opacity-50 font-medium">{format(new Date(task.lastUpdatedAt), 'HH:mm:ss')}</div>
                          </>
                        ) : (
                          <span className="opacity-30">-</span>
                        )}
                      </div>
                      <div className="w-16 text-right font-bold">
                        {task.lastUpdatedAt ? (
                          (() => {
                            const diff = differenceInCalendarDays(new Date(), new Date(task.lastUpdatedAt));
                            return (
                              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}>
                                {diff}
                              </span>
                            );
                          })()
                        ) : (
                          <span className={theme === 'dark' ? 'text-gray-800' : 'text-gray-200'}>-</span>
                        )}
                      </div>
                      <div className="w-44 flex flex-col items-end gap-1">
                        <div 
                          onClick={() => {
                            setEditingNextUpdateId(task.id);
                            setEditNextUpdateValue(task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd'T'HH:mm:ss") : format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
                          }}
                          className={`text-[13px] font-bold text-right cursor-pointer px-1 rounded transition-colors ${
                            task.status === 'completed' 
                              ? (theme === 'dark' ? 'text-emerald-400/40' : 'text-emerald-400/60') 
                              : (theme === 'dark' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-blue-600 hover:bg-blue-50')
                          }`}
                        >
                          {editingNextUpdateId === task.id ? (
                            <input
                              autoFocus
                              type={task.recurrentDates?.length ? "time" : "datetime-local"}
                              step="1"
                              value={task.recurrentDates?.length 
                                ? (task.dueDate ? format(new Date(task.dueDate), "HH:mm:ss") : format(new Date(), "HH:mm:ss"))
                                : editNextUpdateValue
                              }
                              onChange={(e) => {
                                if (task.recurrentDates?.length) {
                                  const timeValue = e.target.value;
                                  const priorityDate = getRecurrencePriorityDate(task.recurrentDates);
                                  if (priorityDate) {
                                    setEditNextUpdateValue(`${priorityDate}T${timeValue}`);
                                  }
                                } else {
                                  setEditNextUpdateValue(e.target.value);
                                }
                              }}
                              onBlur={() => handleManualNextUpdate(task.id, editNextUpdateValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleManualNextUpdate(task.id, editNextUpdateValue);
                                if (e.key === 'Escape') setEditingNextUpdateId(null);
                              }}
                              className={`text-[13px] rounded px-1 outline-none w-full border ${
                                theme === 'dark' ? 'bg-[#1a1a1a] border-emerald-500/30 text-emerald-400 focus:ring-1 focus:ring-emerald-500/50' : 'bg-white border-blue-200 text-blue-600 focus:ring-1 focus:ring-blue-400'
                              }`}
                            />
                          ) : task.dueDate ? (
                            <>
                              {format(new Date(task.dueDate), 'yy/MM/dd')} <span className="text-[10px] opacity-70 uppercase">{format(new Date(task.dueDate), 'eee', { locale: ptBR }).replace('.', '')}</span>
                              <div className="text-[11px] opacity-50 font-medium">{format(new Date(task.dueDate), 'HH:mm:ss')}</div>
                            </>
                          ) : (
                            <span className="opacity-30">-</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex gap-1 justify-end">
                            {(['15', '30', '60'] as const).map((type) => (
                              <button
                                key={type}
                                onClick={(e) => { e.stopPropagation(); setNextUpdate(task.id, type); }}
                                className={`px-1 py-0.5 rounded text-[10px] font-black transition-all border min-w-[24px] ${
                                  task.nextUpdateType === type 
                                    ? (theme === 'dark' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                                    : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-white/5 hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200 hover:text-blue-500')
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1 justify-end">
                            {(['D1', 'D2', 'D3'] as const).map((type) => (
                              <button
                                key={type}
                                onClick={(e) => { e.stopPropagation(); setNextUpdate(task.id, type); }}
                                className={`px-1 py-0.5 rounded text-[10px] font-black transition-all border min-w-[24px] ${
                                  task.nextUpdateType === type 
                                    ? (theme === 'dark' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                                    : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-white/5 hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200 hover:text-blue-500')
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1 justify-end">
                            {(['D5', 'D7', 'D14', 'M1'] as const).map((type) => (
                              <button
                                key={type}
                                onClick={(e) => { e.stopPropagation(); setNextUpdate(task.id, type); }}
                                className={`px-1 py-0.5 rounded text-[10px] font-black transition-all border min-w-[24px] ${
                                  task.nextUpdateType === type 
                                    ? (theme === 'dark' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                                    : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-white/5 hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-200 hover:text-blue-500')
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="w-16 text-right font-bold">
                        {task.dueDate ? (
                          (() => {
                            const diff = differenceInCalendarDays(new Date(task.dueDate), startOfDay(new Date()));
                            return (
                              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}>
                                {diff}
                              </span>
                            );
                          })()
                        ) : (
                          <span className={theme === 'dark' ? 'text-gray-800' : 'text-gray-200'}>-</span>
                        )}
                      </div>
                      <div className="w-24 flex flex-col items-end gap-1 relative">
                        <button 
                          id={`btn-picker-${task.id}`}
                          onClick={() => setActivePicker(activePicker === task.id ? null : task.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] font-black uppercase tracking-wider transition-all shadow-sm border ${
                            theme === 'dark' 
                              ? 'bg-white/5 border-white/10 text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10' 
                              : 'bg-white border-gray-100 text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/30'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {task.recurrentDates?.length ? `${task.recurrentDates.length} Dias` : 'Recorrência'}
                        </button>

                        {activePicker === task.id && (
                          <div 
                            id={`picker-${task.id}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setActivePicker(null);
                              }
                            }}
                            tabIndex={0}
                            className={`absolute top-full right-0 mt-2 z-50 rounded-2xl shadow-2xl p-4 w-72 animate-in fade-in slide-in-from-top-2 border outline-none ${
                              theme === 'dark' ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex flex-col">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Recorrência</span>
                                <span className={`text-xs font-bold capitalize ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                  {format(currentMonthView, 'MMMM yyyy')}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => setCurrentMonthView(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
                                  className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}
                                >
                                  <ChevronDown className={`w-3.5 h-3.5 rotate-90 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                                </button>
                                <button 
                                  onClick={() => setCurrentMonthView(new Date())}
                                  className={`px-2 py-1 text-[8px] font-black uppercase tracking-tighter transition-colors ${theme === 'dark' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-blue-500 hover:bg-blue-50'}`}
                                >
                                  Hoje
                                </button>
                                <button 
                                  onClick={() => setCurrentMonthView(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
                                  className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}
                                >
                                  <ChevronDown className={`w-3.5 h-3.5 -rotate-90 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                                </button>
                                <button onClick={() => setActivePicker(null)} className={`p-1.5 rounded-lg ml-1 ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}>
                                  <X className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                                </button>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1 mb-2">
                              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                                <div key={i} className={`text-center text-[8px] font-black py-1 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`}>
                                  {day}
                                </div>
                              ))}
                              {calendarDays.map((day, i) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const isSelected = task.recurrentDates?.includes(dateStr);
                                const isCurrentMonth = isSameMonth(day, currentMonthView);
                                const isToday = isSameDay(day, new Date());
                                
                                return (
                                  <button
                                    key={i}
                                    onClick={() => toggleRecurrentDate(task.id, dateStr)}
                                    className={`
                                      aspect-square rounded-lg text-[10px] font-bold transition-all flex items-center justify-center
                                      ${!isCurrentMonth 
                                        ? (theme === 'dark' ? 'text-gray-800' : 'text-gray-200') 
                                        : (theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}
                                      ${isSelected 
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                                        : (theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-100')}
                                      ${isToday && !isSelected 
                                        ? (theme === 'dark' ? 'border border-emerald-500/50 text-emerald-400' : 'border border-blue-200 text-blue-600') 
                                        : ''}
                                    `}
                                  >
                                    {format(day, 'd')}
                                  </button>
                                );
                              })}
                            </div>

                            <div className={`mt-4 pt-3 border-t flex items-center justify-between ${theme === 'dark' ? 'border-white/5' : 'border-gray-100'}`}>
                              <span className={`text-[9px] font-bold uppercase ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                                {task.recurrentDates?.length || 0} dias selecionados
                              </span>
                              <button 
                                onClick={() => {
                                  setTasks(tasks.map(t => {
                                    if (t.id === task.id) {
                                      return { ...t, recurrentDates: [] };
                                    }
                                    return t;
                                  }));
                                }}
                                className={`text-[9px] font-bold uppercase transition-colors ${theme === 'dark' ? 'text-red-500/70 hover:text-red-400' : 'text-red-400 hover:text-red-500'}`}
                              >
                                Limpar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Saved Recurrences (Display only) */}
                        {task.recurrentDates && task.recurrentDates.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1 max-w-[120px] mt-1">
                            {task.recurrentDates.map(date => (
                              <button 
                                key={date}
                                onClick={() => toggleRecurrentDate(task.id, date)}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all border ${
                                  theme === 'dark' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30' 
                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100'
                                }`}
                              >
                                {format(parseISO(date), 'dd/MM')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="w-20 flex justify-center">
                      <div className={`px-3 py-1.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                        task.status === 'completed' 
                          ? (theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-100/50 text-emerald-700') 
                          : (theme === 'dark' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-amber-100 text-amber-700 shadow-sm')
                      }`}>
                        {task.status === 'completed' ? 'Concluída' : 'Pendente'}
                      </div>
                    </div>

                    <div className="w-24 flex justify-center">
                      {task.dueDate ? (
                        (() => {
                          const due = new Date(task.dueDate);
                          const fifteenMinsBefore = subMinutes(due, 15);
                          const now = currentTime;
                          
                          let status = 'Em tempo';
                          let colorClass = theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-100 text-emerald-700';
                          
                          if (now > due) {
                            status = 'Atrasado';
                            colorClass = theme === 'dark' ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 scale-110' : 'bg-red-600 text-white shadow-xl shadow-red-600/30 scale-110';
                          } else if (now > fifteenMinsBefore) {
                            status = 'Em breve';
                            colorClass = theme === 'dark' ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40 scale-110' : 'bg-orange-500 text-white shadow-xl shadow-orange-500/30 scale-110';
                          }
                          
                          return (
                            <div className={`px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${colorClass}`}>
                              {status}
                            </div>
                          );
                        })()
                      ) : (
                        <span className={`text-[12px] ${theme === 'dark' ? 'text-gray-800' : 'text-gray-200'}`}>-</span>
                      )}
                    </div>
                  </div>

                  <button 
                      onClick={() => deleteTask(task.id)}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${
                        theme === 'dark' ? 'text-gray-600 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-center py-20 rounded-3xl border border-dashed transition-all ${
                  theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'
                }`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'
                }`}>
                  <Search className={`w-8 h-8 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
                </div>
                <h3 className={`text-lg font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Nenhuma tarefa encontrada</h3>
                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Tente ajustar sua busca ou filtros.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Task Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border transition-all ${
                theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'
              }`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Nova Tarefa</h2>
                  <button 
                    onClick={() => setIsAdding(false)}
                    className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={addTask} className="space-y-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ml-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Título
                    </label>
                    <textarea 
                      autoFocus
                      required
                      rows={3}
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.altKey) {
                          e.preventDefault();
                          const now = new Date();
                          const timestamp = `${format(now, 'yy/MM/dd')} ${format(now, 'eee', { locale: ptBR }).replace('.', '').toUpperCase()} ${format(now, 'HH:mm:ss')}`;
                          const cursorPosition = e.currentTarget.selectionStart;
                          const textBefore = newTitle.substring(0, cursorPosition);
                          const textAfter = newTitle.substring(cursorPosition);
                          setNewTitle(`${textBefore}\n${timestamp} - ${textAfter}`);
                        } else if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          addTask(e as any);
                        }
                      }}
                      placeholder="O que precisa ser feito?"
                      className={`w-full px-4 py-3 rounded-2xl transition-all outline-none resize-none border ${
                        theme === 'dark' 
                          ? 'bg-[#1a1a1a] border-white/5 text-white focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30' 
                          : 'bg-gray-50 border-transparent focus:ring-2 focus:ring-black/5'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ml-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Próxima Atualização
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {(['15', '30', '60'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNewNextUpdateType(newNextUpdateType === type ? null : type)}
                            className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black transition-all border ${
                              newNextUpdateType === type 
                                ? (theme === 'dark' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-blue-600 text-white border-blue-600 shadow-md')
                                : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-transparent hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-gray-50 text-gray-400 border-transparent hover:border-blue-200 hover:text-blue-500')
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {(['D1', 'D2', 'D3'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNewNextUpdateType(newNextUpdateType === type ? null : type)}
                            className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black transition-all border ${
                              newNextUpdateType === type 
                                ? (theme === 'dark' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-blue-600 text-white border-blue-600 shadow-md')
                                : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-transparent hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-gray-50 text-gray-400 border-transparent hover:border-blue-200 hover:text-blue-500')
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {(['D5', 'D7', 'D14', 'M1'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNewNextUpdateType(newNextUpdateType === type ? null : type)}
                            className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black transition-all border ${
                              newNextUpdateType === type 
                                ? (theme === 'dark' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-blue-600 text-white border-blue-600 shadow-md')
                                : (theme === 'dark' ? 'bg-white/5 text-gray-500 border-transparent hover:border-emerald-500/30 hover:text-emerald-400' : 'bg-gray-50 text-gray-400 border-transparent hover:border-blue-200 hover:text-blue-500')
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className={`flex-1 px-4 py-3 rounded-2xl font-semibold transition-all ${
                        theme === 'dark' ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className={`flex-2 px-4 py-3 rounded-2xl font-semibold shadow-lg transition-all ${
                        theme === 'dark' ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-900/20' : 'bg-[#1a1a1a] text-white hover:bg-[#333] shadow-black/10'
                      }`}
                    >
                      Criar Tarefa
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {alertMessage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border ${
                theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'
              }`}
            >
              <div className="p-6 text-center">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                  theme === 'dark' ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-500'
                }`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Atenção
                </h3>
                <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {alertMessage}
                </p>
              </div>
              <div className={`p-4 border-t flex justify-center ${
                theme === 'dark' ? 'border-white/5 bg-white/5' : 'border-gray-50 bg-gray-50/50'
              }`}>
                <button
                  onClick={() => setAlertMessage(null)}
                  className={`px-8 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                    theme === 'dark' 
                      ? 'bg-white text-black hover:bg-gray-200' 
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border ${
                theme === 'dark' ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'
              }`}
            >
              <div className="p-6 text-center">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                  theme === 'dark' ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-500'
                }`}>
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Confirmar Ação
                </h3>
                <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {confirmConfig.message}
                </p>
              </div>
              <div className={`p-4 border-t grid grid-cols-2 gap-3 ${
                theme === 'dark' ? 'border-white/5 bg-white/5' : 'border-gray-50 bg-gray-50/50'
              }`}>
                <button
                  onClick={() => setConfirmConfig(null)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                    theme === 'dark' 
                      ? 'bg-white/5 text-gray-400 hover:bg-white/10' 
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmConfig.onConfirm}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Footer (Optional) */}
      <div className={`max-w-[98%] mx-auto mt-12 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold uppercase tracking-widest transition-all ${
        theme === 'dark' ? 'border-white/10 text-gray-500' : 'border-gray-200 text-gray-400'
      }`}>
        <div className="flex gap-6">
          <span>Total: {tasks.length}</span>
          <span>Pendentes: {tasks.filter(t => t.status === 'pending').length}</span>
          <span>Concluídas: {tasks.filter(t => t.status === 'completed').length}</span>
        </div>
        <div>
          © 2026 {appTitle}
        </div>
      </div>
    </div>
  );
}
