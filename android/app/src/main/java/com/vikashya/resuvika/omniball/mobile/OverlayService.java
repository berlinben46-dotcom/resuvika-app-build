package com.vikashya.resuvika.omniball.mobile;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.hardware.input.InputManager;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import androidx.core.app.NotificationCompat;
import androidx.core.graphics.PathParser;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** User-started floating annotation session. All windows and ink belong to this app. */
public class OverlayService extends Service {
    public static volatile boolean running=false;
    private static final String STOP="omniball.overlay.STOP",RESTORE="omniball.overlay.RESTORE";
    private static final int NOTICE=1082;
    private WindowManager manager;private OverlayInkView ink;private LinearLayout bubble;private View palette,textPanel;
    private WindowManager.LayoutParams inkLayout,bubbleLayout;private JSONObject settings;private SharedPreferences prefs;
    private boolean drawing=false,recording=false,inkHidden=false;private int screenWidth,screenHeight,accent;private float density;
    private final Handler handler=new Handler(Looper.getMainLooper());private final Runnable saveTask=()->saveInk();
    private final ExecutorService storage=Executors.newSingleThreadExecutor();private final Object saveLock=new Object();private ArrayList<OverlayInkView.Mark> pendingSave;private boolean writerRunning=false;
    private final Runnable accessTask=new Runnable(){public void run(){if(!Settings.canDrawOverlays(OverlayService.this)){toast("Overlay permission was turned off.");stopSelf();return;}handler.postDelayed(this,30000);}};
    private static final LinkedHashMap<String,String> LABELS=new LinkedHashMap<>();
    private static final HashMap<String,String> PATHS=new HashMap<>();
    static{
        LABELS.put("pen","Pen");LABELS.put("highlighter","Highlight");LABELS.put("rect","Rectangle");LABELS.put("eraser","Eraser");LABELS.put("text","Text");LABELS.put("circle","Circle");LABELS.put("line","Line");LABELS.put("arrow","Arrow");LABELS.put("laser","Laser");
        PATHS.put("pen","M5 19L8 18L19 7L16 4L5 15Z M14 6L17 9");PATHS.put("highlighter","M5 17L11 5L17 8L11 20 M3 21H15");PATHS.put("eraser","M4 14L13 4L20 11L11 21H8L4 17Z M9 9L16 16 M8 21H21");PATHS.put("rect","M4 5H20V19H4Z");PATHS.put("circle","M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3");PATHS.put("line","M4 20L20 4");PATHS.put("arrow","M4 20L20 4M9 4H20V15");PATHS.put("text","M4 5H20M12 5V20M8 20H16");PATHS.put("laser","M13 2L5 14H12L11 22L19 10H12Z");PATHS.put("undo","M9 5L4 10L9 15M4 10H14A6 6 0 0 1 14 22");PATHS.put("touch","M9 12V5A2 2 0 0 1 13 5V12V9A2 2 0 0 1 16 9V13V11A2 2 0 0 1 19 11V16C19 20 16 22 12 22C10 22 8 21 7 19L3 13A2 2 0 0 1 6 11L9 14");PATHS.put("board","M3 4H21V18H3ZM8 22L12 18L16 22");PATHS.put("clear","M4 6H20M9 6V3H15V6M6 6L7 21H17L18 6M10 10V17M14 10V17");PATHS.put("close","M6 6L18 18M6 18L18 6");PATHS.put("spark","M12 3L14.5 9.5L21 12L14.5 14.5L12 21L9.5 14.5L3 12L9.5 9.5Z");PATHS.put("dot","M12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8");PATHS.put("v","M4 5L12 20L20 5");
    }
    @Override public IBinder onBind(Intent intent){return null;}
    private int dp(float value){return Math.round(value*density);}
    private void toast(String message){Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
    @Override public void onCreate(){
        super.onCreate();density=getResources().getDisplayMetrics().density;manager=(WindowManager)getSystemService(WINDOW_SERVICE);prefs=getSharedPreferences("omniball_overlay",MODE_PRIVATE);
        if(!Settings.canDrawOverlays(this)){stopSelf();return;}
        try{
            if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel("omniball_overlay","Floating annotation",NotificationManager.IMPORTANCE_LOW);channel.setDescription("Controls for a floating drawing session you started.");getSystemService(NotificationManager.class).createNotificationChannel(channel);}
            if(Build.VERSION.SDK_INT>=34)startForeground(NOTICE,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);else startForeground(NOTICE,notification());
            try{settings=new JSONObject(prefs.getString("settings","{}"));}catch(JSONException e){settings=new JSONObject();}
            accent=color(settings.optString("color","#5557d9"),Color.rgb(85,87,217));updateBounds();
            ink=new OverlayInkView(this,new OverlayInkView.Events(){public void changed(){handler.removeCallbacks(saveTask);handler.postDelayed(saveTask,450);}public void text(float x,float y){showText(x,y);}});
            ink.inkColor=prefs.getInt("inkColor",Color.rgb(85,87,217));ink.inkWidth=prefs.getFloat("inkWidth",dp(3));ink.pencilOnly=settings.optBoolean("pencilOnly",false);ink.tool=prefs.getString("tool","pen");if(!LABELS.containsKey(ink.tool))ink.tool="pen";
            inkLayout=layout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);inkLayout.alpha=touchOpacity();
            manager.addView(ink,inkLayout);loadInk();createBubble();running=true;handler.post(accessTask);
            toast("Floating tools ready. Tap the button for tools; drag it to move.");
        }catch(Exception e){toast("Floating tools could not open. Check Android's Display over other apps permission.");stopSelf();}
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
        if(intent!=null&&RESTORE.equals(intent.getAction())&&bubble!=null){recording=false;ink.hideBrand=false;bubble.setVisibility(View.VISIBLE);setDrawing(false);showPalette();}
        return START_NOT_STICKY;
    }
    private Notification notification(){
        int immutable=PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE;
        PendingIntent board=PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),immutable);
        PendingIntent stop=PendingIntent.getService(this,2,new Intent(this,OverlayService.class).setAction(STOP),immutable);
        PendingIntent restore=PendingIntent.getService(this,3,new Intent(this,OverlayService.class).setAction(RESTORE),immutable);
        return new NotificationCompat.Builder(this,"omniball_overlay").setSmallIcon(R.drawable.ic_overlay_notice).setContentTitle("Omniball floating tools").setContentText("Draw over your apps · Tap to return to your board").setContentIntent(board).setOngoing(true).setSilent(true).addAction(0,"Restore tools",restore).addAction(0,"Stop",stop).build();
    }
    private WindowManager.LayoutParams layout(int w,int h,int flags){
        WindowManager.LayoutParams p=new WindowManager.LayoutParams(w,h,Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,flags,PixelFormat.TRANSLUCENT);p.gravity=Gravity.TOP|Gravity.LEFT;p.setTitle("Resuvika Omniball tools");return p;
    }
    private void updateBounds(){Point point=new Point();manager.getDefaultDisplay().getRealSize(point);screenWidth=point.x;screenHeight=point.y;}
    private int color(String text,int fallback){try{return Color.parseColor(text);}catch(Exception e){return fallback;}}
    private GradientDrawable surface(int bg,int stroke,float radius){GradientDrawable d=new GradientDrawable();d.setColor(bg);d.setCornerRadius(dp(radius));if(stroke!=0)d.setStroke(dp(1),stroke);return d;}
    private TextView label(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setFontFeatureSettings("kern");t.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));return t;}
    private class ToolIcon extends View{
        private final String name;private final int tint;private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
        ToolIcon(String name,int tint){super(OverlayService.this);this.name=name;this.tint=tint;}
        @Override protected void onDraw(Canvas c){String data=PATHS.get(name);if(data==null)data=PATHS.get("pen");Path path=PathParser.createPathFromPathData(data);c.save();float scale=Math.min(getWidth(),getHeight())/24f;c.translate((getWidth()-24*scale)/2,(getHeight()-24*scale)/2);c.scale(scale,scale);p.setColor(tint);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.7f);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);c.drawPath(path,p);c.restore();}
    }
    private void createBubble(){
        int size=settings.optInt("size",52);if(size!=44&&size!=52&&size!=60)size=52;
        bubble=new LinearLayout(this);bubble.setGravity(Gravity.CENTER);bubble.setPadding(dp(13),dp(13),dp(13),dp(13));bubble.setBackground(surface(accent,0x88ffffff,60));bubble.setElevation(dp(8));bubble.setContentDescription("Omniball quick tools. Tap to switch back to touch and open tools. Drag to move.");
        bubble.addView(new ToolIcon(settings.optString("icon","pen"),Color.WHITE),new LinearLayout.LayoutParams(-1,-1));bubbleLayout=layout(dp(size),dp(size),WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
        bubble.setOnClickListener(v->{if(palette==null){setDrawing(false);showPalette();}else removePalette();});
        String side=prefs.getString("bubbleSide",settings.optString("side","right"));float y=prefs.getFloat("bubbleY",(float)settings.optDouble("y",.65));bubbleLayout.x=side.equals("left")?dp(12):screenWidth-dp(size+12);bubbleLayout.y=Math.max(dp(40),Math.min(screenHeight-dp(size+48),(int)(screenHeight*y)));bubbleLayout.alpha=(float)Math.max(.55,Math.min(1,settings.optDouble("opacity",1)));
        bubble.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int bx,by;boolean moved;
            public boolean onTouch(View v,android.view.MotionEvent e){
                if(e.getAction()==MotionEvent.ACTION_DOWN){sx=e.getRawX();sy=e.getRawY();bx=bubbleLayout.x;by=bubbleLayout.y;moved=false;return true;}
                if(e.getAction()==MotionEvent.ACTION_MOVE){if(Math.hypot(e.getRawX()-sx,e.getRawY()-sy)>dp(7))moved=true;if(moved){removePalette();bubbleLayout.x=Math.max(0,Math.min(screenWidth-bubbleLayout.width,bx+(int)(e.getRawX()-sx)));bubbleLayout.y=Math.max(dp(28),Math.min(screenHeight-bubbleLayout.height-dp(36),by+(int)(e.getRawY()-sy)));manager.updateViewLayout(bubble,bubbleLayout);}return true;}
                if(e.getAction()==MotionEvent.ACTION_UP){if(moved){boolean left=bubbleLayout.x<screenWidth/2;bubbleLayout.x=left?dp(12):screenWidth-bubbleLayout.width-dp(12);manager.updateViewLayout(bubble,bubbleLayout);prefs.edit().putString("bubbleSide",left?"left":"right").putFloat("bubbleY",bubbleLayout.y/(float)screenHeight).apply();}else bubble.performClick();return true;}return true;
            }});
        manager.addView(bubble,bubbleLayout);
    }
    private float touchOpacity(){float limit=.8f;if(Build.VERSION.SDK_INT>=31){InputManager input=getSystemService(InputManager.class);if(input!=null)limit=input.getMaximumObscuringOpacityForTouch();}return Math.min(.65f,limit*.85f);}
    private void setDrawing(boolean enabled){
        if(ink==null)return;ink.cancelDraft();drawing=enabled;inkLayout.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|(enabled?0:WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);inkLayout.alpha=enabled?1f:touchOpacity();
        try{manager.updateViewLayout(ink,inkLayout);}catch(Exception ignored){}bubble.setBackground(surface(enabled?accent:Color.rgb(29,43,65),0x99ffffff,60));ink.invalidate();
    }
    private LinearLayout toolButton(String text,String icon,Runnable action,boolean selected){
        LinearLayout b=new LinearLayout(this);b.setOrientation(LinearLayout.VERTICAL);b.setGravity(Gravity.CENTER);b.setPadding(dp(4),dp(8),dp(4),dp(8));b.setBackground(surface(selected?0xffedecff:0xfff5f7fb,selected?0xffd4d1ff:0,11));b.setContentDescription(text);b.addView(new ToolIcon(icon,selected?accent:0xff465571),new LinearLayout.LayoutParams(dp(22),dp(22)));TextView t=label(text,10,selected?accent:0xff465571);t.setGravity(Gravity.CENTER);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(4);b.addView(t,lp);b.setOnClickListener(v->action.run());return b;
    }
    private void rowButton(LinearLayout row,String text,String icon,Runnable action){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(56),1);p.setMargins(dp(3),dp(3),dp(3),dp(3));row.addView(toolButton(text,icon,action,false),p);}
    private void showPalette(){
        removePalette();if(textPanel!=null)return;
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(10),dp(10),dp(10),dp(10));body.setBackground(surface(Color.WHITE,0xffdfe5ef,18));body.setElevation(dp(9));
        TextView title=label("OMNIBALL · QUICK TOOLS",10,0xff67738b);title.setPadding(dp(6),dp(4),dp(6),dp(8));body.addView(title);
        ArrayList<String> favorites=new ArrayList<>();JSONArray a=settings.optJSONArray("favorites");if(a!=null)for(int i=0;i<a.length();i++){String value=a.optString(i);if(LABELS.containsKey(value)&&!favorites.contains(value)&&favorites.size()<6)favorites.add(value);}if(favorites.isEmpty())favorites.addAll(Arrays.asList("pen","rect","eraser","text"));
        LinearLayout current=null;int index=0;for(String id:favorites){if(index%3==0){current=new LinearLayout(this);body.addView(current);}String tool=id;LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(73),dp(62));p.setMargins(dp(3),dp(3),dp(3),dp(3));current.addView(toolButton(LABELS.get(id),id,()->{ink.tool=tool;prefs.edit().putString("tool",tool).apply();inkHidden=false;ink.setVisibility(View.VISIBLE);removePalette();setDrawing(true);},id.equals(ink.tool)),p);index++;}
        LinearLayout actions=new LinearLayout(this);rowButton(actions,"Undo","undo",()->ink.undo());rowButton(actions,"Clear","clear",()->ink.clearInk());rowButton(actions,inkHidden?"Show ink":"Hide ink","touch",()->{inkHidden=!inkHidden;ink.setVisibility(inkHidden?View.INVISIBLE:View.VISIBLE);setDrawing(false);removePalette();});body.addView(actions);
        LinearLayout colors=new LinearLayout(this);colors.setGravity(Gravity.CENTER);for(String hex:new String[]{"#5557d9","#ef4444","#2563eb","#0f766e","#f59e0b","#111827"}){View c=new View(this);int inkColor=Color.parseColor(hex);c.setBackground(surface(inkColor,0xffdde2ec,20));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(25),dp(25));p.setMargins(dp(5),dp(7),dp(5),dp(4));colors.addView(c,p);c.setContentDescription("Ink color "+hex);c.setOnClickListener(v->{ink.inkColor=inkColor;prefs.edit().putInt("inkColor",inkColor).apply();});}body.addView(colors);
        SeekBar width=new SeekBar(this);width.setMax(19);width.setProgress(Math.max(0,Math.round(ink.inkWidth/density)-1));width.setContentDescription("Stroke width");width.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar s,int value,boolean user){ink.inkWidth=dp(value+1);prefs.edit().putFloat("inkWidth",ink.inkWidth).apply();}public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}});body.addView(width,new LinearLayout.LayoutParams(-1,dp(32)));
        LinearLayout footer=new LinearLayout(this);rowButton(footer,"Board / settings","board",this::openBoard);rowButton(footer,"Recording","spark",this::showRecording);rowButton(footer,"Stop","close",()->stopSelf());body.addView(footer);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setBackground(surface(Color.WHITE,0xffdfe5ef,18));scroll.addView(body);palette=scroll;
        WindowManager.LayoutParams p=layout(dp(258),Math.min(dp(344),screenHeight-dp(84)),WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
        p.x=Math.max(dp(10),Math.min(screenWidth-p.width-dp(10),bubbleLayout.x));p.y=Math.max(dp(32),Math.min(screenHeight-p.height-dp(36),bubbleLayout.y>screenHeight/2?bubbleLayout.y-p.height-dp(10):bubbleLayout.y+bubbleLayout.height+dp(10)));
        manager.addView(palette,p);
    }
    private void removePalette(){if(palette!=null){try{manager.removeView(palette);}catch(Exception ignored){}palette=null;}}
    private void showRecording(){
        removePalette();LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(18),dp(18),dp(18),dp(18));body.setBackground(surface(Color.WHITE,0xffdfe5ef,18));body.addView(label("Recording view",18,0xff182b45));TextView info=label("Hide the floating button while using your device's screen recorder. Restore from the Omniball notification or reopen the app.",13,0xff566b85);info.setPadding(0,dp(12),0,dp(10));body.addView(info);CheckBox brand=new CheckBox(this);brand.setText("Hide Vikashya branding");brand.setTextColor(0xff182b45);brand.setChecked(prefs.getBoolean("hideRecordingBrand",false));body.addView(brand);
        Button start=new Button(this);start.setText("Hide controls");body.addView(start);Button cancel=new Button(this);cancel.setText("Cancel");body.addView(cancel);palette=body;WindowManager.LayoutParams p=layout(Math.min(dp(310),screenWidth-dp(32)),-2,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);p.x=(screenWidth-p.width)/2;p.y=Math.max(dp(40),(screenHeight-dp(280))/2);manager.addView(palette,p);
        cancel.setOnClickListener(v->{removePalette();showPalette();});start.setOnClickListener(v->{prefs.edit().putBoolean("hideRecordingBrand",brand.isChecked()).apply();ink.hideBrand=brand.isChecked();inkHidden=false;ink.setVisibility(View.VISIBLE);recording=true;removePalette();bubble.setVisibility(View.INVISIBLE);setDrawing(true);toast("Controls hidden. Use the Omniball notification or reopen the app to restore.");});
    }
    private void showText(float x,float y){
        removePalette();if(textPanel!=null)return;setDrawing(false);
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(16),dp(16),dp(16));body.setBackground(surface(Color.WHITE,0xffd5dfef,16));body.addView(label("Add screen text",17,0xff183050));EditText input=new EditText(this);input.setTextColor(0xff183050);input.setHint("Type your text…");input.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);body.addView(input,new LinearLayout.LayoutParams(-1,dp(100)));EditText size=new EditText(this);size.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);size.setText(String.valueOf(prefs.getInt("textSize",28)));size.setTextColor(0xff183050);size.setContentDescription("Text size");body.addView(label("Text size",12,0xff566b85));body.addView(size);LinearLayout row=new LinearLayout(this);Button done=new Button(this);done.setText("Add text");Button cancel=new Button(this);cancel.setText("Cancel");row.addView(done,new LinearLayout.LayoutParams(0,-2,1));row.addView(cancel,new LinearLayout.LayoutParams(0,-2,1));body.addView(row);textPanel=body;
        WindowManager.LayoutParams p=layout(Math.min(dp(320),screenWidth-dp(24)),-2,WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);p.x=(screenWidth-p.width)/2;p.y=dp(56);p.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE;manager.addView(textPanel,p);
        done.setOnClickListener(v->{int value=28;try{value=Integer.parseInt(size.getText().toString());}catch(Exception ignored){}value=Math.max(12,Math.min(120,value));prefs.edit().putInt("textSize",value).apply();ink.addText(input.getText().toString(),x,y,dp(value));closeText();setDrawing(true);});cancel.setOnClickListener(v->closeText());input.requestFocus();handler.postDelayed(()->{InputMethodManager keyboard=(InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);if(textPanel!=null)keyboard.showSoftInput(input,InputMethodManager.SHOW_IMPLICIT);},150);
    }
    private void closeText(){if(textPanel!=null){InputMethodManager keyboard=(InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);keyboard.hideSoftInputFromWindow(textPanel.getWindowToken(),0);try{manager.removeView(textPanel);}catch(Exception ignored){}textPanel=null;}}
    private void openBoard(){saveInk();Intent intent=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);startActivity(intent);stopSelf();}
    private void saveInk(){
        if(ink==null||storage.isShutdown())return;
        synchronized(saveLock){pendingSave=ink.snapshot();if(writerRunning)return;writerRunning=true;}
        storage.execute(()->{while(true){ArrayList<OverlayInkView.Mark> snapshot;synchronized(saveLock){snapshot=pendingSave;pendingSave=null;if(snapshot==null){writerRunning=false;return;}}
            try{JSONArray marks=new JSONArray();for(OverlayInkView.Mark mark:snapshot)marks.put(mark.json());byte[] data=marks.toString().getBytes(StandardCharsets.UTF_8);File temp=new File(getFilesDir(),"overlay-ink.tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(data);}File target=new File(getFilesDir(),"overlay-ink.json");if(!temp.renameTo(target)){try(FileOutputStream out=new FileOutputStream(target)){out.write(data);}temp.delete();}}
            catch(Exception e){handler.post(()->toast("Could not save the floating ink draft. Your board files are unchanged."));}
        }});
    }
    private void loadInk(){File file=new File(getFilesDir(),"overlay-ink.json");if(!file.exists()||file.length()>32*1024*1024)return;try(FileInputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);ink.restore(new JSONArray(out.toString("UTF-8")));}catch(Exception ignored){}}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);updateBounds();removePalette();closeText();if(bubble!=null){bubbleLayout.x=Math.min(Math.max(dp(12),bubbleLayout.x),screenWidth-bubbleLayout.width-dp(12));bubbleLayout.y=Math.min(Math.max(dp(40),bubbleLayout.y),screenHeight-bubbleLayout.height-dp(48));try{manager.updateViewLayout(bubble,bubbleLayout);}catch(Exception ignored){}}}
    @Override public void onDestroy(){running=false;handler.removeCallbacksAndMessages(null);saveInk();storage.shutdown();closeText();removePalette();for(View view:new View[]{bubble,ink})if(view!=null)try{manager.removeView(view);}catch(Exception ignored){}if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
}
