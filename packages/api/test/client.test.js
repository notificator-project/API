import assert from "node:assert/strict";
import test from "node:test";

import {
  NotificatorApiError,
  NotificatorClient,
  createNotificatorClient,
} from "../src/index.js";

test("sends a notification with bearer authentication", async () => {
  let request;
  const client = createNotificatorClient({
    apiKey: "wpnotif_test",
    fetch: async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({ ok: true, kind: "external_notification" }),
      );
    },
  });

  const result = await client.notify({ title: "Deploy complete" });
  assert.equal(result.ok, true);
  assert.equal(request.url, "https://api.notificator-project.com");
  assert.equal(request.options.headers.Authorization, "Bearer wpnotif_test");
  assert.deepEqual(JSON.parse(request.options.body), {
    title: "Deploy complete",
  });
});

test("rejects empty payloads before issuing a request", async () => {
  const client = new NotificatorClient({
    apiKey: "wpnotif_test",
    fetch: async () => assert.fail("fetch should not be called"),
  });
  await assert.rejects(() => client.notify({ sendPush: true }), TypeError);
});

test("returns structured API errors", async () => {
  const client = new NotificatorClient({
    apiKey: "wpnotif_test",
    fetch: async () =>
      new Response(
        JSON.stringify({ error: "Invalid API key", code: "invalid_key" }),
        {
          status: 401,
        },
      ),
  });

  await assert.rejects(
    () => client.notify({ title: "Test" }),
    (error) =>
      error instanceof NotificatorApiError &&
      error.status === 401 &&
      error.code === "invalid_key",
  );
});
