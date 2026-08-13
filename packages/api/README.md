# Notificator API for Node.js

Send alerts from Node.js, serverless functions, workers, queues, and backend applications to the Notificator mobile app and connected devices.

The client uses the hosted Notificator Public API by default. Set a custom endpoint when your organization deploys the API itself.

## Install

```bash
npm install @notificator-project/api
```

## Send an alert

```js
import { NotificatorClient } from "@notificator-project/api";

const notificator = new NotificatorClient({
  apiKey: process.env.NOTIFICATOR_API_KEY,
});

await notificator.notify({
  title: "Deployment complete",
  body: "Version 2.4.1 is live.",
  source: "deploy-worker",
  category: "info",
  data: { version: "2.4.1", environment: "production" },
});
```

Use a `public_client` API key created in the Notificator mobile app. Keep it on the server and never include it in browser or mobile bundles.

## Delivery controls

```js
await notificator.notify({
  title: "Queue needs attention",
  body: "The order queue exceeded its threshold.",
  severity: "warning",
  sendPush: true,
  sendEmail: true,
  sendMqtt: true,
  deviceId: "optional-target-device-id",
});
```

Email delivery follows the account preference unless `sendEmail` is explicitly supplied. MQTT can target all active devices or a single owned device.

## Self-hosted endpoint

```js
const notificator = new NotificatorClient({
  apiKey: process.env.NOTIFICATOR_API_KEY,
  endpoint: process.env.NOTIFICATOR_ENDPOINT,
});
```

The same client works with the official hosted service and compatible self-hosted deployments.

See the [Public Notify API documentation](https://docs.notificator-project.com/reference/public-notify/) for the complete payload and response contract.
