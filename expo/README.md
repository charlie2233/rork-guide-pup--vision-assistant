# Guide Pup

Cross-platform mobile app built with Expo Router and React Native. The project runs on iOS, Android, and web via Expo, and uses Bun for tooling.

## Project info

- **Platform:** iOS, Android, Web
- **Framework:** Expo Router + React Native
- **Language:** TypeScript
- **Tooling:** Bun

## Editing and running locally

Use any editor you like (Cursor, VS Code, etc.). Clone the repo, install dependencies, and start the dev server:

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
bun install

# Web preview (hot reload)
bun run start-web

# Native preview (open Expo in iOS/Android simulator or device)
bun run start
```

## AI Vision Setup

Guide Pup uses OpenAI's multimodal models to describe camera input. Set your key before launching:

1. Create or update `.env` in the project root:
   ```bash
   EXPO_PUBLIC_OPENAI_API_KEY=sk-your-key
   # Optional: override the default model
   EXPO_PUBLIC_OPENAI_MODEL=gpt-4o-mini
   ```
2. Restart the Expo dev server so the variables load.
3. Without a key, scanning will fail with a service unavailable error.

### Real-time object scanning

Continuous scanning runs roughly every 1.5 seconds to mimic video-style narration. This boosts awareness but increases API usage; toggle it off if you want to limit calls during testing.

## Accessibility-first interface

- Large, tactile controls and high-contrast styling.
- Inline guidance for posture, distance, and scan mode.
- All actionable elements include accessibility labels and hints; primary actions speak feedback automatically.

## How to test

### On device (recommended)

- Install Expo Go from the App Store or Google Play.
- Run `bun run start` and scan the QR code from your terminal.

### In the browser

- Run `bun run start-web` for a quick preview. Some native features may be unavailable.

### Simulators and emulators

```bash
# iOS Simulator
bun run start -- --ios

# Android Emulator
bun run start -- --android
```

## Deployment

Use EAS for store builds:

```bash
bun i -g @expo/eas-cli
eas build:configure
eas build --platform ios
eas build --platform android
```

For web:

```bash
eas build --platform web
eas hosting:configure
eas hosting:deploy
```

## Tech stack

- React Native
- Expo / Expo Router
- TypeScript
- React Query
- Lucide React Native

## Project structure (simplified)

```
app/                 # App screens (Expo Router)
  (tabs)/            # Tab navigation screens
  _layout.tsx        # Root layout
  modal.tsx          # Modal screen example
  +not-found.tsx     # 404 screen
assets/              # Static assets
constants/           # App constants and configuration
app.json             # Expo configuration
package.json         # Dependencies and scripts
tsconfig.json        # TypeScript configuration
```

## Credits

Worked with: Codex, Cursor, Rork.
