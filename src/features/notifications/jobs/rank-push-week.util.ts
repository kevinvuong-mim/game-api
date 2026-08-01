import { NOTIFICATION_CRON } from '@/common/constants';

/** Calendar week key in the notification timezone — used for BullMQ jobId dedupe. */
export function getRankPushWeekKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    year: 'numeric',
    month: '2-digit',
    timeZone: NOTIFICATION_CRON.TIMEZONE,
  });
  const parts = formatter.formatToParts(now);

  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  const utc = Date.UTC(year, month - 1, day);

  const date = new Date(utc);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
