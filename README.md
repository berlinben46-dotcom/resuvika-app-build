# Resuvika Omniball — Android 0.3.0 testing preview

A local-first drawing, notes, and PDF workspace with a responsive mobile UI and a Windows Bluetooth companion.

Start with [the preview testing guide](docs/ANDROID_0_3_TESTING.md). For production requirements, read [release readiness](docs/RELEASE_READINESS_0_3.md).

The four main destinations are Board, Notes, Documents, and Connect. Drawing tools remain available from the floating pen button. The top grid opens saved boards. PDFs use an offline in-app reader with page text, zoom, and reliable Back handling.

The Android preview uses a separate `.preview` package and does not overwrite the existing installation. It is a testing build, not a production Play Store upload. Bluetooth implementation and protocol checks are included; real phone/laptop and TalkBack validation remain necessary.

Bluetooth supports paired Android devices and the included Windows companion: bidirectional files, complete boards with notes, and live drawing from the phone. The Windows viewer requires the companion to keep running. The existing token-protected Wi-Fi desktop pairing remains available.

## Build and check

Use Node.js 24+, JDK 21, and Android SDK 36. Set up Android Studio or the Android command-line tools.

```powershell
npm ci
npm run build
npx cap update android
node scripts/sync-assets.mjs
npm test
npm run test:ui
cd android
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Developer browser tests default to Windows Chrome; set `CHROME_PATH` if needed. Python 3.11+ runs the source companion and its tests. See the testing guide for details.

`npm run package` creates a source ZIP and copies an available preview APK into `dist`. Source packages exclude installed dependencies, SDKs, caches, signing keys, and received files.

## Production

The production package remains `com.vikashya.resuvika.omniball.mobile`. Release tasks reject missing signing variables. Follow `docs/PLAY_CONSOLE_SETUP.md` and the new release-readiness report before generating and submitting a signed AAB.

Live billing, policy URLs, physical Bluetooth, native print/Back, device accessibility, and Play Console declarations have to be validated by the owner. No production upload, live purchase, or account setup was performed.

The supplied source's free/Pro access behavior is retained. Some older documents refer to a previous trial-based model; reconcile the commercial model before publishing.

Android is the verified build target in this change. Existing iOS source remains in the project; Apple compilation, signing, purchases, and device checks have not been performed.
