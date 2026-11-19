# How customers buy

1. The buyer installs **Resuvika Omniball** from Google Play. Your website should link to the Play listing once published. Do not distribute the Windows EXE as an Android download.
2. First launch starts a seven-day free evaluation. It asks for no payment details and does not charge automatically.
3. The buyer taps the “Trial” / “Get full version” button and sees the prices returned by the store in their currency.
4. They choose monthly, yearly, or lifetime. Google Play presents its purchase confirmation and collects the payment. On iPhone, Apple’s purchase sheet will do this after its store setup is completed.
5. The purchase SDK/backend verifies the store purchase. An active `pro` entitlement unlocks editing. Pending payments do not unlock paid access until confirmed. Cancelled checkout does not unlock paid access.
6. Monthly and yearly subscriptions renew through the store until cancelled. Lifetime is one payment and has no recurring renewal. The app includes “Manage subscription.” Cancellation of a subscription normally retains access through the paid period; refund/revocation and store billing states are handled by the purchase service as its status refreshes.
7. On reinstall or another device using the same store account, the buyer taps **Restore purchases**. This build has no app login, so Android-to-iPhone entitlement transfer and desktop unlock are not promised. Store-specific restore works after the corresponding store products/service configuration is correct.

No buyer activation ID, license key, card form or seller-generated mobile key is involved. Your existing HTML key generator remains for the desktop product only. You can view mobile sales/subscription records in Play Console, later App Store Connect, and RevenueCat.

The evaluation is separate from store subscription offers. Buying during it begins the paid plan shown by the store immediately; the app clearly discloses this. Initially configure ordinary recurring base plans without introductory/free-trial offers. A store-managed trial can be added later together with offer-specific paywall text and eligibility testing.

Drawing and saved boards work offline. Initial payment, restore and subscription refresh need internet access. The SDK caches verified customer information for offline access; expired subscription access is checked against its expiration date. Reconnect to receive cancellations/refunds and other store changes. A lifetime purchase remains subject to store refund/revocation status.

Pricing has not been selected. Set your country prices in the store dashboards; the application displays the store’s localized price. Store and purchase-service fees and regional billing rules should be reviewed in your actual accounts before setting prices.

Official references: [Google Play Billing purchase lifecycle](https://developer.android.com/google/play/billing/integrate), [RevenueCat restore purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases), [Apple in-app purchase rules](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).
