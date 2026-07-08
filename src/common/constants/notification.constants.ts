export const TOP_100_THRESHOLD = 100;

/** Must match Android notification channel created by game-starter-kit client. */
export const FCM_ANDROID_CHANNEL_ID = 'game_alerts';

export const NOTIFICATION_CRON = {
  SATURDAY_RANK: '0 9 * * 6',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
} as const;

export const NOTIFICATION_QUEUE = {
  FCM_DELIVERY: 'fcm-delivery',
  SATURDAY_RANK: 'saturday-rank-notification',
} as const;

export const NOTIFICATION_JOB = {
  DELIVER_FCM: 'deliver-fcm',
  SEND_SATURDAY_RANK_BATCH: 'send-saturday-rank-batch',
  START_SATURDAY_BROADCAST: 'start-saturday-broadcast',
} as const;

export const SATURDAY_RANK_BATCH_SIZE = 500;

export const NOTIFICATION_ROUTES = {
  LEADERBOARD: 'Leaderboard',
} as const;

export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[keyof typeof NOTIFICATION_ROUTES];

export const NOTIFICATION_TYPES = {
  SATURDAY_RANK: 'saturday_rank',
  TOP_100_EXITED: 'top_100_exited',
  TOP_100_ENTERED: 'top_100_entered',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationLocaleCode = 'en' | 'vi';

export interface LocalizedNotificationContent {
  title: string;
  body: string;
}

export const NOTIFICATION_I18N: Record<
  string,
  Record<NotificationLocaleCode, LocalizedNotificationContent>
> = {
  [NOTIFICATION_TYPES.TOP_100_ENTERED]: {
    en: {
      title: 'Congratulations!',
      body: 'You made it to Top 100!',
    },
    vi: {
      title: 'Chúc mừng!',
      body: 'Bạn đã lọt Top 100.',
    },
  },
  [NOTIFICATION_TYPES.TOP_100_EXITED]: {
    en: {
      title: 'Top 100',
      body: 'You left Top 100. Come back to improve your rank.',
    },
    vi: {
      title: 'Top 100',
      body: 'Bạn đã rời Top 100. Hãy quay lại để cải thiện thứ hạng.',
    },
  },
  [NOTIFICATION_TYPES.SATURDAY_RANK]: {
    en: {
      title: 'Weekly Rank Update',
      body: 'You are currently ranked #{{rank}}.',
    },
    vi: {
      title: 'Cập nhật thứ hạng',
      body: 'Hiện bạn đang đứng hạng #{{rank}}.',
    },
  },
};

export function resolveNotificationLocale(locale?: string | null): NotificationLocaleCode {
  const code = locale?.split('-')[0]?.toLowerCase();
  return code === 'vi' ? 'vi' : 'en';
}

export function getLocalizedNotification(
  type: NotificationType,
  locale: NotificationLocaleCode,
  params?: Record<string, string | number>,
): LocalizedNotificationContent {
  const template = NOTIFICATION_I18N[type][locale] ?? NOTIFICATION_I18N[type].en;
  if (!params) {
    return template;
  }

  return {
    title: interpolate(template.title, params),
    body: interpolate(template.body, params),
  };
}

function interpolate(text: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
    text,
  );
}
