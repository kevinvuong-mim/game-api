/** Must match Android notification channel created by game-app client. */
export const FCM_ANDROID_CHANNEL_ID = 'game_alerts';

export const NOTIFICATION_CRON = {
  TIMEZONE: 'Asia/Ho_Chi_Minh',
} as const;

export const NOTIFICATION_QUEUE = {
  RANK_PUSH: 'rank-push-notification',
} as const;

export const NOTIFICATION_JOB = {
  SEND_RANK_PUSH_BATCH: 'send-rank-push-batch',
} as const;

export const RANK_PUSH_BATCH_SIZE = 500;
export const RANK_PUSH_SEND_CONCURRENCY = 10;
export const RANK_PUSH_LOCK_DURATION_MS = 120_000;

export const NOTIFICATION_ROUTES = {
  LEADERBOARD: 'Leaderboard',
} as const;

export const NOTIFICATION_TYPES = {
  RANK_PUSH: 'rank_push',
  TOP_100_EXITED: 'top_100_exited',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_LOCALE_CODES = ['en', 'vi', 'ja', 'ko', 'de', 'fr', 'it'] as const;

export type NotificationLocaleCode = (typeof NOTIFICATION_LOCALE_CODES)[number];

const NOTIFICATION_LOCALE_SET = new Set<string>(NOTIFICATION_LOCALE_CODES);

export interface LocalizedNotificationContent {
  body: string;
  title: string;
}

const NOTIFICATION_I18N: Record<
  string,
  Record<NotificationLocaleCode, LocalizedNotificationContent>
> = {
  [NOTIFICATION_TYPES.TOP_100_EXITED]: {
    en: {
      title: 'Top 100',
      body: 'You left Top 100. Come back to improve your rank.',
    },
    vi: {
      title: 'Top 100',
      body: 'Bạn đã rời Top 100. Hãy quay lại để cải thiện thứ hạng.',
    },
    ja: {
      title: 'トップ100',
      body: 'トップ100から外れました。戻って順位を上げましょう。',
    },
    ko: {
      title: '톱 100',
      body: '톱 100에서 밀려났습니다. 돌아와서 순위를 올려보세요.',
    },
    de: {
      title: 'Top 100',
      body: 'Du bist aus den Top 100 gefallen. Komm zurück und verbessere deinen Rang.',
    },
    fr: {
      title: 'Top 100',
      body: 'Vous avez quitté le Top 100. Revenez pour améliorer votre classement.',
    },
    it: {
      title: 'Top 100',
      body: 'Sei uscito dalla Top 100. Torna per migliorare la tua posizione.',
    },
  },
  [NOTIFICATION_TYPES.RANK_PUSH]: {
    en: {
      title: 'Weekly Rank Update',
      body: 'You are currently ranked #{{rank}}.',
    },
    vi: {
      title: 'Cập nhật thứ hạng',
      body: 'Hiện bạn đang đứng hạng #{{rank}}.',
    },
    ja: {
      title: '週間ランキング',
      body: '現在の順位は #{{rank}} です。',
    },
    ko: {
      title: '주간 순위 업데이트',
      body: '현재 순위는 #{{rank}}입니다.',
    },
    de: {
      title: 'Wöchentliches Ranking',
      body: 'Du bist aktuell auf Platz #{{rank}}.',
    },
    fr: {
      title: 'Classement de la semaine',
      body: 'Vous êtes actuellement classé #{{rank}}.',
    },
    it: {
      title: 'Classifica settimanale',
      body: 'Al momento sei al posto #{{rank}}.',
    },
  },
};

/** Map Prisma enums, BCP-47, or lowercase codes to notification locale. */
export function toNotificationLocaleCode(locale?: string | null): NotificationLocaleCode {
  if (!locale) return 'en';
  const code = locale.trim().split(/[-_]/)[0]?.toLowerCase();
  if (code && NOTIFICATION_LOCALE_SET.has(code)) {
    return code as NotificationLocaleCode;
  }
  return 'en';
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
    body: interpolate(template.body, params),
    title: interpolate(template.title, params),
  };
}

function interpolate(text: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
    text,
  );
}
