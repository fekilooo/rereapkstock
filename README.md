# Lohas Stock App

Android stock app for the "樂活五線譜" strategy, built with Expo, React Native, and `expo-router`.

## Features

- Taiwan stock and US stock quote lookup
- Multi-period five-line trend analysis
- Fear & Greed market sentiment gauge
- Favorites list with reorder and single-item delete
- Android release build support

## Tech Stack

- Expo
- React Native
- TypeScript
- Zustand
- React Native SVG

## Development

```bash
npm install
npm run start
```

## Android Build

```bash
cd android
gradlew.bat assembleRelease
```

The generated APK is located at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Notes

- Taiwan stock symbols can be entered directly as `2330`, `1303`, etc.
- US stock symbols can be entered directly as `QQQ`, `AAPL`, etc.
- The project currently focuses on Android.

## License

MIT
