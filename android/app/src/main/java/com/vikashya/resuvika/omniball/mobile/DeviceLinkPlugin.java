package com.vikashya.resuvika.omniball.mobile;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground, explicitly started, paired-device RFCOMM link. No discovery or location access. */
@CapacitorPlugin(name="DeviceLink", permissions={@Permission(alias="connect",strings={Manifest.permission.BLUETOOTH_CONNECT})})
public class DeviceLinkPlugin extends Plugin {
    private static final UUID SERVICE=UUID.fromString("7b219e32-4f70-4d40-94b1-06ef572a4011");
    private final ExecutorService io=Executors.newCachedThreadPool();
    private final ExecutorService writer=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private volatile BluetoothSocket socket;
    private volatile BluetoothServerSocket server;
    private volatile String name="";
    private volatile long generation=0;
    private BluetoothAdapter adapter(){BluetoothManager manager=getContext().getSystemService(BluetoothManager.class);return manager==null?null:manager.getAdapter();}
    private boolean allowed(){return Build.VERSION.SDK_INT<31||getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;}
    private boolean ready(PluginCall call){if(!allowed()){call.reject("Allow Nearby devices to connect. No location permission is needed.");return false;}if(adapter()==null){call.reject("Bluetooth hardware is unavailable on this device or emulator.");return false;}if(!adapter().isEnabled()){call.reject("Turn on Bluetooth in Android settings, then try again.");return false;}return true;}
    @PluginMethod public void status(PluginCall call){JSObject data=new JSObject();BluetoothAdapter a=adapter();data.put("available",a!=null);data.put("permission",allowed());data.put("enabled",a!=null&&allowed()&&a.isEnabled());data.put("connected",socket!=null&&socket.isConnected());data.put("listening",server!=null);data.put("name",name);call.resolve(data);}
    @PluginMethod public void authorize(PluginCall call){if(allowed()){call.resolve();return;}requestPermissionForAlias("connect",call,"permissionResult");}
    @PermissionCallback private void permissionResult(PluginCall call){if(allowed())call.resolve();else call.reject("Nearby devices permission was declined. You can still use Wi-Fi pairing and system sharing.");}
    @PluginMethod public void settings(PluginCall call){getActivity().startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));call.resolve();}
    @PluginMethod public void paired(PluginCall call){if(!ready(call))return;try{JSArray devices=new JSArray();for(BluetoothDevice device:adapter().getBondedDevices()){JSObject item=new JSObject();item.put("address",device.getAddress());item.put("name",device.getName()==null?"Paired device":device.getName());devices.put(item);}JSObject data=new JSObject();data.put("devices",devices);call.resolve(data);}catch(SecurityException error){call.reject("Nearby devices permission changed. Allow it again to continue.");}}
    private synchronized void closeLink(){generation++;try{if(server!=null)server.close();}catch(Exception ignored){}server=null;try{if(socket!=null)socket.close();}catch(Exception ignored){}socket=null;name="";}
    private void state(String state,String detail){JSObject data=new JSObject();data.put("state",state);data.put("name",name);data.put("detail",detail);notifyListeners("state",data);}
    @PluginMethod public void disconnect(PluginCall call){closeLink();state("disconnected","Disconnected");call.resolve();}
    @PluginMethod public void connect(PluginCall call){
        if(!ready(call))return;String address=call.getString("address","");if(!BluetoothAdapter.checkBluetoothAddress(address)){call.reject("Choose a paired device.");return;}
        closeLink();final long session=generation;state("connecting","Connecting…");
        io.execute(()->{BluetoothSocket candidate=null;Runnable timeout=null;
            try{
                BluetoothDevice device=adapter().getRemoteDevice(address);if(device.getBondState()!=BluetoothDevice.BOND_BONDED)throw new Exception("Pair the devices in Android settings first.");
                candidate=device.createRfcommSocketToServiceRecord(SERVICE);
                synchronized(this){if(generation!=session){candidate.close();call.reject("Connection cancelled.");return;}socket=candidate;}
                final BluetoothSocket pending=candidate;timeout=()->{if(!pending.isConnected())try{pending.close();}catch(Exception ignored){}};handler.postDelayed(timeout,15000);
                candidate.connect();handler.removeCallbacks(timeout);
                if(generation!=session){candidate.close();call.reject("Connection cancelled.");return;}
                name=device.getName()==null?"Paired device":device.getName();state("connected","Connected to "+name);call.resolve();read(candidate,session);
            }catch(SecurityException error){if(timeout!=null)handler.removeCallbacks(timeout);if(generation==session){closeLink();state("disconnected","Nearby devices permission changed.");}call.reject("Allow Nearby devices again to connect.");}
            catch(Exception error){if(timeout!=null)handler.removeCallbacks(timeout);if(generation==session){closeLink();state("disconnected","Connection failed. Start the Omniball companion on the other device and retry.");}call.reject("Could not connect. Check pairing and start the Omniball companion on the other device.");}
        });
    }
    @PluginMethod public void listen(PluginCall call){
        if(!ready(call))return;closeLink();final long session=generation;
        try{server=adapter().listenUsingRfcommWithServiceRecord("Resuvika Omniball",SERVICE);final BluetoothServerSocket waiting=server;state("listening","Waiting for a paired device…");call.resolve();
            io.execute(()->{try{BluetoothSocket incoming=waiting.accept();synchronized(this){if(generation!=session){incoming.close();return;}socket=incoming;waiting.close();server=null;name=incoming.getRemoteDevice().getName();}state("connected","Connected to "+name);read(incoming,session);}catch(SecurityException error){if(generation==session){closeLink();state("disconnected","Nearby devices permission changed.");}}catch(Exception error){if(generation==session){closeLink();state("disconnected","Bluetooth session ended.");}}});
        }catch(SecurityException error){closeLink();call.reject("Allow Nearby devices again to receive.");}catch(Exception error){closeLink();call.reject("Could not listen for Bluetooth connections.");}
    }
    private void read(BluetoothSocket link,long session){
        try{LinkFrameReader frames=new LinkFrameReader(link.getInputStream());String frame;
            while(generation==session&&(frame=frames.next())!=null){JSObject event=new JSObject();event.put("message",new JSObject(frame));notifyListeners("message",event);}
        }catch(Exception ignored){}finally{if(generation==session){closeLink();state("disconnected","Connection ended. Reconnect to continue.");}}
    }
    @PluginMethod public void send(PluginCall call){
        JSObject message=call.getObject("message");if(message==null){call.reject("Message required.");return;}byte[] bytes=(message.toString()+"\n").getBytes(StandardCharsets.UTF_8);if(bytes.length>65536){call.reject("Message is too large. Use chunked file transfer.");return;}
        final BluetoothSocket link=socket;final long session=generation;
        writer.execute(()->{try{if(link==null||generation!=session||!link.isConnected())throw new Exception();link.getOutputStream().write(bytes);link.getOutputStream().flush();call.resolve();}catch(Exception error){if(generation==session){closeLink();state("disconnected","Transfer interrupted. Reconnect and retry.");}call.reject("Bluetooth connection ended.");}});
    }
    @Override protected void handleOnStop(){closeLink();state("disconnected","Bluetooth paused when the app left the foreground. Reconnect to continue.");}
    @Override protected void handleOnDestroy(){closeLink();io.shutdownNow();writer.shutdownNow();handler.removeCallbacksAndMessages(null);}
}
