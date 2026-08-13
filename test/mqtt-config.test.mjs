import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MQTT_TOPIC_PREFIX,
  normalizeMqttDeviceId,
  validateTransientMqttConfig,
} from "../netlify/functions/public-notify/mqtt-config.mjs";

const validConfig = {
  version: 1,
  provider: "hivemq_cloud",
  host: "example.s1.eu.hivemq.cloud",
  port: 8884,
  path: "/mqtt",
  username: "publisher",
  password: "correct horse battery staple",
  topicPrefix: DEFAULT_MQTT_TOPIC_PREFIX,
};

test("accepts a valid request-scoped HiveMQ Cloud configuration", () => {
  const result = validateTransientMqttConfig(validConfig);
  assert.equal(result.ok, true);
  assert.equal(result.config.topicPrefix, "notificator-project");
});

test("rejects destinations outside HiveMQ Cloud", () => {
  assert.equal(
    validateTransientMqttConfig({ ...validConfig, host: "127.0.0.1" }).ok,
    false,
  );
});

test("normalizes device IDs and rejects MQTT topic injection", () => {
  assert.equal(normalizeMqttDeviceId("WPNOTIF-ABC_123"), "abc_123");
  assert.equal(normalizeMqttDeviceId("device/other"), "");
});
