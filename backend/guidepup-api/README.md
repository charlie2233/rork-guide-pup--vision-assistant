# Guide Pup API

Cloudflare Worker backend for Guide Pup's production vision analysis path.

## Endpoints

- `GET /health`
- `POST /v1/device/bootstrap`
- `POST /v1/vision/analyze`

## Local development

1. Install dependencies:

   ```bash
   cd backend/guidepup-api
   npm install
   ```

2. Copy the example env file into Cloudflare's local secrets file:

   ```bash
   cp .env.example .dev.vars
   ```

3. Fill in at least:

   - `OPENAI_API_KEY`
   - `BOOTSTRAP_SIGNING_SECRET`

4. Generate Worker types:

   ```bash
   npm run types
   ```

5. Start local dev:

   ```bash
   npm run dev
   ```

## Deploy

```bash
npm run deploy:staging
npm run deploy
```

## Notes

- The default provider is an OpenAI-compatible multimodal endpoint.
- `huggingface-minicpm-o` is included as an experimental adapter scaffold.
- The Worker signs anonymous device bootstrap tokens and rate-limits per device using a Durable Object.
