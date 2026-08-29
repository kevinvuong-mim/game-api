import {
  NOTIFICATION_TYPES,
  getLocalizedNotification,
  toNotificationLocaleCode,
} from '@/common/constants/notification.constants';

describe('notification.constants', () => {
  describe('toNotificationLocaleCode', () => {
    it('defaults to en when locale is missing', () => {
      expect(toNotificationLocaleCode()).toBe('en');
      expect(toNotificationLocaleCode(null)).toBe('en');
      expect(toNotificationLocaleCode('')).toBe('en');
    });

    it('maps Vietnamese codes including BCP-47 and Prisma enums', () => {
      expect(toNotificationLocaleCode('vi')).toBe('vi');
      expect(toNotificationLocaleCode('VI')).toBe('vi');
      expect(toNotificationLocaleCode('vi-VN')).toBe('vi');
      expect(toNotificationLocaleCode('vi_VN')).toBe('vi');
    });

    it('falls back to en for unknown languages', () => {
      expect(toNotificationLocaleCode('en')).toBe('en');
      expect(toNotificationLocaleCode('EN')).toBe('en');
      expect(toNotificationLocaleCode('fr')).toBe('en');
      expect(toNotificationLocaleCode('zh-CN')).toBe('en');
    });
  });

  describe('getLocalizedNotification', () => {
    it('returns locale-specific copy without interpolation', () => {
      expect(getLocalizedNotification(NOTIFICATION_TYPES.TOP_100_EXITED, 'en')).toEqual({
        title: 'Top 100',
        body: 'You left Top 100. Come back to improve your rank.',
      });
      expect(getLocalizedNotification(NOTIFICATION_TYPES.TOP_100_EXITED, 'vi')).toEqual({
        title: 'Top 100',
        body: 'Bạn đã rời Top 100. Hãy quay lại để cải thiện thứ hạng.',
      });
    });

    it('interpolates rank placeholders for weekly rank push', () => {
      expect(getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'en', { rank: 12 })).toEqual({
        title: 'Weekly Rank Update',
        body: 'You are currently ranked #12.',
      });
      expect(getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'vi', { rank: 3 })).toEqual({
        title: 'Cập nhật thứ hạng',
        body: 'Hiện bạn đang đứng hạng #3.',
      });
    });

    it('replaces every occurrence of a placeholder', () => {
      const content = getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'en', { rank: 7 });
      expect(content.body).not.toContain('{{rank}}');
      expect(content.body).toContain('#7');
    });
  });
});
