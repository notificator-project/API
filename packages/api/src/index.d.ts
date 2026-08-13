export type NotificationCategory = "info" | "task" | "promo";
export type NotificationSeverity = "info" | "warning" | "error" | "critical";

export interface HiveMqCloudConfig {
  version: 1;
  provider: "hivemq_cloud";
  host: string;
  port: 8884;
  path: "/mqtt";
  username: string;
  password: string;
  topicPrefix?: string;
}

export interface NotificationPayload {
  title?: string;
  body?: string;
  message?: string;
  source?: string;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  sendPush?: boolean;
  sendEmail?: boolean;
  sendMqtt?: boolean;
  strictDelivery?: boolean;
  deviceId?: string;
  mqttQos?: 0 | 1 | 2;
  mqttConnection?: { mode: "custom" };
  mqttConfig?: HiveMqCloudConfig;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NotificationResult {
  ok: true;
  kind: "external_notification";
  stored: boolean;
  pushSent: boolean;
  pushAttempted: number;
  pushEnabled: boolean;
  emailEnabled: boolean;
  emailSent?: boolean;
  mqttEnabled: boolean;
  mqttPublishedCount: number;
  mqttFailedCount: number;
  mqttSkipped: boolean;
  mqttSkipReason?: string;
  warnings?: string[];
  timestamp: string;
  [key: string]: unknown;
}

export interface ClientOptions {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class NotificatorApiError extends Error {
  status: number | null;
  code: string | null;
  details: unknown;
}

export class NotificatorClient {
  constructor(options?: ClientOptions);
  notify(
    payload: NotificationPayload,
    options?: RequestOptions,
  ): Promise<NotificationResult>;
  getMetadata(options?: RequestOptions): Promise<Record<string, unknown>>;
}

export function createNotificatorClient(
  options?: ClientOptions,
): NotificatorClient;
export const DEFAULT_ENDPOINT: "https://api.notificator-project.com";
