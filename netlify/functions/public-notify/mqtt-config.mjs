const HIVEMQ_CLOUD_SUFFIX = ".hivemq.cloud";
const HIVEMQ_CLOUD_WSS_PORT = 8884;
const HIVEMQ_CLOUD_WSS_PATH = "/mqtt";
const DEFAULT_MQTT_TOPIC_PREFIX = "notificator-project";

/**
 * Validate a transient HiveMQ Cloud connection supplied by an API client.
 *
 * Restricting the destination to HiveMQ Cloud's public hostname suffix and
 * fixed TLS WebSocket endpoint prevents the API from becoming a generic
 * server-side network proxy. The returned password must never be logged or
 * persisted.
 *
 * @param {unknown} value Candidate MQTT configuration.
 * @returns {{ok: true, config: Object}|{ok: false, error: string}}
 */
function validateTransientMqttConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Missing MQTT connection configuration." };
  }

  const provider = String(value.provider || "")
    .trim()
    .toLowerCase();
  const version = Number(value.version);
  const host = String(value.host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  const port = Number(value.port);
  const path = String(value.path || "").trim();
  const username = String(value.username || "").trim();
  const password = typeof value.password === "string" ? value.password : "";
  const topicPrefix = String(
    value.topicPrefix || value.topic_prefix || DEFAULT_MQTT_TOPIC_PREFIX,
  )
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (version !== 1) {
    return { ok: false, error: "Unsupported MQTT configuration version." };
  }
  if (provider !== "hivemq_cloud") {
    return { ok: false, error: "Only HiveMQ Cloud is currently supported." };
  }
  if (
    !host ||
    host.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
    host.includes("..") ||
    !host.endsWith(HIVEMQ_CLOUD_SUFFIX)
  ) {
    return { ok: false, error: "Invalid HiveMQ Cloud hostname." };
  }
  if (port !== HIVEMQ_CLOUD_WSS_PORT || path !== HIVEMQ_CLOUD_WSS_PATH) {
    return {
      ok: false,
      error: "HiveMQ Cloud must use secure WebSockets on port 8884 and /mqtt.",
    };
  }
  if (
    !username ||
    username.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(username)
  ) {
    return { ok: false, error: "Invalid MQTT username." };
  }
  if (
    !password ||
    password.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(password)
  ) {
    return { ok: false, error: "Invalid MQTT password." };
  }
  if (
    !topicPrefix ||
    topicPrefix.length > 128 ||
    !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(topicPrefix)
  ) {
    return { ok: false, error: "Invalid MQTT topic prefix." };
  }

  return {
    ok: true,
    config: {
      version: 1,
      provider: "hivemq_cloud",
      host,
      port,
      path,
      username,
      password,
      topicPrefix,
      connectionMode: "custom",
    },
  };
}

/**
 * Normalize a device identifier before using it in an MQTT topic.
 *
 * @param {unknown} value Device ID.
 * @returns {string}
 */
function normalizeMqttDeviceId(value) {
  const deviceId = String(value || "")
    .trim()
    .replace(/^WPNOTIF-/i, "")
    .toLowerCase();
  return /^[A-Za-z0-9_-]{1,128}$/.test(deviceId) ? deviceId : "";
}

export {
  DEFAULT_MQTT_TOPIC_PREFIX,
  normalizeMqttDeviceId,
  validateTransientMqttConfig,
};
