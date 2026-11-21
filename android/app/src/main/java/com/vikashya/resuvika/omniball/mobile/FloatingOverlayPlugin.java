package com.vikashya.resuvika.omniball.mobile;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "FloatingOverlay", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO })
})
public class FloatingOverlayPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Settings.canDrawOverlays(getContext()));
        result.put("running", OverlayService.running);
        result.put("androidVersion", Build.VERSION.RELEASE);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())));
                call.resolve();
            } catch (Exception e) {
                call.reject("Open Android Settings > Apps > Special app access > Display over other apps to allow Resuvika Notes.");
            }
        });
    }

    @PluginMethod
    public void openCastSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_CAST_SETTINGS));
                call.resolve();
            } catch (Exception e) {
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
                    call.resolve();
                } catch (Exception ex) {
                    call.reject("Swipe down Quick Settings and tap Smart View / Cast to mirror to your TV.");
                }
            }
        });
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Open Android Settings > Apps > Resuvika Notes > Permissions.");
            }
        });
    }

    @PluginMethod
    public void configure(PluginCall call) {
        JSObject s = call.getObject("settings", new JSObject());
        String orientation = s.optString("orientation", "portrait");
        if (!orientation.equals("auto") && !orientation.equals("landscape")) orientation = "portrait";
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("omniball_overlay", Context.MODE_PRIVATE);
        prefs.edit().putString("settings", s.toString()).putString("orientation", orientation).apply();
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).applyOrientation();
            call.resolve();
        });
    }

    @PluginMethod
    public void setAccess(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("First allow Display over other apps, then tap Start floating tools.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
            return;
        }
        launch(call);
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        launch(call);
    }

    private void launch(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                ContextCompat.startForegroundService(getContext(), new Intent(getContext(), OverlayService.class));
                call.resolve();
                getActivity().moveTaskToBack(true);
            } catch (Exception e) {
                call.reject("Android could not start floating tools.", e);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), OverlayService.class));
        call.resolve();
    }

    @PluginMethod
    public void dictateSpeech(PluginCall call) {
        String lang = call.getString("language", "");
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if (lang != null && !lang.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        else intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, java.util.Locale.getDefault().toLanguageTag());
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak in any language to write...");
        try {
            startActivityForResult(call, intent, "speechResult");
        } catch (Exception e) {
            call.reject("Speech-to-text is unavailable on this device.");
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            java.util.ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
            JSObject r = new JSObject();
            r.put("text", text);
            call.resolve(r);
        } else {
            JSObject r = new JSObject();
            r.put("text", "");
            r.put("cancelled", true);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "scheduleReminderAfterPerm");
            return;
        }
        doScheduleReminder(call);
    }

    @PermissionCallback
    private void scheduleReminderAfterPerm(PluginCall call) {
        doScheduleReminder(call);
    }

    private void doScheduleReminder(PluginCall call) {
        try {
            String title = call.getString("title", "Study Reminder");
            long triggerAt = call.getLong("triggerAt", System.currentTimeMillis() + 60000L);
            int id = call.getInt("id", (int) (System.currentTimeMillis() & 0x7fffffff));
            android.app.AlarmManager am = (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(getContext(), ReminderReceiver.class).putExtra("title", title).putExtra("id", id);
            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(
                getContext(), id, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
            );
            if (am != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    android.app.PendingIntent showPi = android.app.PendingIntent.getActivity(
                        getContext(), id, new Intent(getContext(), MainActivity.class),
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
                    );
                    am.setAlarmClock(new android.app.AlarmManager.AlarmClockInfo(triggerAt, showPi), pi);
                } else {
                    am.set(android.app.AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not schedule reminder: " + e.getMessage());
        }
    }

    @PluginMethod
    public void showReminderNow(PluginCall call) {
        String title = call.getString("title", "Study Reminder");
        int id = call.getInt("id", (int) (System.currentTimeMillis() & 0x7fffffff));
        Intent intent = new Intent(getContext(), ReminderReceiver.class).putExtra("title", title).putExtra("id", id);
        new ReminderReceiver().onReceive(getContext(), intent);
        call.resolve();
    }
}
