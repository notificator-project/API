# Notificator Project Public API

This directory contains the Notificator Project Public Notify API.

It is intended for teams that want to deploy the public notification ingestion endpoint independently.

## What this service does

- Accepts third-party notifications over HTTP.
- Validates API keys and domain restrictions.
- Normalizes payloads from common webhook formats.
- Stores encrypted notifications in Supabase.
- Sends push notifications to user devices.
- Publishes MQTT messages to active devices (optional).

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

Required only when MQTT is enabled:

- HIVEMQ_HOST
- HIVEMQ_USERNAME
- HIVEMQ_PASSWORD

Optional:

- HIVEMQ_PORT (default: 8884)
- HIVEMQ_WSS_PATH (default: /mqtt)
- EXPO_PUSH_TIMEOUT_MS (default: 10000)

## Local development

1. Install dependencies: npm install
2. Start locally: npm run dev

## Deploy

Deploy to Netlify production:

npm run deploy

## Documentation

Official documentation portal:

- https://docs.notificator-project.com

Recommended pages:

- Public Notify API Reference: https://docs.notificator-project.com/reference/public-notify/
- Quick Start: https://docs.notificator-project.com/guides/quick-start/
- Code Samples: https://docs.notificator-project.com/guides/code-samples/

## Notes

- API keys must use key type public_client or internal_service.
- wordpress_server keys are rejected by this endpoint.
- If key allowed_domains is configured, request Origin or Referer must match.

## Contributors

- [Vagelis P.](https://github.com/vagelisp) - Author & Maintainer  
- [Evan Derventzis](https://github.com/itsnotevann) - Contributor
