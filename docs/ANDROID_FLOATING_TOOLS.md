# Android 0.2.0 — compact controls and floating annotation

## Install the update

Install `Resuvika-Omniball-Android-0.2.0-PREVIEW.apk` over 0.1.0. The package ID is unchanged and the local test signing certificate is retained. Existing boards, notes and trial dates stay in the app data. A normal update does not restart the seven-day trial. Back up boards before uninstalling; reinstalling can erase local data.

## Small, customizable controls

The board starts with **one floating button**. Tap to see quick tools; choose a tool and the palette closes automatically. Drag the button to either edge and a convenient height.

The gear in the palette opens **Make it yours**. Choose up to six favorite tools, change the button icon, size, accent color, opacity and dock edge. Choose portrait, landscape or follow-device orientation, and finger/stylus or stylus-only input. Settings survive reopening the app. Large-screen Android/emulator settings may control orientation despite an app preference; the palette stays compact in wide windows.

Style provides ink color/width, text size, background and fill options. All drawing tools, notes, clear/undo/redo, boards/export, purchases, settings and recording are under More. Fit canvas to this screen keeps the current content, adapts the page dimensions and saves its previous layout as a recovery board.

## Draw over other Android apps

1. Tap the floating button → More → **Draw over other apps**.
2. Tap **Allow display over other apps**. Android opens its permission settings. Allow Resuvika Omniball, then return to the app.
3. Refresh permission status if needed, then tap **Start floating tools**. On newer Android versions, allow notification access so restore/stop actions are easy to reach. Drawing can still start if notification display is declined; reopen Omniball to stop/restore.
4. The app moves into the background and leaves one small button over your Android screen. Open a browser, PDF reader, slides or another supported app.
5. Tap the button and select Pen, Highlight, a shape, Text, Eraser or Laser from your favorites. This enables drawing and closes the palette. Laser marks disappear after the gesture.
6. **Tap the floating button to return to touch-through and open the palette.** You can now scroll or use the underlying app outside the small palette. Tap the button again to close the palette, or choose a drawing tool to resume writing. The floating button is dark in touch mode and uses your accent color in drawing mode.
7. Undo and Clear affect floating ink only. Hide ink lets you temporarily remove marks without deleting them. Board/settings returns to the whiteboard/settings and ends the floating session while retaining its private ink draft. Stop or the notification’s Stop action also ends the session.

The floating draft and whiteboard are separate. The last floating marks reload when you start another session. Whiteboard PNG/JSON export does not capture another app’s screen or the floating draft. No screen-reading, capture, Accessibility service, microphone or automatic boot start is involved. Drawing is screen-based; marks are not attached to scrolling content underneath.

## Recording

In the whiteboard: More → Recording view → optionally Hide Vikashya branding → Hide controls. Hold the top edge for about one second to restore controls.

Over other apps: the floating palette has Recording. It can hide the button and optionally branding while leaving drawing active. Restore using the Omniball ongoing notification, or reopen Omniball from the launcher/recent apps. Use your device’s own screen recorder. This app does not start a recording.

## BlueStacks

The Android app runs **inside BlueStacks**. Floating tools can cover other Android apps in that instance, not the Windows taskbar or programs outside the emulator. Use the Windows edition for Windows-wide annotation.

Portrait is the app’s default preference. If BlueStacks keeps its window wide, use the instance’s portrait/rotate controls or display configuration; the location varies by BlueStacks version. You can also choose App orientation in Omniball’s settings. Existing board content is preserved when upgrading. New blank boards use the current screen size, and Style → Fit canvas to this screen adapts a saved wide board without deleting it.

If tools do not appear over another app, confirm Android’s overlay permission and try a normal browser or home screen first. Some protected/system apps deliberately hide overlays. Do not disable Android’s touch/security protections to force this feature.

## Test status and scope

The APK is compiled and signature/content checked; layout and whiteboard flows are tested in phone, tablet and wide browser views. No connected Android/BlueStacks device was available in the build environment, so actual overlay permissions, touch-through, native keyboard and service lifecycle must still be tested on your device. iPhone/iPad use the compact in-app whiteboard; this Android overlay is not implemented on iOS.

Official platform references: [overlay permission](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW), [touch-through restrictions](https://developer.android.com/about/versions/12/behavior-changes-all#untrusted-touch-events), [Android large-screen orientation behavior](https://developer.android.com/about/versions/16/behavior-changes-16#adaptive-layouts).
