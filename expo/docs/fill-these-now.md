# Guide Pup Fill These Now

Charlie still needs to set these values before launch execution can finish:

- Final iOS bundle identifier
- Final Android package name
- Apple Team ID
- App Store Connect App ID (`ascAppId`)
- Optional website custom domain override
- Final public privacy policy URL if it should not be derived from `${WEBSITE_URL}/privacy`
- Final public support URL if it should not be derived from `${WEBSITE_URL}/support`
- Final support email
- Copyright holder string for App Store metadata
- Final emergency / safety disclaimer copy
- Production API base URL
- Optional production Sentry DSN
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Backend secrets: `BOOTSTRAP_SIGNING_SECRET`, `OPENAI_API_KEY`

After updating them, rerun `npm run release:preflight` from `expo/`.
