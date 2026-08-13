const DEFAULT_ENDPOINT = "https://api.notificator-project.com";

export class NotificatorApiError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "NotificatorApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
  }
}

function assertApiKey(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Notificator apiKey must be a non-empty string");
  }
  return value.trim();
}

function assertPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Notification payload must be an object");
  }

  const meaningfulKeys = [
    "title",
    "body",
    "message",
    "category",
    "severity",
    "payload",
    "data",
  ];
  const hasContent = meaningfulKeys.some((key) => {
    const value = payload[key];
    if (typeof value === "string") return value.trim().length > 0;
    return value && typeof value === "object" && Object.keys(value).length > 0;
  });
  if (!hasContent) {
    throw new TypeError("Notification payload must contain meaningful content");
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export class NotificatorClient {
  constructor(options = {}) {
    this.apiKey = assertApiKey(
      options.apiKey || process.env.NOTIFICATOR_API_KEY,
    );
    this.endpoint = String(
      options.endpoint || process.env.NOTIFICATOR_ENDPOINT || DEFAULT_ENDPOINT,
    ).replace(/\/+$/, "");
    const endpointUrl = new URL(this.endpoint);
    if (!new Set(["http:", "https:"]).has(endpointUrl.protocol)) {
      throw new TypeError("Notificator endpoint must use HTTP or HTTPS");
    }
    this.timeoutMs =
      Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : 10000;
    this.fetch = options.fetch || globalThis.fetch;
    if (typeof this.fetch !== "function") {
      throw new TypeError("A Fetch API implementation is required");
    }
  }

  async notify(payload, options = {}) {
    assertPayload(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternalSignal = () =>
      controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternalSignal();
    else {
      externalSignal?.addEventListener("abort", abortFromExternalSignal, {
        once: true,
      });
    }

    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "@notificator-project/api",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await readResponse(response);
      if (!response.ok) {
        throw new NotificatorApiError(
          result?.error ||
            result?.message ||
            `Notificator API returned ${response.status}`,
          {
            status: response.status,
            code: result?.code,
            details: result,
          },
        );
      }
      return result;
    } catch (error) {
      if (error instanceof NotificatorApiError) throw error;
      if (controller.signal.aborted) {
        if (externalSignal?.aborted) {
          throw new NotificatorApiError("Notificator API request was aborted", {
            code: "request_aborted",
            cause: error,
          });
        }
        throw new NotificatorApiError("Notificator API request timed out", {
          code: "request_timeout",
          cause: error,
        });
      }
      throw new NotificatorApiError("Unable to reach the Notificator API", {
        code: "network_error",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  async getMetadata(options = {}) {
    const response = await this.fetch(this.endpoint, {
      headers: { Accept: "application/json", ...options.headers },
      signal: options.signal,
    });
    const result = await readResponse(response);
    if (!response.ok) {
      throw new NotificatorApiError(
        result?.error || `Notificator API returned ${response.status}`,
        { status: response.status, details: result },
      );
    }
    return result;
  }
}

export function createNotificatorClient(options) {
  return new NotificatorClient(options);
}

export { DEFAULT_ENDPOINT };
