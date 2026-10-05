import { useSyncExternalStore } from 'react';
import zhHK from '../locales/zh-HK.mjs';

export const LOCALE_KEY = 'liulianbot.locale';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'zh-HK']);
const listeners = new Set();
const MESSAGE = Symbol('localized-message');
let locale;

export function normalizeLocale(value) {
  const tag = String(value || '').replaceAll('_', '-').toLowerCase();
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-HK';
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  return null;
}

export function detectLocale(storage = globalThis.localStorage, languages = globalThis.navigator?.languages || []) {
  try {
    const saved = normalizeLocale(storage?.getItem(LOCALE_KEY));
    if (saved) return saved;
  } catch { /* Blocked browser storage does not prevent language selection. */ }
  for (const language of languages) {
    const supported = normalizeLocale(language);
    if (supported) return supported;
  }
  return 'en';
}

export function getLocale() {
  if (!locale) {
    // Access to the localStorage property itself can throw in private contexts.
    try { locale = detectLocale(); } catch { locale = detectLocale(null); }
  }
  return locale;
}

export function setLocale(value) {
  const next = normalizeLocale(value);
  if (!next) return;
  locale = next;
  try { globalThis.localStorage?.setItem(LOCALE_KEY, next); } catch { /* In-memory fallback. */ }
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => 'en');
}

// Store a message descriptor in state so switching language also updates an
// already-visible notification, without touching interpolated user values.
export function message(source, values = {}) {
  return { [MESSAGE]: true, source, values };
}

// Only explicit interface strings are translated. User content is never passed
// through this function; interpolation values remain plain React text.
export function t(source, values = {}, language = getLocale()) {
  if (source?.[MESSAGE]) return t(source.source, Object.fromEntries(
    Object.entries(source.values).map(([key, value]) => [key, value?.[MESSAGE] ? t(value, {}, language) : value]),
  ), language);
  if (typeof source !== 'string') return source;
  const key = source.trim();
  const translated = language === 'zh-HK' && Object.hasOwn(zhHK, key)
    ? source.slice(0, source.indexOf(key)) + zhHK[key] + source.slice(source.indexOf(key) + key.length)
    : source;
  return translated.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
