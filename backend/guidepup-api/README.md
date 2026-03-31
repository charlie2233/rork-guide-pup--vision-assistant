# Guide Pup API

Cloudflare Worker backend for Guide Pup's production vision-analysis path.

## What runs here

- `GET /health`
- `POST /v1/device/bootstrap`
- `POST /v1/vision/analyze`
- `POST /__debug/provider-benchmark` in non-production only

## Local development

1. Install dependencies:

   ```bash
   cd backend/guidepup-api
   npm install
   ```

2. Create local secrets:

   ```bash
   cp .env.example .dev.vars
   ```

3. Fill at least:

   - `BOOTSTRAP_SIGNING_SECRET`
   - `OPENAI_API_KEY`

4. Validate the Worker config and generated types:

   ```bash
   npm run check
   npm run types
   npm run typecheck
   ```

5. Run locally:

   ```bash
   npm run dev
   ```

## Environments

- `dev` uses permissive CORS defaults if `CORS_ORIGIN` is unset or `*`.
- `staging` and `production` require explicit origins via `CORS_ORIGIN` or `CORS_ALLOWED_ORIGINS`.
- `RATE_LIMITER` Durable Object bindings are defined explicitly in every env block.

## Secrets and config

Required:

- `BOOTSTRAP_SIGNING_SECRET`
- `OPENAI_API_KEY`

Recommended:

- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `PROMPT_VERSION`
- `RATE_LIMIT_PER_MINUTE`
- `SESSION_TTL_SECONDS`
- `CORS_ORIGIN` or `CORS_ALLOWED_ORIGINS`

Optional:

- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_AUTH_HEADER`
- `AI_GATEWAY_AUTH_PREFIX`
- `AI_GATEWAY_PATH`
- `AI_GATEWAY_FALLBACK_BASE_URL`
- `AI_GATEWAY_FALLBACK_API_KEY`
- `AI_GATEWAY_FALLBACK_AUTH_HEADER`
- `AI_GATEWAY_FALLBACK_AUTH_PREFIX`
- `AI_GATEWAY_FALLBACK_PATH`
- `EXPERIMENTAL_MINICPM_O_BENCHMARK`
- `DEBUG_BENCHMARK_TOKEN`
- `SENTRY_DSN`
- `SENTRY_RELEASE`
- `SENTRY_DIST`

Use Wrangler secrets for production values:

```bash
wrangler secret put BOOTSTRAP_SIGNING_SECRET --env staging
wrangler secret put BOOTSTRAP_SIGNING_SECRET --env production
wrangler secret put OPENAI_API_KEY --env staging
wrangler secret put OPENAI_API_KEY --env production
```

## Deploy

```bash
npm run deploy:staging
npm run deploy
```

Use `npm run deploy:dry-run` or `npm run check` before release.

## Benchmarking

The benchmark route is for non-production environments only:

```bash
curl -X POST http://127.0.0.1:8787/__debug/provider-benchmark \
  -H 'content-type: application/json' \
  -H 'x-guidepup-debug-token: optional-local-debug-token' \
  -d '{"imageBase64":"...","providers":["openai-compatible"],"samples":1}'
```

MiniCPM-o stays experimental and only participates when the benchmark flag is enabled outside production.
In staging, set `DEBUG_BENCHMARK_TOKEN` before using the route.
