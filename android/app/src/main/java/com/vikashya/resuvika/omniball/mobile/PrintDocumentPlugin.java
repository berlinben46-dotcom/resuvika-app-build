package com.vikashya.resuvika.omniball.mobile;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens Android's print / Save as PDF sheet without navigating the app's WebView. */
@CapacitorPlugin(name="PrintDocument")
public class PrintDocumentPlugin extends Plugin {
    private WebView printView;
    @PluginMethod public void print(PluginCall call){
        String html=call.getString("html","");String title=call.getString("title","Omniball Note");
        if(html.length()>2000000){call.reject("This note is too large to print.");return;}
        getActivity().runOnUiThread(()->{
            if(printView!=null)printView.destroy();printView=new WebView(getContext());
            printView.getSettings().setJavaScriptEnabled(false);printView.getSettings().setAllowFileAccess(false);printView.getSettings().setAllowContentAccess(false);printView.getSettings().setBlockNetworkLoads(true);
            printView.setWebViewClient(new WebViewClient(){private boolean opened=false;@Override public void onPageFinished(WebView view,String url){if(opened)return;opened=true;try{PrintManager manager=(PrintManager)getActivity().getSystemService(Context.PRINT_SERVICE);if(manager==null)throw new Exception();manager.print(title,view.createPrintDocumentAdapter(title),new PrintAttributes.Builder().build());call.resolve();}catch(Exception error){call.reject("Android print service is unavailable.");}}});
            printView.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);
        });
    }
    @Override protected void handleOnDestroy(){if(printView!=null)getActivity().runOnUiThread(()->{printView.destroy();printView=null;});}
}
