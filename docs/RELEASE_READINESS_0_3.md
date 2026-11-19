# Release readiness — 18 November 2026

**Status: testing preview. Not approved for a production Play Store rollout.**

## Delivered

- Visible Board / Notes / Documents / Connect navigation and immediately reachable saved boards.
- Scrollable sheets and lists; drag restricted to the floating drawing button; swipe navigation restricted to the navigation bar.
- A new responsive visual system, larger controls, focus indicators, modal focus management, readable contrast, reduced-motion support, and zoom-permitting viewport settings.
- Offline PDF library with local PDF.js worker/fonts, page rendering, zoom, text extraction, and explicit Back. PDF scripts are not evaluated. PDF note printing uses Android’s native print service rather than replacing the app window.
- Searchable saved boards, note renaming, auto-save feedback, and recovery copies before replacing a board.
- Native paired-device Bluetooth RFCOMM transport, runtime Nearby devices permission, timeouts, bounded frames, disconnect handling, chunked transfers, SHA-256 verification, and receiver acknowledgements.
- Phone-to-laptop live drawing and notes, bidirectional file transfer, Android-to-Android links, a persistent phone inbox, and a Windows companion.
- Separate preview package; production release builds fail without signing configuration.

This work uses the adjacent `Resuvika-Omniball-Mobile-0.2.0-Source` supplied on disk. Its generated `www` files were not byte-identical to the supplied APK. The untouched source was committed first, and the original APK/source folder was not edited. Confirm that this is the intended production code line before migrating existing customer installations.

## Verification evidence

See `verification/` in the working project and the separate verification archive for the final results, screenshots, build logs, native test XML, and lint summary. Browser tests use isolated profiles and synthetic notes/PDFs. No customer files or store purchases are used.

Automated scans do not prove full accessibility. Protocol and socket tests do not prove radio interoperability. No physical Android device was connected during this work.

## Release work still required

1. Test the preview on real Android phones and a real Windows Bluetooth laptop. Include Android permission denial/revocation, radios off, incompatible devices, long transfers, interrupted connections, and reconnect. Test Android Back after importing/reading a PDF and returning from the print sheet.
2. Run TalkBack, large-font/display-scaling, low-memory, battery, and long-document tests. Existing native overlay lint warnings and full translation coverage need review. The new UI currently uses English; Unicode note content is supported, but translated interfaces are not provided.
3. Verify the configured public privacy and terms pages. Both `https://vikashya.com/privacy` and `https://vikashya.com/terms` could not be resolved from this environment on the verification date. Do not treat them as validated, published policy pages.
4. Confirm the intended pricing and entitlements. The supplied source currently enables editing with a free/Pro banner model, while some older documents describe a seven-day editing trial. This change does not alter that access model. Verify Play Billing / RevenueCat products, restore, cancellation, pending payment, and package registration using store test accounts.
5. Supply the owner’s upload keystore and signing variables securely. Keep the production package `com.vikashya.resuvika.omniball.mobile`. Version code 3 must be increased if it has already been used in Play Console. No production key was created, retrieved, or embedded here.
6. Build and sign the production AAB; run release lint and Play pre-launch reports, including the API 36 / device requirements applicable at submission. The debug APK is not a production upload artifact. Verify any native library/page-size requirements against the final signed bundle.
7. Complete Play Console Data safety, privacy policy, app content, content rating, ads declaration, billing, and the foreground annotation-service declaration. The overlay feature uses `specialUse` foreground service and Display over other apps; confirm its disclosure and eligibility. The app does not request an Accessibility service for drawing.
8. Run the internal/closed tests required for the owner’s developer account, prepare real-device screenshots and store copy, review crashes/ANRs, then approve a staged production rollout.

Official references:

- [Google Play target SDK requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
- [Android Bluetooth connections](https://developer.android.com/develop/connectivity/bluetooth/connect-bluetooth-devices)
- [Windows Bluetooth service registration](https://learn.microsoft.com/en-us/windows/win32/bluetooth/bluetooth-and-wsaqueryset-for-set-service)

## Product direction beyond this preview

Competing with established note apps needs measured usability and reliability work beyond a visual refresh. Useful next stages are structured notebooks/tags/favorites, richer task and note templates, PDF annotation, OCR/search in scans, cross-device account sync with conflict recovery, encryption/key recovery, localization/RTL testing, and monitored performance on lower-end phones. Those capabilities are not claimed as implemented in this preview.
