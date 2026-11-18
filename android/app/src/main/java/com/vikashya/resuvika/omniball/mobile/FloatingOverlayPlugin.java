package com.vikashya.resuvika.omniball.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import androidx.activity.result.ActivityResult;
import android.speech.RecognizerIntent;

@CapacitorPlugin(name="FloatingOverlay", permissions={
    @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS}),
    @Permission(alias="mic",strings={Manifest.permission.RECORD_AUDIO})
})
public class FloatingOverlayPlugin extends Plugin {
    @PluginMethod public void requestMic(PluginCall call){
        if(getPermissionState("mic")==PermissionState.GRANTED){
            JSObject r=new JSObject();r.put("granted",true);call.resolve(r);return;
        }
        requestPermissionForAlias("mic",call,"micCallback");
    }
    @PermissionCallback private void micCallback(PluginCall call){
        JSObject r=new JSObject();r.put("granted",getPermissionState("mic")==PermissionState.GRANTED);call.resolve(r);
    }
    @PluginMethod public void status(PluginCall call){
        JSObject result=new JSObject();result.put("allowed",Settings.canDrawOverlays(getContext()));result.put("running",OverlayService.running);result.put("androidVersion",Build.VERSION.RELEASE);call.resolve(result);
    }
    @PluginMethod public void requestPermission(PluginCall call){
        getActivity().runOnUiThread(()->{
            try{getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getContext().getPackageName())));call.resolve();}
            catch(Exception e){call.reject("Open Android Settings > Apps > Special app access > Display over other apps to allow Omniball.");}
        });
    }
    @PluginMethod public void openCastSettings(PluginCall call){
        getActivity().runOnUiThread(()->{
            try{getActivity().startActivity(new Intent(Settings.ACTION_CAST_SETTINGS));call.resolve();}
            catch(Exception e){
                try{getActivity().startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));call.resolve();}
                catch(Exception ex){call.reject("Open your phone's Quick Settings and tap Smart View / Cast to mirror to Smart TV.");}
            }
        });
    }
    @PluginMethod public void configure(PluginCall call){
        JSObject s=call.getObject("settings",new JSObject());
        String orientation=s.optString("orientation","portrait");
        if(!orientation.equals("auto")&&!orientation.equals("landscape"))orientation="portrait";
        android.content.SharedPreferences prefs=getContext().getSharedPreferences("omniball_overlay",Context.MODE_PRIVATE);
        android.content.SharedPreferences.Editor editor=prefs.edit();
        try{org.json.JSONObject old=new org.json.JSONObject(prefs.getString("settings","{}"));if(!old.optString("side","right").equals(s.optString("side","right")))editor.remove("bubbleSide");if(old.optDouble("y",.65)!=s.optDouble("y",.65))editor.remove("bubbleY");}catch(Exception ignored){}
        editor.putString("settings",s.toString()).putString("orientation",orientation).apply();
        getActivity().runOnUiThread(()->{if(getActivity() instanceof MainActivity)((MainActivity)getActivity()).applyOrientation();call.resolve();});
    }
    @PluginMethod public void setAccess(PluginCall call){
        double raw=call.getDouble("until",0.0);long until=Double.isFinite(raw)&&raw>0?(long)Math.min(raw,DateLimit.MAX):0;
        getContext().getSharedPreferences("omniball_overlay",Context.MODE_PRIVATE).edit().putLong("accessUntil",until).apply();
        if(until<=System.currentTimeMillis())getContext().stopService(new Intent(getContext(),OverlayService.class));
        call.resolve();
    }
    @PluginMethod public void start(PluginCall call){
        if(!Settings.canDrawOverlays(getContext())){call.reject("First allow Display over other apps, then return here and tap Start floating tools.");return;}
        // All drawing tools are available free with ads; no trial block on overlay start.
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"notificationResult");return;}
        launch(call);
    }
    @PermissionCallback private void notificationResult(PluginCall call){launch(call);}
    private void launch(PluginCall call){
        getActivity().runOnUiThread(()->{
            try{
                ContextCompat.startForegroundService(getContext(),new Intent(getContext(),OverlayService.class));
                call.resolve();getActivity().moveTaskToBack(true);
            }catch(Exception e){call.reject("Android could not start floating tools. Return to the app and try again.",e);}
        });
    }
    @PluginMethod public void stop(PluginCall call){getContext().stopService(new Intent(getContext(),OverlayService.class));call.resolve();}

    @PluginMethod public void openAppSettings(PluginCall call){
        getActivity().runOnUiThread(()->{
            try{
                Intent intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
            }catch(Exception e){call.reject("Open Android Settings > Apps > Resuvika Omniball > Permissions to allow Microphone.");}
        });
    }

    private android.media.MediaRecorder voiceRecorder;
    private java.io.File voiceFile;
    private long voiceStartedAt=0;

    @PluginMethod public void startVoiceRecord(PluginCall call){
        if(getPermissionState("mic")!=PermissionState.GRANTED){
            requestPermissionForAlias("mic",call,"startVoiceAfterMic");
            return;
        }
        beginNativeVoiceRecord(call);
    }
    @PermissionCallback private void startVoiceAfterMic(PluginCall call){
        if(getPermissionState("mic")!=PermissionState.GRANTED){
            JSObject r=new JSObject();r.put("started",false);r.put("needsSettings",true);call.resolve(r);return;
        }
        beginNativeVoiceRecord(call);
    }
    private void beginNativeVoiceRecord(PluginCall call){
        try{
            stopRecorderSilently();
            java.io.File dir=new java.io.File(getContext().getFilesDir(),"voice_notes");
            if(!dir.exists())dir.mkdirs();
            voiceFile=new java.io.File(dir,"voice_"+System.currentTimeMillis()+".m4a");
            voiceRecorder=Build.VERSION.SDK_INT>=31?new android.media.MediaRecorder(getContext()):new android.media.MediaRecorder();
            voiceRecorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);
            voiceRecorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);
            voiceRecorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);
            voiceRecorder.setAudioEncodingBitRate(96000);
            voiceRecorder.setAudioSamplingRate(44100);
            voiceRecorder.setOutputFile(voiceFile.getAbsolutePath());
            voiceRecorder.prepare();
            voiceRecorder.start();
            voiceStartedAt=System.currentTimeMillis();
            JSObject r=new JSObject();r.put("started",true);call.resolve(r);
        }catch(Exception e){
            stopRecorderSilently();
            call.reject("Could not start microphone: "+e.getMessage());
        }
    }
    @PluginMethod public void stopVoiceRecord(PluginCall call){
        try{
            long durationSec=Math.max(1,(System.currentTimeMillis()-voiceStartedAt)/1000);
            if(voiceRecorder!=null){try{voiceRecorder.stop();}catch(Exception ignored){} voiceRecorder.release();voiceRecorder=null;}
            if(voiceFile==null||!voiceFile.exists()){call.reject("No recording found.");return;}
            byte[] bytes=java.nio.file.Files.readAllBytes(voiceFile.toPath());
            String b64=android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP);
            JSObject r=new JSObject();
            r.put("base64",b64);
            r.put("durationSec",(int)durationSec);
            r.put("mimeType","audio/mp4");
            call.resolve(r);
        }catch(Exception e){call.reject("Could not save voice recording: "+e.getMessage());}
    }
    private void stopRecorderSilently(){
        if(voiceRecorder!=null){try{voiceRecorder.stop();}catch(Exception ignored){} try{voiceRecorder.release();}catch(Exception ignored){} voiceRecorder=null;}
    }

    @PluginMethod public void scheduleReminder(PluginCall call){
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){
            requestPermissionForAlias("notifications",call,"scheduleReminderAfterPerm");
            return;
        }
        doScheduleReminder(call);
    }
    @PermissionCallback private void scheduleReminderAfterPerm(PluginCall call){doScheduleReminder(call);}
    private void doScheduleReminder(PluginCall call){
        try{
            String title=call.getString("title","Class Reminder");
            long triggerAt=call.getLong("triggerAt",System.currentTimeMillis()+60000L);
            int id=call.getInt("id",(int)(System.currentTimeMillis()&0x7fffffff));
            android.app.AlarmManager am=(android.app.AlarmManager)getContext().getSystemService(Context.ALARM_SERVICE);
            Intent intent=new Intent(getContext(),ReminderReceiver.class).putExtra("title",title).putExtra("id",id);
            android.app.PendingIntent pi=android.app.PendingIntent.getBroadcast(getContext(),id,intent,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
            if(am!=null){
                if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.M)am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP,triggerAt,pi);
                else am.set(android.app.AlarmManager.RTC_WAKEUP,triggerAt,pi);
            }
            call.resolve();
        }catch(Exception e){call.reject("Could not schedule reminder: "+e.getMessage());}
    }

    @PluginMethod public void startTvServer(PluginCall call){
        LocalTvServer.start();
        String ip=LocalTvServer.getLocalIpAddress(getContext());
        JSObject r=new JSObject();
        r.put("ip",ip);
        r.put("port",LocalTvServer.PORT);
        r.put("url",ip.isEmpty()?"":"http://"+ip+":"+LocalTvServer.PORT);
        call.resolve(r);
    }
    @PluginMethod public void updateTvBoard(PluginCall call){
        String json=call.getString("json","");
        LocalTvServer.updateBoard(json);
        call.resolve();
    }

    @PluginMethod public void dictateSpeech(PluginCall call){
        String lang=call.getString("language","");
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if(lang!=null&&!lang.isEmpty())intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,lang);
        else intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,java.util.Locale.getDefault().toLanguageTag());
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT,"Speak in any language to write...");
        try{
            startActivityForResult(call,intent,"speechResult");
        }catch(Exception e){
            call.reject("Speech-to-text is not available on this device. Install Google app / Speech Services.");
        }
    }
    @ActivityCallback private void speechResult(PluginCall call, ActivityResult result){
        if(call==null)return;
        if(result.getResultCode()==android.app.Activity.RESULT_OK&&result.getData()!=null){
            java.util.ArrayList<String> matches=result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String text=(matches!=null&&!matches.isEmpty())?matches.get(0):"";
            JSObject r=new JSObject();r.put("text",text);call.resolve(r);
        }else{
            JSObject r=new JSObject();r.put("text","");r.put("cancelled",true);call.resolve(r);
        }
    }
    private static class DateLimit{static final double MAX=4102444800000.0;}
}
