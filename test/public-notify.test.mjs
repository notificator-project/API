import assert from "node:assert/strict";
import test from "node:test";

import handler from "../netlify/functions/public-notify/index.mjs";

test("returns public endpoint metadata", async () => {
  const response = await handler(
    new Request("https://api.notificator-project.com", { method: "GET" }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.name, "public-notify");
  assert.deepEqual(body.auth.allowedKeyTypes, [
    "public_client",
    "internal_service",
  ]);
});

test("rejects empty notification payloads before authentication", async () => {
  const response = await handler(
    new Request("https://api.notificator-project.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sendPush: true }),
    }),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Request payload is empty");
});

test("serves an OpenAPI document for the current public contract", async () => {
  const response = await handler(
    new Request("https://api.notificator-project.com?format=openapi"),
  );
  const body = await response.json();
  assert.equal(body.info.version, "1.1.0");
  assert.ok(body.components.schemas.HiveMqCloudConfig);
});
