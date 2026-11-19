# iPhone and iPad — next stage

The same offline drawing app and purchase UI have a generated Capacitor iOS project at `ios/App/App.xcodeproj`, targeting iOS/iPadOS 16 or newer. It includes the Vikashya icon/launch artwork, an app privacy manifest resource, and native StoreKit purchase support through the RevenueCat SDK. The shared web UI is tested in iPhone/iPad WebKit; this is not a native device test.

Native compilation, signing and submission have not yet been performed. Windows cannot run Xcode. The included `.github/workflows/ios.yml` uses a Mac runner to build an unsigned **simulator** app, with Xcode 26 or newer required by this framework. An App Store/TestFlight IPA still needs your Apple Developer membership, signing certificate/provisioning and app record. No Apple membership was confirmed in this session.

After Android device and Play billing tests:

1. Register/verify your Apple Developer account and create the explicit bundle identifier `com.vikashya.resuvika.omniball.mobile` plus App Store Connect app record.
2. Create non-consumable `omniball_pro_lifetime`. Create auto-renewing `omniball_pro_monthly` and `omniball_pro_yearly` in one subscription group with monthly and yearly duration. Set availability/prices and purchase review metadata. Do not add intro offers until offer-specific disclosure/eligibility handling is added and tested.
3. Add the iOS app to your RevenueCat project, connect its required App Store credentials, import the three Apple products, attach them to `pro`, and configure the corresponding monthly/annual/lifetime packages in the `default` offering for iOS.
4. Set the `appl_…` public SDK key in `iosPublicApiKey` or `RC_IOS_PUBLIC_KEY`. Never embed App Store Connect private `.p8` credentials in the app/source. Run `npm ci`, `npm run sync`, `npm run check:release -- ios` on a Mac.
5. Open the Xcode project. Select your team/signing, check In-App Purchase capability, bundle/version settings and privacy manifest. Build on real iPhone/iPad, test Apple Pencil, keyboard, safe areas, rotation, native sharing and all sandbox purchase/restore/expiry paths.
6. Archive in Xcode, distribute to TestFlight and complete App Store Connect privacy, subscription, screenshot/reviewer and listing metadata. Submit when ready. [Apple’s purchase guidelines](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase) and [RevenueCat Apple privacy guidance](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy) apply to the final configuration.

The app deliberately has no seller license-key entry, desktop click-through or generic drawing-over-other-apps feature on iPhone/iPad. Its recording option hides app UI for the system screen recorder; it does not secretly record the device. Purchases restore through each store account. Cross-store or desktop entitlement sharing would require a separate customer account and entitlement design.
