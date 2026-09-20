const DATE_FMT_LONG = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const DATE_FMT_SHORT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

const MONTH_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
});

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
});

export function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatDateLong(date: string): string {
  return DATE_FMT_LONG.format(utcDate(date));
}

export function formatDateShort(date: string): string {
  return DATE_FMT_SHORT.format(utcDate(date));
}

export function formatMonthYear(year: string, month: string): string {
  return MONTH_FMT.format(new Date(`${year}-${month}-01T00:00:00Z`));
}

export function formatWeekday(date: string): string {
  return WEEKDAY_FMT.format(utcDate(date));
}

export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return TIME_FMT.format(parsed);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function pad(value: number | string, length = 2): string {
  return String(value).padStart(length, '0');
}

export function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}
