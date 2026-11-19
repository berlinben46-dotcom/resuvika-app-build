# Verification — Omniball 0.3.0 preview

Date: **18 November 2026**. Platform: Windows, JDK 21, Android SDK 36, local Chrome headless.

| Check | Result | Evidence |
|---|---|---|
| Android preview APK compilation | Passed | `verification/android-final-apk.log` |
| Android debug lint | Passed, 0 errors and 42 warnings | `verification/android-build.log`, `verification/lint-summary.json` |
| Native bounded frame reader | 3 meaningful tests passed: split Unicode, truncation/oversize rejection, exact frame limit | `verification/native-tests.xml` |
| JavaScript unit tests | 10 passed | `verification/unit-js.xml` |
| Companion Python tests | 5 passed, including laptop-to-phone transfer and acknowledgement over a local socket pair | `verification/python-tests.log` |
| Android JavaScript → Python companion protocol | Passed multi-chunk reconstruction and SHA-256 verification | `verification/companion-results.json` |
| Packaged Windows EXE viewer | Started in demo mode; viewer rendered; unauthenticated GET/POST rejected | `verification/companion-results.json`, `verification/companion-build.log`, `verification/companion.png` |
| Browser workflows | 15 workflow groups passed across phone, small phone, tablet; no page errors | `verification/ui-results.json` |
| Automated accessibility | 18 page scans; 0 detected WCAG A/AA violations for the selected rules | `verification/accessibility.json` |
| APK signature | Verified development signature | `verification/apk-signature.txt` |
| APK content | Current HTML, app JS, CSS and PDF worker match the delivered APK; target SDK 36; optional Bluetooth hardware | `verification/apk-audit.json`, `verification/apk-metadata.txt` |
| Production signing guard | Correctly rejected a production bundle without signing variables | `verification/release-guard.log` |
| Public privacy / terms pages | Could not resolve from this environment | `verification/policy-urls.json` |

Browser workflow coverage includes saved-board creation/search, note editing/rename/export, note recovery after reload, note PDF-preview dismissal, PDF import/render, page text, paging, zoom, Back to Documents, retained PDFs after reload, disconnected Bluetooth state, scroll-enabled UI, and retained drawings after navigation/reload.

Scans used synthetic content in isolated browser profiles. These are browser simulations, not Android instrumentation or TalkBack sessions. No Android device was connected. Bluetooth radios, Android permission prompts, native PDF printing/sharing and actual hardware Back still need physical-device validation. No Play purchase or production upload was performed.

The 42 remaining lint warnings mainly concern existing native overlay strings/accessibility, launcher assets, unused resources, and build recommendations. Lint success does not mean those warnings have been resolved or that production release has been approved.

See `docs/RELEASE_READINESS_0_3.md` for the remaining release requirements and `docs/ANDROID_0_3_TESTING.md` for installation and pairing instructions.
