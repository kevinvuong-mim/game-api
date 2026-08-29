import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';

import {
  type NotificationType,
  FCM_ANDROID_CHANNEL_ID,
  getLocalizedNotification,
  toNotificationLocaleCode,
} from '@/common/constants';

export interface PushNotificationPayload {
  route: string;
  locale?: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
}

export interface PushSendResult {
  success: boolean;
  invalidToken?: boolean;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);

  private messaging: admin.messaging.Messaging | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const privateKey = this.resolvePrivateKey();
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase is not configured — push notifications are disabled');
      return;
    }

    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });
      }

      this.messaging = admin.messaging();
      this.logger.log('Firebase Admin SDK initialized');
    } catch (error: unknown) {
      this.messaging = null;
      this.logger.error(
        'Firebase Admin SDK failed to initialize — push notifications are disabled',
        error,
      );
    }
  }

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  async sendToToken(token: string, payload: PushNotificationPayload): Promise<PushSendResult> {
    if (!this.messaging) {
      this.logger.debug('Skipping push notification because Firebase is disabled');
      return { success: false };
    }

    const locale = toNotificationLocaleCode(payload.locale);
    const content = getLocalizedNotification(payload.type, locale, payload.params);

    try {
      await this.messaging.send({
        token,
        notification: {
          body: content.body,
          title: content.title,
        },
        data: {
          type: payload.type,
          route: payload.route,
          ...Object.fromEntries(
            Object.entries(payload.params ?? {}).map(([key, value]) => [key, String(value)]),
          ),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: FCM_ANDROID_CHANNEL_ID,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });

      return { success: true };
    } catch (error) {
      if (this.isInvalidTokenError(error)) {
        return { success: false, invalidToken: true };
      }

      this.logger.error('Failed to send FCM notification', error);
      return { success: false };
    }
  }

  private resolvePrivateKey(): string | undefined {
    const raw = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
    if (!raw) {
      return undefined;
    }

    return raw.replace(/\\n/g, '\n');
  }

  private isInvalidTokenError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const code = (error as Error & { code?: string }).code;
    return (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    );
  }
}
