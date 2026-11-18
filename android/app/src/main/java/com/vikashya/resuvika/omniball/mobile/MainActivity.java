package com.vikashya.resuvika.omniball.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.ActivityInfo;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(FloatingOverlayPlugin.class);
        super.onCreate(state);
        applyOrientation();
    }
    public void applyOrientation() {
        String mode=getSharedPreferences("omniball_overlay",MODE_PRIVATE).getString("orientation","portrait");
        setRequestedOrientation("auto".equals(mode)?ActivityInfo.SCREEN_ORIENTATION_FULL_USER:
            "landscape".equals(mode)?ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE:ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
    }
    @Override public void onResume() {
        super.onResume();
    }
}
