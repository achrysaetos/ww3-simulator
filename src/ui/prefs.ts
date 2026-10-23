/**
 * Settings the player keeps between games, in localStorage. Storage can be missing or blocked
 * (a private window, a sandboxed frame), so a read falls back to the default and a write that
 * fails is dropped: the game plays the same, it just forgets.
 */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storage = (): KeyValue | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function readPref(key: string, store: KeyValue | null = storage()): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string, store: KeyValue | null = storage()): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* forgotten next session */
  }
}

/** The staff answers crises with its recommendation and says so, so the clock never waits on the player. Off by default. */
export const AUTO_ACCEPT_KEY = 'ww3.autoAccept';
export const autoAcceptOn = (store?: KeyValue | null) => readPref(AUTO_ACCEPT_KEY, store) === 'on';
export const setAutoAccept = (on: boolean, store?: KeyValue | null) => writePref(AUTO_ACCEPT_KEY, on ? 'on' : 'off', store);
