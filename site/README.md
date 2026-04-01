# Guide Pup Public Site

Static Cloudflare Pages-ready policy site for Guide Pup.

## Routes

- `/`
- `/privacy`
- `/support`
- `/safety`

## Behavior reflected here

- Camera frames are sent to the Guide Pup backend.
- Frames may be processed by third-party AI providers.
- Anonymous device and session bootstrap state is used.
- Optional crash reporting may be enabled.
- The shipping navigation path does not request microphone access.
- Guide Pup provides assistive guidance only and does not guarantee hazard detection or emergency response.

## Cloudflare Pages deployment

1. Create a new Cloudflare Pages project.
2. Point the project at this repository.
3. Set the production output directory to `site`.
4. Leave the build command empty.
5. Connect a custom domain if available.

If you prefer the dashboard flow, the `site/` directory can be deployed directly as a static site with no build step.

CLI deploy from the repo root:

```bash
npx wrangler pages deploy site
```

## Local preview

Any static server works:

```bash
python3 -m http.server 8080 --directory site
```

## Release inputs to align later

- Final public privacy policy URL
- Final public support URL or email
- Final public safety disclaimer URL
- Final public website URL
- Expo env vars that should point to the public pages:
  - `EXPO_PUBLIC_WEBSITE_URL`
  - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - `EXPO_PUBLIC_SUPPORT_URL`
  - `EXPO_PUBLIC_SUPPORT_EMAIL`
