import { getLocale } from './i18n.mjs';

export const UTC8_TIME_ZONE = 'Asia/Hong_Kong';

export function utc8InputToIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Enter a valid UTC+8 date and time');

  const [, year, month, day, hour, minute, second = '00'] = match;
  return new Date(Date.UTC(year, Number(month) - 1, day, Number(hour) - 8, minute, second)).toISOString();
}

export function formatUtc8(value) {
  return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : getLocale(), {
    timeZone: UTC8_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}
