/**
 * One quick-save slot in the browser's IndexedDB (a save is several MB, past localStorage's
 * quota). Storage can be missing or blocked, so every call resolves to null rather than
 * throwing; a downloaded file is the durable copy.
 */
const DB = 'ww3-saves';
const STORE = 'slots';
const KEY = 'quick';

export interface SlotInfo { scenario: string; tick: number; savedAt: string; dtHours: number }
interface Slot extends Omit<SlotInfo, 'dtHours'> { text: string }

/** A save's hours per tick, read off its text rather than parsing several MB of JSON for one number. */
export function dtHoursIn(text: string): number {
  const m = /"dtHours":(\d+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]) : NaN;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSlot(slot: Slot): Promise<boolean> {
  return (await run('readwrite', (s) => s.put(slot, KEY))) !== null;
}

export async function readSlot(): Promise<Slot | null> {
  return run<Slot>('readonly', (s) => s.get(KEY));
}
