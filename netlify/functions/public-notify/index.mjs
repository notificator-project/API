import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import mqtt from "mqtt";

/**
 * Standard JSON response helper with CORS headers for all supported methods.
 */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key, x-wpnotif-key",
    },
  });
}

/**
 * Builds the OpenAPI document served by GET ?format=openapi.
 */
function getOpenApiSpec(serverUrl) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Notificator Project Public Notify API",
      version: "1.0.0",
      description:
        "Public API for ingesting third-party notifications, storing encrypted payloads, and dispatching push and optional MQTT delivery.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/": {
        post: {
          summary: "Send external notification",
          description:
            "Creates and dispatches a third-party notification. The endpoint normalizes common webhook formats, enforces API key policy, and supports push plus optional MQTT fan-out.",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }, { wpnotifKeyHeader: [] }],
          requestBody: {
            required: false,
            description:
              "Provide at least one meaningful notification field (for example title, body, message, category, severity, payload, or data).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublicNotifyRequest" },
                examples: {
                  minimal: {
                    summary: "Minimal payload",
                    value: {
                      title: "Deployment Completed",
                      body: "Version 2.4.1 is now live.",
                    },
                  },
                  serviceEvent: {
                    summary: "Service event payload",
                    value: {
                      category: "task",
                      severity: "warning",
                      title: "Queue Backlog High",
                      body: "Order queue is above threshold.",
                      source: "erp_worker",
                      serviceName: "ERP Worker",
                      eventName: "QueueBacklogHigh",
                      queue: "orders",
                      pending: 182,
                      cluster: "eu-west-1",
                    },
                  },
                  strictDelivery: {
                    summary: "Fail-fast MQTT mode",
                    value: {
                      title: "Queue Backlog High",
                      body: "Order queue is above threshold.",
                      source: "erp_worker",
                      sendMqtt: true,
                      strictDelivery: true,
                      payload: {
                        queue: "orders",
                        pending: 182,
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Notification processed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicNotifySuccess" },
                  examples: {
                    fullSuccess: {
                      summary: "Stored + push + MQTT success",
                      value: {
                        ok: true,
                        kind: "external_notification",
                        stored: true,
                        pushSent: true,
                        pushAttempted: 1,
                        pushEnabled: true,
                        emailEnabled: false,
                        mqttPublishedCount: 1,
                        mqttFailedCount: 0,
                        mqttSkipped: false,
                        mqttEnabled: true,
                        timestamp: "2026-03-29T12:00:00.000Z",
                      },
                    },
                    partialSuccess: {
                      summary: "Stored/push success with MQTT failure (default mode)",
                      value: {
                        ok: true,
                        kind: "external_notification",
                        stored: true,
                        pushSent: true,
                        pushAttempted: 1,
                        pushEnabled: true,
                        emailEnabled: false,
                        mqttPublishedCount: 0,
                        mqttFailedCount: 1,
                        mqttError: "Publish failed",
                        warnings: ["mqtt_publish_failed_partial"],
                        mqttSkipped: false,
                        mqttEnabled: true,
                        timestamp: "2026-03-29T12:00:00.000Z",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request body or empty payload",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  examples: {
                    invalidBody: {
                      value: { error: "Invalid request body" },
                    },
                    emptyPayload: {
                      value: {
                        error: "Request payload is empty",
                        hint: "Provide at least one meaningful field such as title, body, message, category, severity, payload, or data.",
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized (missing/invalid API key or origin restriction)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  examples: {
                    missingAuth: {
                      value: { error: "Authorization required" },
                    },
                    invalidKey: {
                      value: { error: "Invalid API key" },
                    },
                    keyType: {
                      value: { error: "API key type not allowed for this endpoint. Use a public_client or internal_service key." },
                    },
                    domainPolicy: {
                      value: { error: "Origin is not allowed for this API key" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Device not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "409": {
              description: "Target device inactive or paused",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "502": {
              description: "MQTT publish failure (strictDelivery=true)",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/ErrorResponse" },
                      {
                        type: "object",
                        properties: {
                          ok: { type: "boolean", example: false },
                          details: { type: "string" },
                        },
                      },
                    ],
                  },
                  examples: {
                    strictDeliveryFailure: {
                      value: {
                        ok: false,
                        error: "MQTT publish failed",
                        details: "Connection timeout",
                        stored: true,
                        pushSent: true,
                        pushAttempted: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          summary: "Function metadata",
          description: "Returns endpoint capabilities and usage guidance. Add ?format=openapi to return OpenAPI JSON.",
          responses: {
            "200": {
              description: "Metadata response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
        wpnotifKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "x-wpnotif-key",
        },
      },
      schemas: {
        PublicNotifyRequest: {
          type: "object",
          description:
            "External notification payload. Additional top-level fields are accepted and merged into downstream notification data.",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            category: { type: "string", enum: ["info", "task", "promo", "information", "tasks", "sale", "sales", "promotion", "promotions"] },
            severity: { type: "string", enum: ["info", "warning", "error", "critical", "warn", "crit"] },
            source: { type: "string", description: "Source system identifier; can be used as service fallback." },
            sendPush: { type: "boolean", default: true },
            sendMqtt: { type: "boolean", default: true },
            strictDelivery: { type: "boolean", default: false, description: "When true, MQTT publish failures return 502 instead of partial success." },
            deviceId: { type: "string" },
            mqttQos: { type: "integer", minimum: 0, maximum: 2 },
            payload: { type: "object", additionalProperties: true },
            data: { type: "object", additionalProperties: true },
          },
          additionalProperties: true,
        },
        PublicNotifySuccess: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            kind: { type: "string", example: "external_notification" },
            stored: { type: "boolean" },
            storeReason: { type: "string" },
            payloadPreview: {
              type: "object",
              properties: {
                type: { type: "string", example: "external_notification" },
                title: { type: "string" },
                body: { type: "string" },
                source: { type: "string" },
                category: { type: "string" },
                severity: { type: ["string", "null"] },
                dataKeys: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
            pushSent: { type: "boolean" },
            pushAttempted: { type: "integer" },
            pushEnabled: { type: "boolean" },
            emailEnabled: { type: "boolean", example: false },
            mqttPublishedCount: { type: "integer" },
            mqttFailedCount: { type: "integer" },
            mqttSkipped: { type: "boolean" },
            mqttSkipReason: { type: "string" },
            mqttError: { type: "string" },
            warnings: {
              type: "array",
              items: { type: "string" },
            },
            mqttEnabled: { type: "boolean" },
            timestamp: { type: "string", format: "date-time" },
          },
          required: ["ok", "kind", "stored", "pushSent", "pushAttempted", "pushEnabled", "emailEnabled", "mqttPublishedCount", "mqttSkipped", "mqttEnabled", "timestamp"],
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
      },
    },
  };
}

function pickFirstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function normalizeCategory(raw) {
  const value = (raw || "").toString().toLowerCase();
  if (!value) return "info";
  if (value === "information") return "info";
  if (value === "tasks") return "task";
  if (value === "sale" || value === "sales") return "promo";
  if (value === "promotion" || value === "promotions") return "promo";
  if (["info", "task", "promo"].includes(value)) return value;
  return "info";
}

function normalizeSeverity(raw) {
  const value = (raw || "").toString().toLowerCase();
  if (!value) return null;
  if (value === "warn") return "warning";
  if (value === "crit") return "critical";
  if (["info", "warning", "error", "critical"].includes(value)) return value;
  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tryParseJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseFormEncoded(raw) {
  const params = new URLSearchParams(raw || "");
  const out = {};

  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      if (!Array.isArray(out[key])) out[key] = [out[key]];
      out[key].push(value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function parseWebhookBodyByContentType(raw, contentType) {
  const normalizedContentType = (contentType || "").toLowerCase();
  const trimmed = (raw || "").trim();

  if (!trimmed) return {};

  const parsedJson = tryParseJsonString(trimmed);
  if (parsedJson && (normalizedContentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return parsedJson;
  }

  if (normalizedContentType.includes("application/x-www-form-urlencoded")) {
    return parseFormEncoded(trimmed);
  }

  if (normalizedContentType.includes("text/plain")) {
    if (trimmed.includes("=") && trimmed.includes("&")) {
      return parseFormEncoded(trimmed);
    }
    return { body: trimmed, message: trimmed };
  }

  // Fallback: try form-style first for webhook providers that omit content-type.
  if (trimmed.includes("=") && trimmed.includes("&")) {
    return parseFormEncoded(trimmed);
  }

  // Last resort: treat raw body as message text.
  return { body: trimmed, message: trimmed };
}

/**
 * Normalizes incoming webhook payloads into a common shape used by the pipeline.
 */
function normalizeWebhookBody(body) {
  const normalized = isPlainObject(body) ? { ...body } : {};

  const payloadObj = tryParseJsonString(normalized.payload);
  if (payloadObj && isPlainObject(payloadObj)) {
    normalized.payload = payloadObj;
  }

  const dataObj = tryParseJsonString(normalized.data);
  if (dataObj && isPlainObject(dataObj)) {
    normalized.data = dataObj;
  }

  // Common webhook aliases.
  if (!normalized.title && typeof normalized.subject === "string") normalized.title = normalized.subject;
  if (!normalized.body && typeof normalized.description === "string") normalized.body = normalized.description;
  if (!normalized.body && typeof normalized.text === "string") normalized.body = normalized.text;
  if (!normalized.source && typeof normalized.service === "string") normalized.source = normalized.service;

  return normalized;
}

/**
 * Creates a service-role Supabase client used for auth, profile lookup, and persistence.
 */
async function getSupabaseServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function validateDomainWhitelist(supabase, apiKey, origin) {
  if (!origin) return { allowed: true, source: "no_origin" };
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return { allowed: true, source: "localhost" };
  }

  try {
    const url = new URL(origin);
    const requestDomain = url.hostname.replace(/^www\./, "");

    const { data, error } = await supabase
      .from("api_keys")
      .select("allowed_domains, name")
      .eq("key", apiKey)
      .is("revoked_at", null)
      .single();

    if (error || !data) {
      return { allowed: false, source: "key_lookup_failed" };
    }

    const allowedDomains = Array.isArray(data.allowed_domains)
      ? data.allowed_domains.filter(Boolean)
      : [];

    if (allowedDomains.length === 0) {
      return { allowed: true, source: "no_restrictions" };
    }

    const isAllowed = allowedDomains.some((allowedDomain) => {
      const normalizedAllowed = String(allowedDomain).toLowerCase().replace(/^www\./, "");
      return normalizedAllowed === requestDomain.toLowerCase();
    });

    return {
      allowed: isAllowed,
      source: isAllowed ? `domain:${requestDomain}` : `unauthorized:${requestDomain}`,
    };
  } catch {
    return { allowed: false, source: "domain_parse_error" };
  }
}

function isAllowedPublicApiKeyType(keyType) {
  return keyType === "public_client" || keyType === "internal_service";
}

/**
 * Validates API key existence, key type policy, and origin domain policy.
 */
async function validateApiKey(apiKey, origin = null) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) {
    return { valid: false, reason: "service_unavailable" };
  }

  try {
    const { data, error } = await supabase
      .from("api_keys")
      .select("user_id, key_type")
      .eq("key", apiKey)
      .is("revoked_at", null)
      .single();

    if (error || !data?.user_id) {
      return { valid: false, reason: "invalid_key" };
    }

    const keyType = data.key_type || "wordpress_server";
    if (!isAllowedPublicApiKeyType(keyType)) {
      return { valid: false, reason: "key_type_not_allowed", keyType };
    }

    const domainValidation = await validateDomainWhitelist(supabase, apiKey, origin);
    if (!domainValidation.allowed) {
      return {
        valid: false,
        reason: "domain_not_allowed",
        source: domainValidation.source,
      };
    }

    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key", apiKey)
      .is("revoked_at", null);

    return {
      valid: true,
      userId: data.user_id,
      keyType,
    };
  } catch {
    return { valid: false, reason: "validation_failed" };
  }
}

/**
 * Resolves credentials from supported headers and maps auth failures to explicit errors.
 */
async function handleAuthentication(req) {
  const authHeader = req.headers.get("authorization") || "";
  const apiKeyHeader = req.headers.get("x-api-key") || req.headers.get("x-wpnotif-key") || "";
  const bearerValue = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  const apiKeyCandidate = (bearerValue || apiKeyHeader || "").trim();

  if (!apiKeyCandidate) {
    return { authenticated: false, userId: null, error: "Authorization required" };
  }

  const origin = req.headers.get("origin") || req.headers.get("referer") || null;
  const validatedKey = await validateApiKey(apiKeyCandidate, origin);

  if (!validatedKey?.valid || !validatedKey?.userId) {
    if (validatedKey?.reason === "service_unavailable") {
      return { authenticated: false, userId: null, error: "Authentication service unavailable" };
    }
    if (validatedKey?.reason === "key_type_not_allowed") {
      return {
        authenticated: false,
        userId: null,
        error: "API key type not allowed for this endpoint. Use a public_client or internal_service key.",
      };
    }
    if (validatedKey?.reason === "domain_not_allowed") {
      return {
        authenticated: false,
        userId: null,
        error: "Origin is not allowed for this API key",
      };
    }
    return { authenticated: false, userId: null, error: "Invalid API key" };
  }

  return { authenticated: true, userId: validatedKey.userId };
}

function encryptNotification(notification, publicKey) {
  const keyFromString = (s) => {
    const hash = nacl.hash(naclUtil.decodeUTF8(String(s || "")));
    return hash.slice(0, 32);
  };

  const sessionKey = nacl.randomBytes(32);
  const dataNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(notification));
  const dataBox = nacl.secretbox(plaintext, dataNonce, sessionKey);

  const keyNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const wrappingKey = keyFromString(publicKey);
  const keyBox = nacl.secretbox(sessionKey, keyNonce, wrappingKey);

  return JSON.stringify({
    v: 2,
    encryptedData: naclUtil.encodeBase64(dataBox),
    dataNonce: naclUtil.encodeBase64(dataNonce),
    encryptedKey: naclUtil.encodeBase64(keyBox),
    keyNonce: naclUtil.encodeBase64(keyNonce),
  });
}

async function getUserProfilePublicKey(userId) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data?.public_key || null;
}

async function storeEncryptedNotification(userId, payload) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) return { stored: false, reason: "supabase_not_configured" };

  const publicKey = await getUserProfilePublicKey(userId);
  if (!publicKey) return { stored: false, reason: "missing_public_key" };

  const encryptedData = encryptNotification(payload, publicKey);
  const { error, data } = await supabase
    .from("encrypted_notifications")
    .insert({
      user_id: userId,
      encrypted_data: encryptedData,
      timestamp: payload.timestamp,
      read: false,
    })
    .select();

  if (error) {
    return { stored: false, reason: "db_insert_failed", details: error.message };
  }

  return { stored: true, id: data?.[0]?.id || null };
}

async function getUnreadNotificationCount(userId) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase || !userId) return null;

  const { count, error } = await supabase
    .from("encrypted_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) return null;
  return Number.isInteger(count) ? count : 0;
}

/**
 * Sends a single Expo push notification with timeout protection.
 */
async function sendPushNotification(expoPushToken, title, body, badgeCount = null) {
  const message = {
    to: expoPushToken,
    sound: "default",
    title: title || "🔔 New Notification",
    body: body || "Open the app to view details",
    data: {
      type: "notification_encrypted",
      hasNewAlerts: true,
      timestamp: new Date().toISOString(),
    },
    priority: "high",
    channelId: "default",
  };

  if (Number.isInteger(badgeCount) && badgeCount >= 0) {
    message.badge = badgeCount;
  }

  const timeoutRaw = Number.parseInt(process.env.EXPO_PUSH_TIMEOUT_MS || "10000", 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Expo push request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Expo push API returned ${response.status}: ${errText}`);
  }

  return response.json();
}

/**
 * Fan-out helper for push delivery across all enabled user tokens.
 */
async function sendPushToUserDevices(userId, { title, body }) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) return { pushSent: false, attempted: 0 };

  const { data, error } = await supabase
    .from("push_tokens")
    .select("token, enabled")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error || !Array.isArray(data) || data.length === 0) {
    return { pushSent: false, attempted: 0 };
  }

  const unreadCount = await getUnreadNotificationCount(userId);
  let pushSent = false;

  for (const row of data) {
    try {
      await sendPushNotification(row.token, title, body, unreadCount);
      pushSent = true;
    } catch {
      // Continue other tokens.
    }
  }

  return { pushSent, attempted: data.length };
}

async function getUserDeviceByDeviceId(userId, deviceId) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("devices")
    .select("id, device_id, is_active, is_paused")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .single();

  if (error) return null;
  return data || null;
}

async function getUserActiveDevices(userId) {
  const supabase = await getSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("devices")
    .select("device_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_paused", false);

  if (error) return [];
  return (data || []).filter((d) => d?.device_id);
}

/**
 * Publishes a normalized notification payload to a device MQTT topic over WSS.
 */
async function publishMqttNotification({ deviceId, payload, qos = 1, channel = "messages" }) {
  const host = process.env.HIVEMQ_HOST;
  const port = parseInt(process.env.HIVEMQ_PORT || "8884", 10);
  const path = process.env.HIVEMQ_WSS_PATH || "/mqtt";
  const username = process.env.HIVEMQ_USERNAME;
  const password = process.env.HIVEMQ_PASSWORD;

  if (!host || !username || !password) {
    throw new Error("Missing HiveMQ env vars");
  }

  const url = `wss://${host}:${port}${path}`;
  const client = mqtt.connect(url, {
    username,
    password,
    protocol: "wss",
    protocolVersion: 4,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 0,
    rejectUnauthorized: true,
  });

  await new Promise((resolve, reject) => {
    const onErr = (err) => {
      client.removeListener("connect", onConn);
      reject(err);
    };
    const onConn = () => {
      client.removeListener("error", onErr);
      resolve();
    };
    client.once("error", onErr);
    client.once("connect", onConn);
  });

  const plainDeviceId = String(deviceId || "").replace("WPNOTIF-", "");
  const safeChannel = channel === "cmd" ? "cmd" : "messages";
  const topic = `devices/${plainDeviceId}/${safeChannel}`;
  const payloadString = JSON.stringify(payload);
  const mqttQos = [0, 1, 2].includes(qos) ? qos : 1;

  await new Promise((resolve, reject) => {
    client.publish(topic, payloadString, { qos: mqttQos, retain: false }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  await new Promise((resolve) => client.end(true, {}, resolve));

  return { topic, qos: mqttQos, retain: false };
}

/**
 * Builds the canonical notification object used for encryption, push preview, and MQTT publish.
 */
function buildExternalNotificationPayload(inputBody) {
  const body = isPlainObject(inputBody) ? inputBody : {};
  const reservedKeys = new Set([
    "type",
    "title",
    "body",
    "message",
    "note",
    "notes",
    "category",
    "severity",
    "source",
    "timestamp",
    "data",
    "payload",
    "deviceId",
    "device_id",
    "uid",
    "deviceUid",
    "sendPush",
    "sendMqtt",
    "strictDelivery",
    "mqttQos",
  ]);

  const extraTopLevel = Object.fromEntries(
    Object.entries(body).filter(([key]) => !reservedKeys.has(key))
  );

  const payloadObject = isPlainObject(body.payload) ? body.payload : null;
  const dataObject = isPlainObject(body.data) ? body.data : null;

  const canonicalScenarioName = pickFirstNonEmptyString([
    body.scenario_name,
    body.scenarioName,
    body.notification_title,
    payloadObject?.scenario_name,
    payloadObject?.scenarioName,
    payloadObject?.notification_title,
    dataObject?.scenario_name,
    dataObject?.scenarioName,
    dataObject?.notification_title,
    body.title,
  ]).slice(0, 160);

  const canonicalScenarioNotes = pickFirstNonEmptyString([
    body.scenario_notes,
    body.scenarioNotes,
    body.details,
    body.description,
    payloadObject?.scenario_notes,
    payloadObject?.scenarioNotes,
    payloadObject?.details,
    payloadObject?.description,
    dataObject?.scenario_notes,
    dataObject?.scenarioNotes,
    dataObject?.details,
    dataObject?.description,
    body.body,
  ]).slice(0, 2000);

  const canonicalSiteName = pickFirstNonEmptyString([
    body.site_name,
    body.siteName,
    body.application,
    body.system,
    payloadObject?.site_name,
    payloadObject?.siteName,
    payloadObject?.application,
    payloadObject?.system,
    dataObject?.site_name,
    dataObject?.siteName,
    dataObject?.application,
    dataObject?.system,
  ]).slice(0, 200);

  const canonicalHookName = pickFirstNonEmptyString([
    body.hook_name,
    body.hookName,
    body.trigger,
    payloadObject?.hook_name,
    payloadObject?.hookName,
    payloadObject?.trigger,
    dataObject?.hook_name,
    dataObject?.hookName,
    dataObject?.trigger,
    body.event,
  ]).slice(0, 140);

  const serviceTitle = pickFirstNonEmptyString([
    body.notification_service_title,
    body.service_title,
    body.serviceTitle,
    body.service,
    body.service_name,
    body.serviceName,
    body.provider,
    body.app,
    payloadObject?.notification_service_title,
    payloadObject?.service_title,
    payloadObject?.service,
    payloadObject?.service_name,
    payloadObject?.serviceName,
    payloadObject?.provider,
    payloadObject?.app,
    dataObject?.notification_service_title,
    dataObject?.service_title,
    dataObject?.service,
    dataObject?.service_name,
    dataObject?.serviceName,
    dataObject?.provider,
    dataObject?.app,
    body.source,
  ]).slice(0, 120);
  const eventName = pickFirstNonEmptyString([
    body.event,
    body.event_name,
    body.eventName,
    body.notification_event,
    body.action,
    body.alert_type,
    body.alertType,
    payloadObject?.event,
    payloadObject?.event_name,
    payloadObject?.eventName,
    payloadObject?.notification_event,
    payloadObject?.action,
    payloadObject?.alert_type,
    payloadObject?.alertType,
    dataObject?.event,
    dataObject?.event_name,
    dataObject?.eventName,
    dataObject?.notification_event,
    dataObject?.action,
    dataObject?.alert_type,
    dataObject?.alertType,
    body.title,
  ]).slice(0, 140);

  // Keep the app-facing table shape consistent: dynamic rows come from `data`.
  // If a third-party sends `payload`, treat it as the primary data source.
  const mergedData = {
    __third_party: true,
    __notification_origin: "public_notify",
    ...(payloadObject || {}),
    ...(dataObject || {}),
    ...extraTopLevel,
  };
  if (serviceTitle && !mergedData.notification_service_title) {
    mergedData.notification_service_title = serviceTitle;
  }
  if (eventName && !mergedData.event) {
    mergedData.event = eventName;
  }
  if (canonicalScenarioName && !mergedData.scenario_name) {
    mergedData.scenario_name = canonicalScenarioName;
  }
  if (canonicalScenarioNotes && !mergedData.scenario_notes) {
    mergedData.scenario_notes = canonicalScenarioNotes;
  }
  if (canonicalSiteName && !mergedData.site_name) {
    mergedData.site_name = canonicalSiteName;
  }
  if (canonicalHookName && !mergedData.hook_name) {
    mergedData.hook_name = canonicalHookName;
  }

  const title = pickFirstNonEmptyString([
    body.title,
    body.data?.title,
    body.payload?.title,
    "External Notification",
  ]).slice(0, 140);

  const messageBody = pickFirstNonEmptyString([
    body.body,
    body.message,
    body.note,
    body.notes,
    body.data?.body,
    body.data?.message,
    body.payload?.body,
    body.payload?.message,
  ]).slice(0, 2000);

  const fallbackBody = "";

  const source = pickFirstNonEmptyString([body.source, body.payload?.source, body.data?.source, "third_party"]).slice(0, 200);
  const category = normalizeCategory(
    pickFirstNonEmptyString([body.category, body.payload?.category, body.data?.category, "general"])
  );
  const severity = normalizeSeverity(
    pickFirstNonEmptyString([body.severity, body.payload?.severity, body.data?.severity])
  );

  if (!mergedData.category) {
    mergedData.category = category;
  }
  if (severity && !mergedData.severity) {
    mergedData.severity = severity;
  }

  const timestampCandidate = (body.timestamp || "").toString().trim();
  const timestamp = timestampCandidate && !Number.isNaN(Date.parse(timestampCandidate))
    ? new Date(timestampCandidate).toISOString()
    : new Date().toISOString();

  return {
    title,
    body: messageBody || fallbackBody,
    type: "external_notification",
    category,
    ...(severity ? { severity } : {}),
    source,
    ...(Object.keys(mergedData).length ? { data: mergedData } : {}),
    timestamp,
  };
}

/**
 * Guard to reject effectively empty external requests before auth/storage/delivery work.
 */
function hasMeaningfulExternalPayload(body = {}) {
  const payloadObject = isPlainObject(body.payload) ? body.payload : null;
  const dataObject = isPlainObject(body.data) ? body.data : null;

  const primaryFields = [
    body.title,
    body.body,
    body.message,
    body.note,
    body.notes,
    body.event,
    body.event_name,
    body.eventName,
    body.service,
    body.service_title,
    body.serviceTitle,
    body.category,
    body.severity,
    payloadObject?.title,
    payloadObject?.body,
    payloadObject?.message,
    payloadObject?.event,
    payloadObject?.service,
    payloadObject?.category,
    payloadObject?.severity,
    dataObject?.title,
    dataObject?.body,
    dataObject?.message,
    dataObject?.event,
    dataObject?.service,
    dataObject?.category,
    dataObject?.severity,
  ];

  const hasPrimaryContent = primaryFields.some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number" || typeof value === "boolean") return true;
    return false;
  });

  if (hasPrimaryContent) return true;

  const payloadKeys = payloadObject ? Object.keys(payloadObject).length : 0;
  const dataKeys = dataObject ? Object.keys(dataObject).length : 0;
  return payloadKeys > 0 || dataKeys > 0;
}

/**
 * Orchestrates payload normalization, encrypted storage, push dispatch, and optional MQTT publish.
 */
async function handleExternalNotification(userId, bodyJson) {
  const payload = buildExternalNotificationPayload(bodyJson);

  const requestSendPush = typeof bodyJson?.sendPush === "boolean" ? bodyJson.sendPush : true;
  const requestSendMqtt = typeof bodyJson?.sendMqtt === "boolean" ? bodyJson.sendMqtt : true;
  const strictDelivery = bodyJson?.strictDelivery === true;

  const stored = await storeEncryptedNotification(userId, payload);

  const pushResult = requestSendPush
    ? await sendPushToUserDevices(userId, {
        title: payload.title,
        body: payload.body || "Open the app to view details",
      })
    : { pushSent: false, attempted: 0 };

  let mqttResult = null;
  let mqttError = null;
  let mqttFailedCount = 0;
  const warnings = [];
  if (requestSendMqtt) {
    const deviceUid = pickFirstNonEmptyString([
      bodyJson?.deviceId,
      bodyJson?.device_id,
      bodyJson?.uid,
      bodyJson?.deviceUid,
    ]);

    const mqttQosRaw = bodyJson?.mqttQos;
    const mqttQos = Number.isFinite(mqttQosRaw)
      ? Number(mqttQosRaw)
      : Number.parseInt(mqttQosRaw, 10);

    let targetDeviceIds = [];
    if (deviceUid) {
      const device = await getUserDeviceByDeviceId(userId, deviceUid);
      if (!device) return json({ error: "Device not found for user" }, 404);
      if (device.is_active === false || device.is_paused === true) {
        return json({ error: "Device is inactive or paused" }, 409);
      }
      targetDeviceIds = [device.device_id];
    } else {
      const devices = await getUserActiveDevices(userId);
      if (devices.length === 0) {
        mqttResult = { skipped: true, reason: "no_active_devices" };
      } else {
        targetDeviceIds = devices.map((d) => d.device_id);
      }
    }

    for (const targetDeviceId of targetDeviceIds) {
      try {
        const published = await publishMqttNotification({
          deviceId: targetDeviceId,
          payload,
          qos: mqttQos,
        });

        if (!Array.isArray(mqttResult)) mqttResult = [];
        mqttResult.push({ deviceId: targetDeviceId, ...published });
      } catch (err) {
        const details = String(err?.message || err);
        mqttFailedCount += 1;
        if (!mqttError) mqttError = details;

        if (!Array.isArray(mqttResult)) mqttResult = [];
        mqttResult.push({ deviceId: targetDeviceId, ok: false, error: details });

        if (strictDelivery) {
          return json(
            {
              ok: false,
              error: "MQTT publish failed",
              details,
              mqtt: mqttResult,
              stored: stored?.stored === true,
              pushSent: pushResult.pushSent,
              pushAttempted: pushResult.attempted,
            },
            502
          );
        }
      }
    }
  }

  if (mqttFailedCount > 0) {
    warnings.push("mqtt_publish_failed_partial");
  }

  return json({
    ok: true,
    kind: "external_notification",
    stored: stored?.stored === true,
    ...(stored?.stored !== true && stored?.reason ? { storeReason: stored.reason } : {}),
    payloadPreview: {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      source: payload.source,
      category: payload.category,
      severity: payload.severity || null,
      dataKeys: Object.keys(payload.data || {}),
    },
    pushSent: pushResult.pushSent,
    pushAttempted: pushResult.attempted,
    pushEnabled: requestSendPush,
    emailEnabled: false,
    mqttPublishedCount: Array.isArray(mqttResult)
      ? mqttResult.filter((entry) => entry?.ok !== false).length
      : 0,
    mqttFailedCount,
    mqttSkipped: mqttResult?.skipped === true,
    ...(mqttResult?.skipped === true ? { mqttSkipReason: mqttResult.reason || "unknown" } : {}),
    ...(mqttError ? { mqttError } : {}),
    ...(warnings.length ? { warnings } : {}),
    mqttEnabled: requestSendMqtt,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Public API handler for:
 * - OPTIONS: CORS preflight
 * - GET: metadata and OpenAPI
 * - POST: authenticated notification ingestion
 */
export default async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true, method: "OPTIONS" }, 200);
  }

  if (req.method === "GET") {
    let requestUrl = null;
    try {
      requestUrl = new URL(req.url);
    } catch {
      requestUrl = null;
    }

    const format = (requestUrl?.searchParams.get("format") || "").toLowerCase();
    const wantsOpenApi = format === "openapi" || format === "swagger" || requestUrl?.searchParams.get("openapi") === "1";

    if (wantsOpenApi) {
      const serverUrl = requestUrl
        ? `${requestUrl.origin}${requestUrl.pathname}`
        : "https://api.notificator-project.com";
      return json(getOpenApiSpec(serverUrl), 200);
    }

    return json(
      {
        ok: true,
        name: "public-notify",
        endpoint: "https://api.notificator-project.com",
        methods: ["POST", "GET", "OPTIONS"],
        auth: {
          headers: ["Authorization: Bearer wpnotif_...", "x-api-key: wpnotif_...", "x-wpnotif-key: wpnotif_..."],
          allowedKeyTypes: ["public_client", "internal_service"],
          rejectedKeyTypes: ["wordpress_server"],
        },
        acceptedContentTypes: ["application/json", "application/x-www-form-urlencoded", "text/plain"],
        payloadRules: {
          minimum: "At least one meaningful field is required (title/body/message/category/severity/payload/data).",
          emptyPayloadStatus: 400,
        },
        deliveryDefaults: {
          sendPush: true,
          sendMqtt: true,
          strictDelivery: false,
        },
        minimumPayload: {
          title: "Deployment Completed",
          body: "Version 2.4.1 is now live.",
        },
        openapi: `${requestUrl?.origin || "https://api.notificator-project.com"}?format=openapi`,
      },
      200
    );
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", allowed: ["GET", "POST", "OPTIONS"] }, 405);
  }

  let bodyJson = {};
  try {
    const raw = await req.text();
    const contentType = req.headers.get("content-type") || "";
    bodyJson = normalizeWebhookBody(parseWebhookBodyByContentType(raw, contentType));
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (!hasMeaningfulExternalPayload(bodyJson)) {
    return json(
      {
        error: "Request payload is empty",
        hint: "Provide at least one meaningful field such as title, body, message, category, severity, payload, or data.",
      },
      400
    );
  }

  const auth = await handleAuthentication(req);
  if (!auth.authenticated) {
    return json({ error: auth.error || "Unauthorized" }, 401);
  }

  return await handleExternalNotification(auth.userId, bodyJson);
};
