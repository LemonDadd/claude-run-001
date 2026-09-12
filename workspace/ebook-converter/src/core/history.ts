import type { HistoryEntry } from './types';

const STORAGE_KEY = 'ebook-converter-history';
const MAX_ENTRIES = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** 写入一条历史（最新在前，最多 20 条） */
export function addHistory(entry: Omit<HistoryEntry, 'id' | 'time'>): HistoryEntry {
  const record: HistoryEntry = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: Date.now(),
    ...entry,
  };
  const list = [record, ...loadHistory()].slice(0, MAX_ENTRIES);
  saveHistory(list);
  return record;
}

export function clearHistory(): void {
  saveHistory([]);
}

function saveHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存储满或隐私模式下静默失败
  }
}
