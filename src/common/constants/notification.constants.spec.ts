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

    it('maps supported locale codes including BCP-47 and Prisma enums', () => {
      expect(toNotificationLocaleCode('ja')).toBe('ja');
      expect(toNotificationLocaleCode('JA')).toBe('ja');
      expect(toNotificationLocaleCode('ko-KR')).toBe('ko');
      expect(toNotificationLocaleCode('de_DE')).toBe('de');
      expect(toNotificationLocaleCode('FR')).toBe('fr');
      expect(toNotificationLocaleCode('it-CH')).toBe('it');
    });

    it('falls back to en for unknown languages', () => {
      expect(toNotificationLocaleCode('en')).toBe('en');
      expect(toNotificationLocaleCode('EN')).toBe('en');
      expect(toNotificationLocaleCode('zh-CN')).toBe('en');
      expect(toNotificationLocaleCode('es')).toBe('en');
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
      expect(getLocalizedNotification(NOTIFICATION_TYPES.TOP_100_EXITED, 'ja')).toEqual({
        title: 'トップ100',
        body: 'トップ100から外れました。戻って順位を上げましょう。',
      });
      expect(getLocalizedNotification(NOTIFICATION_TYPES.TOP_100_EXITED, 'fr')).toEqual({
        title: 'Top 100',
        body: 'Vous avez quitté le Top 100. Revenez pour améliorer votre classement.',
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
      expect(getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'ko', { rank: 5 })).toEqual({
        title: '주간 순위 업데이트',
        body: '현재 순위는 #5입니다.',
      });
      expect(getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'de', { rank: 9 })).toEqual({
        title: 'Wöchentliches Ranking',
        body: 'Du bist aktuell auf Platz #9.',
      });
    });

    it('replaces every occurrence of a placeholder', () => {
      const content = getLocalizedNotification(NOTIFICATION_TYPES.RANK_PUSH, 'en', { rank: 7 });
      expect(content.body).not.toContain('{{rank}}');
      expect(content.body).toContain('#7');
    });
  });
});
