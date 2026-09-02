# Notificator Hosted API

This repository contains the backend deployed at
`https://api.notificator-project.com`. It validates integration requests and
coordinates delivery to the Notificator inbox, mobile push notifications,
email, and connected MQTT devices.

The service is operated by the Notificator Project because official mobile push
delivery depends on protected credentials associated with the Notificator app.
Those credentials are never distributed to integrations or npm packages.

## Integrate with Notificator

Send requests to `https://api.notificator-project.com`. Integrations need a
`public_client` API key created in the [web dashboard (beta)](https://dashboard.notificator-project.com) or Notificator mobile app. Notificator runs
and maintains the API service.

Node.js applications can use the separate official SDK:

```bash
npm install @notificator-project/api
```

```js
import { NotificatorClient } from "@notificator-project/api";

const notificator = new NotificatorClient({
  apiKey: process.env.NOTIFICATOR_API_KEY,
});

await notificator.notify({
  title: "Deployment complete",
  body: "Version 2.4.1 is live.",
  source: "deploy-worker",
  severity: "info",
});
```

Keep API keys in server-side environment variables. Do not ship them in a
browser bundle.

SDK source and releases are maintained independently in the
[Node-SDK repository](https://github.com/notificator-project/Node-SDK).
The current package is
[`@notificator-project/api@0.1.0`](https://www.npmjs.com/package/@notificator-project/api).

## What this service does

- Accepts third-party notifications over HTTP.
- Validates API keys and domain restrictions.
- Normalizes payloads from common webhook formats.
- Stores encrypted notifications in Supabase.
- Sends push notifications to user devices.
- Sends account-controlled email alerts when configured.
- Publishes MQTT messages to eligible active devices (optional).
- Accepts validated, request-scoped HiveMQ Cloud credentials without storing
  them.

## Endpoint behavior summary

- Main endpoint: POST /
- Metadata endpoint: GET /
- OpenAPI endpoint: GET /?format=openapi
- CORS preflight: OPTIONS /

MQTT failure handling:

- Default mode: returns partial success (HTTP 200) with MQTT warning fields.
- Strict mode: send strictDelivery=true to return HTTP 502 on MQTT publish failure.

## Folder structure

- netlify/functions/public-notify/index.mjs
- package.json
- netlify.toml

## Environment variables

Required:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Required for production mobile push delivery:

- EXPO_ACCESS_TOKEN

Push delivery fails closed when this secret is missing. The token is sent only
to Expo as a bearer authorization header and is never returned by an endpoint.

Required only when email delivery is enabled:

- RESEND_API_KEY
- ALERT_EMAIL_FROM

Required only when MQTT is enabled:

- HIVEMQ_HOST
- HIVEMQ_USERNAME
- HIVEMQ_PASSWORD

Optional:

- HIVEMQ_PORT (default: 8884)
- HIVEMQ_WSS_PATH (default: /mqtt)
- HIVEMQ_TOPIC_PREFIX (default: notificator-project)
- EXPO_PUSH_TIMEOUT_MS (default: 10000)

## Maintainer development

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and add authorized development credentials.
   Local env files are ignored by Git.
3. Start locally: `npm run dev`
4. Run checks: `npm test`

## Deployment

Production deployment is restricted to project maintainers:

npm run deploy

The Netlify project must provide every required runtime secret. In particular,
`EXPO_ACCESS_TOKEN` must remain a secret scoped to server-side functions and
must never be exposed during a frontend build or returned by an endpoint.

## Documentation

Official documentation portal:

- https://docs.notificator-project.com

Recommended pages:

- Public Notify API Reference: https://docs.notificator-project.com/reference/public-notify/
- Quick Start: https://docs.notificator-project.com/guides/quick-start/
- Code Samples: https://docs.notificator-project.com/guides/code-samples/

## Notes

- API keys must use key type public_client or internal_service.
- `wordpress_server` and `strapi_server` keys are rejected by this endpoint.
- If key allowed_domains is configured, request Origin or Referer must match.
- The default MQTT topic is
  `notificator-project/{deviceId}/messages`.
- Base devices must report supported firmware before MQTT delivery; newer
  device families use their own firmware policy.

## Contributors

- [Vagelis P.](https://github.com/vagelisp) - Author & Maintainer
- [Evan Derventzis](https://github.com/itsnotevann) - Contributor
