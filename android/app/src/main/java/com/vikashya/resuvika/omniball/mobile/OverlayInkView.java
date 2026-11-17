package com.vikashya.resuvika.omniball.mobile;

import android.content.Context;
import android.graphics.*;
import android.view.MotionEvent;
import android.view.View;
import org.json.*;
import java.util.*;

/** Draws only Omniball's own marks. It never reads pixels, text or events from another app. */
public class OverlayInkView extends View {
    interface Events{void changed();void text(float x,float y);}
    private final Events events;
    private final ArrayList<Mark> marks=new ArrayList<>();
    private final ArrayDeque<ArrayList<Mark>> history=new ArrayDeque<>();
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.DITHER_FLAG);
    private Bitmap bitmap;private Canvas cache;private Mark draft;private int pointer=-1;
    String tool="pen";int inkColor=Color.rgb(85,87,217);float inkWidth;boolean hideBrand=false,pencilOnly=false;
    private final float density;
    static class Mark{
        String type,text="";int color;float size;ArrayList<PointF> points=new ArrayList<>();
        JSONObject json()throws JSONException{JSONObject j=new JSONObject();j.put("type",type);j.put("color",color);j.put("size",size);j.put("text",text);JSONArray a=new JSONArray();for(PointF p:points){a.put(new JSONArray(new float[]{p.x,p.y}));}j.put("points",a);return j;}
        static Mark from(JSONObject j)throws JSONException{
            Mark m=new Mark();m.type=j.getString("type");if(!Arrays.asList("pen","highlighter","rect","circle","line","arrow","text").contains(m.type))throw new JSONException("Unknown mark");
            m.color=j.getInt("color");m.size=(float)j.getDouble("size");if(!Float.isFinite(m.size)||m.size<=0||m.size>600)throw new JSONException("Invalid size");
            m.text=j.optString("text","");if(m.text.length()>10000)throw new JSONException("Text too long");JSONArray a=j.getJSONArray("points");if(a.length()<1||a.length()>20000)throw new JSONException("Invalid points");
            for(int i=0;i<a.length();i++){JSONArray p=a.getJSONArray(i);float x=(float)p.getDouble(0),y=(float)p.getDouble(1);if(!Float.isFinite(x)||!Float.isFinite(y)||Math.abs(x)>3||Math.abs(y)>3)throw new JSONException("Invalid point");m.points.add(new PointF(x,y));}return m;
        }
    }
    public OverlayInkView(Context context,Events listener){super(context);events=listener;density=getResources().getDisplayMetrics().density;inkWidth=3*density;setBackgroundColor(Color.TRANSPARENT);setLayerType(View.LAYER_TYPE_HARDWARE,null);}
    private void remember(){history.push(new ArrayList<>(marks));while(history.size()>30)history.removeLast();}
    public void undo(){if(!history.isEmpty()){marks.clear();marks.addAll(history.pop());draft=null;rebuild();events.changed();}}
    public void clearInk(){if(marks.isEmpty())return;remember();marks.clear();draft=null;rebuild();events.changed();}
    public void cancelDraft(){draft=null;pointer=-1;invalidate();}
    public void addText(String text,float x,float y,float size){if(text.trim().isEmpty())return;remember();Mark m=new Mark();m.type="text";m.text=text.trim();m.color=inkColor;m.size=size;m.points.add(new PointF(x,y));marks.add(m);if(cache!=null)render(cache,m);invalidate();events.changed();}
    public JSONArray serialize(){JSONArray a=new JSONArray();for(Mark m:marks)try{a.put(m.json());}catch(JSONException ignored){}return a;}
    // Committed marks are immutable, so the service can serialize a shallow snapshot off the UI thread.
    public ArrayList<Mark> snapshot(){return new ArrayList<>(marks);}
    public void restore(JSONArray data){marks.clear();if(data==null)return;for(int i=0;i<Math.min(data.length(),3000);i++)try{marks.add(Mark.from(data.getJSONObject(i)));}catch(JSONException ignored){}rebuild();}
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh){if(bitmap!=null)bitmap.recycle();if(w>0&&h>0){bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);cache=new Canvas(bitmap);rebuild();}}
    private void rebuild(){if(cache!=null){cache.drawColor(Color.TRANSPARENT,PorterDuff.Mode.CLEAR);for(Mark m:marks)render(cache,m);}invalidate();}
    @Override protected void onDraw(Canvas c){super.onDraw(c);if(bitmap!=null)c.drawBitmap(bitmap,0,0,null);if(draft!=null)render(c,draft);if(!hideBrand){paint.reset();paint.setAntiAlias(true);paint.setColor(0x9968758c);paint.setTextSize(10*density);paint.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));c.drawText("VIKASHYA RESUVIKA · OMNIBALL",12*density,getHeight()-16*density,paint);}}
    private void render(Canvas c,Mark m){
        if(m.points.isEmpty())return;paint.reset();paint.setAntiAlias(true);paint.setColor(m.color);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(m.type.equals("highlighter")?m.size*4:m.size);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
        if(m.type.equals("highlighter"))paint.setAlpha(80);
        PointF first=m.points.get(0),last=m.points.get(m.points.size()-1);float x=first.x*getWidth(),y=first.y*getHeight(),ex=last.x*getWidth(),ey=last.y*getHeight();
        switch(m.type){
            case "rect":c.drawRoundRect(Math.min(x,ex),Math.min(y,ey),Math.max(x,ex),Math.max(y,ey),2*density,2*density,paint);break;
            case "circle":c.drawOval(Math.min(x,ex),Math.min(y,ey),Math.max(x,ex),Math.max(y,ey),paint);break;
            case "line":case "arrow":c.drawLine(x,y,ex,ey,paint);if(m.type.equals("arrow")){double angle=Math.atan2(ey-y,ex-x);float head=Math.max(12*density,m.size*3);c.drawLine(ex,ey,ex-head*(float)Math.cos(angle-.5),ey-head*(float)Math.sin(angle-.5),paint);c.drawLine(ex,ey,ex-head*(float)Math.cos(angle+.5),ey-head*(float)Math.sin(angle+.5),paint);}break;
            case "text":paint.setStyle(Paint.Style.FILL);paint.setTextSize(m.size);paint.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));for(String line:m.text.split("\n")){c.drawText(line,x,y+m.size,paint);y+=m.size*1.25f;}break;
            default:Path path=new Path();path.moveTo(x,y);for(int i=1;i<m.points.size();i++){PointF p=m.points.get(i);path.lineTo(p.x*getWidth(),p.y*getHeight());}if(m.points.size()==1)c.drawPoint(x,y,paint);else c.drawPath(path,paint);
        }
    }
    private PointF point(float x,float y){return new PointF(x/Math.max(1,getWidth()),y/Math.max(1,getHeight()));}
    @Override public boolean onTouchEvent(MotionEvent e){
        if(e.getActionMasked()==MotionEvent.ACTION_DOWN&&pencilOnly&&e.getToolType(0)!=MotionEvent.TOOL_TYPE_STYLUS&&e.getToolType(0)!=MotionEvent.TOOL_TYPE_ERASER)return true;
        if(e.getActionMasked()==MotionEvent.ACTION_DOWN){pointer=e.getPointerId(0);PointF p=point(e.getX(),e.getY());if(tool.equals("text")){events.text(p.x,p.y);pointer=-1;return true;}if(tool.equals("eraser")){remember();erase(e.getX(),e.getY());return true;}draft=new Mark();draft.type=tool.equals("laser")?"pen":tool;draft.color=tool.equals("laser")?Color.RED:inkColor;draft.size=inkWidth;draft.points.add(p);invalidate();return true;}
        int index=e.findPointerIndex(pointer);if(index<0)return true;
        if(e.getActionMasked()==MotionEvent.ACTION_MOVE){if(tool.equals("eraser")){erase(e.getX(index),e.getY(index));return true;}if(draft==null)return true;
            boolean stroke=tool.equals("pen")||tool.equals("highlighter")||tool.equals("laser");
            if(stroke){for(int h=0;h<e.getHistorySize()&&draft.points.size()<20000;h++)draft.points.add(point(e.getHistoricalX(index,h),e.getHistoricalY(index,h)));if(draft.points.size()<20000)draft.points.add(point(e.getX(index),e.getY(index)));}
            else{while(draft.points.size()>1)draft.points.remove(draft.points.size()-1);draft.points.add(point(e.getX(index),e.getY(index)));}postInvalidateOnAnimation();return true;
        }
        if(e.getActionMasked()==MotionEvent.ACTION_UP){if(draft!=null){if(!tool.equals("laser")){remember();if(marks.size()<3000){marks.add(draft);if(cache!=null)render(cache,draft);}}draft=null;events.changed();}pointer=-1;invalidate();return true;}
        if(e.getActionMasked()==MotionEvent.ACTION_CANCEL){cancelDraft();return true;}return true;
    }
    private void erase(float x,float y){
        float radius=Math.max(16*density,inkWidth*2);boolean changed=false;
        for(int i=marks.size()-1;i>=0;i--){Mark m=marks.get(i);boolean hit=false;
            if(m.type.equals("pen")||m.type.equals("highlighter")){for(int j=0;j<m.points.size();j++){PointF p=m.points.get(j),q=m.points.get(Math.max(0,j-1));float px=p.x*getWidth(),py=p.y*getHeight(),qx=q.x*getWidth(),qy=q.y*getHeight();float dx=px-qx,dy=py-qy;float t=(dx*dx+dy*dy)==0?0:Math.max(0,Math.min(1,((x-qx)*dx+(y-qy)*dy)/(dx*dx+dy*dy)));if(Math.hypot(x-(qx+t*dx),y-(qy+t*dy))<=radius){hit=true;break;}}}
            else{PointF p=m.points.get(0),q=m.points.get(m.points.size()-1);RectF r=new RectF(Math.min(p.x,q.x)*getWidth()-radius,Math.min(p.y,q.y)*getHeight()-radius,Math.max(p.x,q.x)*getWidth()+radius,Math.max(p.y,q.y)*getHeight()+radius);if(m.type.equals("text")){r.right=r.left+Math.min(getWidth(),m.text.length()*m.size*.6f);r.bottom=r.top+m.size*1.5f;}hit=r.contains(x,y);}
            if(hit){marks.remove(i);changed=true;break;}
        }
        if(changed){rebuild();events.changed();}
    }
}
