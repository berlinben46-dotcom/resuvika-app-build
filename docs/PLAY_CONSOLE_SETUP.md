# Android: from this project to Google Play

Prepared package ID: **com.vikashya.resuvika.omniball.mobile**. Confirm this before the first Play upload; it cannot later be changed for the same listing. Keep the desktop package separate.

## 1. Create the app and products

In your new Play Console account, finish account/identity/device verification as requested by Google. Create the app record for Resuvika Omniball, then configure a payments profile/merchant account as required for paid products.

Prepare these products; no prices have been chosen:

| Play product | Type | Base plan | RevenueCat package |
| --- | --- | --- | --- |
| `omniball_pro` | Auto-renewing subscription | `monthly` (one month) | `$rc_monthly` |
| `omniball_pro` | Auto-renewing subscription | `yearly` (one year) | `$rc_annual` |
| `omniball_pro_lifetime` | One-time, non-consumable | — | `$rc_lifetime` |

Set the country availability and prices, and activate the products/base plans. A lifetime product must never be consumed. The app already has a no-card seven-day evaluation; initially use ordinary base plans without store introductory/free-trial offers. Monthly/yearly packages must point to their matching billing periods. A subscription should provide continuing value and be described honestly.

## 2. Connect purchase verification

Create your RevenueCat project and add an Android app with the exact package ID. Follow its [Google Play setup instructions](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials) to connect the Play service credentials, enable purchase validation and real-time notifications where supported. Store service-account credentials privately in the service dashboard; never in this source or app.

Import the lifetime product and both subscription base plans (typically displayed as `omniball_pro:monthly` and `omniball_pro:yearly` in RevenueCat). Create entitlement **`pro`**, attach all paid products to it, create offering **`default`**, and attach the three packages above. Mark it as your current/default offering. Configure purchase restore/transfer rules appropriately for customers using the same store account on their own devices.

Copy only the Android **public SDK key**, beginning `goog_`, into `mobile.config.json` → `androidPublicApiKey`, or repository Actions variable `RC_ANDROID_PUBLIC_KEY`. This public key is expected in the compiled app. Do not use a RevenueCat secret key or Test Store API key in production. The SDK handles native store checkout, verification and acknowledgement; the app grants access from the active `pro` entitlement, never from a button press or local paid flag.

RevenueCat is a third-party service, not part of your Play registration. Review its current terms and pricing in your account. There is no deployed custom billing server to maintain in this conversion.

## 3. Configure customer-facing links

Publish your own HTTPS privacy policy and terms pages, and choose your support email. Set `privacyUrl`, `termsUrl`, `supportEmail` in `mobile.config.json`, or Actions variables `PRIVACY_URL`, `TERMS_URL`, `SUPPORT_EMAIL`. The release checker rejects blank or placeholder policy links. The policy draft in this folder must be customized and published before production.

Complete Play’s Data safety form using the actual final SDKs/settings. Boards/notes stay on the device unless explicitly exported/shared or used through the separate laptop companion. RevenueCat handles purchase history and anonymous purchase identifiers. Do not claim “no data collected” for the purchase-enabled app. See [RevenueCat’s Google data-safety guidance](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety-section).

## 4. Sign a release bundle

Use Android Studio → Generate Signed Bundle / APK → Android App Bundle to create an **upload key** or use an existing appropriately secured upload key. Keep a private backup, its alias and passwords. Do not send the key or passwords in chat. Enable Play App Signing for the app.

For local Gradle builds, set these environment variables in the current shell: `ANDROID_KEYSTORE_PATH` (absolute `.jks` path), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The Gradle project reads them without storing passwords in source. Run `npm run sync`, `npm run check:release -- android`, then from `android` run `gradlew bundleRelease`. Increase `versionCode` for every later Play upload.

For GitHub builds, put this mobile project at a private repository root. Add the four corresponding Actions **secrets**, using `ANDROID_KEYSTORE_BASE64` for the base64-encoded keystore file and the other three names unchanged. Add the public SDK key/policy URLs/support as Actions **variables**. Run the Android workflow with “release” selected. It produces a signed `app-release.aab` artifact; it does not upload or publish automatically. Do not use the preview APK’s debug key for production.

## 5. Test before sales

Upload the signed `.aab` to an **internal test** first, add license testers, share the store opt-in link, and install from Google Play. Test all three products, purchase cancellation, pending payment, restore after reinstall, subscription renewal/expiry/cancellation/refund, offline access, and unavailable-store behavior. Use Google’s test payment methods/test tracks; a sideloaded unconfigured preview cannot prove real billing works.

Test on real phones/tablets: finger and stylus, compact controls, text keyboard and sizing, clear/undo, notes, background/foreground recovery, rotation, native PNG/JSON sharing, backup import, and a physical same-Wi-Fi laptop pair. Test the optional floating service separately: permission granted/denied/revoked, start/stop/return, draw versus touch-through, native text keyboard, tools, undo/clear, rotation, notification restore, recording view, app removal and trial/subscription expiry. Review the merged bundle permissions and dependency notices. Camera, microphone, Accessibility and storage-wide access are not requested.

Version 0.2.0 adds `SYSTEM_ALERT_WINDOW`, foreground-service permissions with the `specialUse` type, and notification permission for the user-started floating annotation feature. Complete the relevant foreground-service declaration in Play Console, describe this visible annotation session, and provide the demonstration/evidence requested by Google. The manifest includes the subtype explanation. Store review of this permission/use case is still required; no acceptance is assumed. [Android foreground-service types and Play review](https://developer.android.com/develop/background-work/services/fgs/service-types#special-use).

If today’s registration is a **personal** developer account, Google currently requires a closed test with at least **12 continuously opted-in testers for 14 days** before applying for production access. Internal testing alone does not meet that requirement. [Google’s current requirement](https://support.google.com/googleplay/android-developer/answer/14151465).

Prepare the app icon, real device screenshots, feature graphic, description, content rating, target audience, app-access/reviewer instructions, privacy/Data safety and pricing declarations in Play Console. Request production access when eligible and submit for review. Store acceptance has not been obtained by preparing this code.

## What goes on your website?

For normal Android customers: a **Get it on Google Play** link to your published listing. Google hosts the app and payment flow. You upload the signed `.aab` to **Play Console**, not to your website’s customer download folder. If you deliberately sell a separate direct-download Android edition later, it needs its own distribution, updates and billing design; this store build is not a seller-key APK edition.
