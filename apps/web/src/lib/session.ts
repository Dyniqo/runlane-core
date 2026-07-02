import type { Session } from '../types';

const sessionKey = 'runlane.session';
const themeKey = 'runlane.theme';
const demoSessionKey = 'runlane.demoSessionId';

export type ThemeMode = 'light' | 'dark';

export function readSession(): Session | null {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(sessionKey);
}

export function readTheme(): ThemeMode {
  const saved = localStorage.getItem(themeKey);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function writeTheme(theme: ThemeMode): void {
  localStorage.setItem(themeKey, theme);
}

export function readDemoSessionId(): string {
  const saved = localStorage.getItem(demoSessionKey);
  if (saved && saved.length >= 8) return saved;
  const created = crypto.randomUUID
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(demoSessionKey, created);
  return created;
}
