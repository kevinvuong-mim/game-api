import { getRankPushWeekKey } from '@/features/notifications/jobs/rank-push-week.util';

describe('getRankPushWeekKey', () => {
  it('returns an ISO week key in YYYY-Www format', () => {
    expect(getRankPushWeekKey(new Date('2026-08-17T00:00:00.000Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('uses the Vietnam calendar date, not the UTC date, around midnight', () => {
    const lateUtcSunday = new Date('2026-08-16T17:30:00.000Z');
    const mondayVn = new Date('2026-08-16T17:00:00.000Z');
    const sundayVn = new Date('2026-08-16T16:00:00.000Z');

    expect(getRankPushWeekKey(mondayVn)).toBe(getRankPushWeekKey(lateUtcSunday));
    expect(getRankPushWeekKey(sundayVn)).not.toBe(getRankPushWeekKey(mondayVn));
  });

  it('places early January dates in the previous ISO week-year when needed', () => {
    expect(getRankPushWeekKey(new Date('2026-01-01T00:00:00.000+07:00'))).toBe('2026-W01');
  });

  it('keeps dates in the same ISO week on a stable key', () => {
    const monday = new Date('2026-08-17T03:00:00.000+07:00');
    const sunday = new Date('2026-08-23T12:00:00.000+07:00');
    expect(getRankPushWeekKey(monday)).toBe(getRankPushWeekKey(sunday));
    expect(getRankPushWeekKey(monday)).toBe('2026-W34');
  });
});
