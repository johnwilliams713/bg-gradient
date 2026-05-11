# Reba Demo (`bg-gradient`)

Expo / React Native app: voice-forward chat-style UI with live transcription, animated visuals, and haptic feedback. Assistant replies in the thread are **placeholders** until a real model is wired in.

## Requirements

- **Node.js** (LTS recommended)
- **Xcode** + CocoaPods (iOS)
- **Android Studio** (Android, optional)
- A **development build** for full functionality — see below.

## Install

```bash
npm install
```

## Run

| Command | Purpose |
|--------|---------|
| `npm start` | Start the Metro bundler (Expo CLI). |
| `npm run ios` | Build/run the **iOS dev client** on simulator or device (`expo run:ios`). |
| `npm run android` | Build/run the Android app (`expo run:android`). |
| `npm run web` | Web preview (`expo start --web`). |

### Voice input and **Expo Go**

**Speech recognition** uses `expo-speech-recognition`, which needs native code. **Expo Go does not include that module**, so the voice UI degrades gracefully there but **real voice capture requires a dev client** built with Xcode or `expo run:ios` / `expo run:android`.

Example (physical device):

```bash
npx expo run:ios --device
```

Release-style build:

```bash
npx expo run:ios --device --configuration Release
```

### iOS signing

`app.json` includes an `appleTeamId` and `bundleIdentifier`. Forks should replace these with their own Apple Developer team and bundle ID.

## Project layout

| Path | Role |
|------|------|
| `App.tsx` | Root UI, voice session state, thread scroll, chrome animations. |
| `hooks/useVoiceComposer.ts` | Mic + streaming STT, mute/stop, silence commit, `expo-speech-recognition` wiring. |
| `components/BottomAppCluster.tsx` | Text composer and entry to voice mode. |
| `components/VoiceModeBottomBar.tsx` | In-session controls (mute, stop). |
| `components/BlobShape.tsx` | Skia/Reanimated visual tied to voice energy. |
| `components/VoiceLiveTranscript.tsx` | Live caption strip. |
| `constants/voiceChrome.ts` | Timing/easing for voice chrome transitions. |
| `constants/palette.ts` | Colors / helpers. |
| `plugins/withReboltIosIcon.js` | Config plugin for alternate iOS icon assets. |

## Stack

- **Expo SDK ~54**, **React 19**, **React Native 0.81** (new architecture enabled)
- **expo-speech-recognition**, **react-native-reanimated**, **@shopify/react-native-skia**, **expo-haptics**, **lucide-react-native**

## Scope / next steps

- No live LLM or backend: assistant messages use an in-app placeholder string.
- Haptics and animations are tuned for product feel; swap in your API where `App.tsx` commits user turns and placeholder replies.

## License

Private / all rights reserved unless you add a license file for open source.
