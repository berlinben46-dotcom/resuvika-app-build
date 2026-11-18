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
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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
    private static class DateLimit{static final double MAX=4102444800000.0;}
}
