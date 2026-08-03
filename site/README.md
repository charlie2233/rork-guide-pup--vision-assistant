# Guide Pup Public Site

Static Cloudflare Pages-ready policy site for Guide Pup.

Current live Pages URL:

- `https://guidepup-site.pages.dev`

## Routes

- `/`
- `/privacy`
- `/support`
- `/safety`

## Behavior reflected here

- Camera frames are sent to the Guide Pup backend.
- Frames may be processed by third-party AI providers.
- Anonymous device and session bootstrap state is used.
- The launch iOS client does not vendor a crash-reporting SDK.
- Optional voice commands use microphone and speech-recognition permissions for a bounded command set.
- Guide Pup does not collect or retain raw voice audio; Apple speech-service processing may occur when on-device recognition is unavailable.
- Support email may provide the sender's name, email address, message, and troubleshooting details, which the support mailbox may retain as needed to manage the request.
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
cd site
npx wrangler pages deploy .
```

Create the Pages project once if it does not exist:

```bash
cd site
npx wrangler pages project create guidepup-site --production-branch main
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
