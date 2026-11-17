# Resuvika Omniball — mobile preview 0.2.0

This update replaces the large tablet toolbar with one draggable floating button. Tap it for a compact quick-tool palette. The gear lets you choose favorite tools, icon, size, accent, opacity, side, stylus input and orientation. Portrait is the Android default; the interface also adapts to wide emulator/tablet windows. Style → Fit canvas to this screen resizes an existing board while saving a recovery copy. See [Android floating-tools instructions](docs/ANDROID_FLOATING_TOOLS.md).

Android is the first target. This separate project reuses the working drawing engine and generates native Android and iPhone/iPad apps with Capacitor 8. It does not change your Windows installer or seller key generator.

The app contains a standalone offline whiteboard, pressure-aware pen input, shapes that remember your selection, adjustable screen text, clear/undo, class notes, automatic recovery, named saved boards, PNG sharing, JSON backup/import, Vikashya branding, and a recording view that hides menus and optionally branding. The interface is white.

The 7-day evaluation begins at first launch without a card or automatic charge. After expiry, users can view/export their existing boards and choose a paid plan to continue editing. Local evaluation storage is basic protection and can be reset by reinstalling or modifying app data. Paid access uses store purchase verification, not the desktop license key generator.

The purchase interface supports monthly, yearly, and lifetime packages, localized store prices, restore, and subscription management. It uses RevenueCat’s native Google Play Billing/StoreKit SDK and backend. **Live billing is intentionally unavailable until you connect your own public SDK keys, products, entitlement and store credentials.** RevenueCat is an additional service account with its own terms/pricing; no account was created or connected for you. Private store credentials belong only in RevenueCat’s dashboard or your private build secrets.

Start with [docs/PLAY_CONSOLE_SETUP.md](docs/PLAY_CONSOLE_SETUP.md). [docs/BUYER_PURCHASE_FLOW.md](docs/BUYER_PURCHASE_FLOW.md) explains exactly how customers buy and restore. [docs/IPHONE_NEXT.md](docs/IPHONE_NEXT.md) describes the later Apple build and submission work.

## Build Android

Use Node.js 24, JDK 21, Android SDK platform 36 and current build tools. Android Studio includes its Java runtime. The generated Android project has minimum SDK 24 (Android 7) and targets SDK 36. A current Android System WebView is required.

```powershell
npm ci
npm run sync
cd android
.\gradlew.bat :app:assembleDebug
```

The test APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It is signed with a development key and is for device testing. It is not a production upload. `Build_Android.bat` runs this sequence when tools are installed.

For Play upload, configure billing/policy URLs, create and securely back up an upload keystore, set the four signing environment variables documented in the store guide, run `npm run check:release -- android`, then `gradlew bundleRelease`. Upload the signed `.aab` to Play Console, initially an internal testing track. Buyers download from Google Play; they do not install Node, Java, or separate files.

## Build on GitHub

Upload **this project’s contents as a private repository root**, including `.github` and the Android/iOS projects. Do not upload the desktop `Seller_Private` folder. Run Actions → “Android testing APK or signed Play bundle.” Its default produces a testing APK; its release option requires your store configuration and signing secrets. Workflows are prepared but have not been run in your GitHub account. They do not publish automatically.

The iOS workflow builds an unsigned simulator app on a macOS runner. It does not produce an installable iPhone IPA, sign an App Store release, or submit to Apple. Those steps require your Apple Developer membership, app record, signing and purchase setup.

## Pairing and platform scope

Boards → Open laptop pairing accepts the local token-protected link shown by your desktop app. Both devices need the same Wi-Fi/hotspot. It opens the existing companion in the system browser, separate from the app’s saved offline boards and native bridge. The desktop host keeps its own license. There is no internet relay or automatic cross-platform subscription/account sharing in this build.

Android now includes a native, user-started floating annotation service. More → Draw over other apps opens its setup. The user grants Android’s Display over other apps permission and explicitly starts a session. A persistent notification and floating return button provide restore/stop controls. It supports pen, highlight, line/rectangle/circle/arrow, text, eraser, undo, clear, touch-through and recording view. It draws its own marks without reading another app’s pixels or using Accessibility. Android can hide overlays on protected/system screens. In BlueStacks, this mode applies to Android apps inside the emulator; the Windows desktop is handled by your separate Windows software.

Android drawing outside the app and the in-app whiteboard keep separate drafts. Native floating ink is saved privately between sessions; PNG/JSON board export applies to the whiteboard. There is no screen-capture service or integrated recorder. iPhone/iPad support has the compact whiteboard interface and native source/build workflow, but no system-wide overlay. Apple compilation/signing and real-device testing remain.

## Verification

`npm test` checks trial boundaries, rollback, paid access rules, pairing validation and backup validation. `npm run test:ui` checks the bundled whiteboard in Android-sized Chromium and iPhone/iPad WebKit, including persistence, clear/undo, text sizing, recording, exports and expired-trial behavior. Browser simulations do not replace device, native sharing or live store billing tests. See `verification/` for completed local results.

The source package deliberately excludes installed dependencies, build caches, signing credentials, SDKs, desktop license files and private seller material. Developer tools must be installed to rebuild; end users install a single store app or APK.
