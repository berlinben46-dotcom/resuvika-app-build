package com.vikashya.resuvika.omniball.mobile;

import android.annotation.SuppressLint;
import android.bluetooth.*;
import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Direct Bluetooth RFCOMM (SPP) bridge between Android and paired Windows/Mac Laptops. */
public class BluetoothSyncManager {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static BluetoothSocket activeSocket;
    private static BluetoothServerSocket serverSocket;
    private static OutputStream activeOut;
    private static volatile boolean listening = false;
    private static volatile String connectedName = "";

    public static boolean isConnected() {
        return activeSocket != null && activeSocket.isConnected() && activeOut != null;
    }

    public static String getConnectedName() {
        return isConnected() ? connectedName : "";
    }

    @SuppressLint("MissingPermission")
    public static List<Map<String, String>> getPairedDevices(Context ctx) {
        List<Map<String, String>> list = new ArrayList<>();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) return list;
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice d : bonded) {
                Map<String, String> item = new HashMap<>();
                item.put("name", d.getName() != null ? d.getName() : "Bluetooth Device");
                item.put("address", d.getAddress());
                list.add(item);
            }
        }
        return list;
    }

    @SuppressLint("MissingPermission")
    public static synchronized void startServer() {
        if (listening) return;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) return;
        listening = true;
        Thread t = new Thread(() -> {
            try {
                serverSocket = adapter.listenUsingRfcommWithServiceRecord("ResuvikaOmniball", SPP_UUID);
                while (listening) {
                    BluetoothSocket s = serverSocket.accept();
                    if (s != null) {
                        setSocket(s, s.getRemoteDevice() != null ? s.getRemoteDevice().getName() : "Laptop");
                    }
                }
            } catch (Exception ignored) {
                listening = false;
            }
        }, "ResuvikaBTServer");
        t.setDaemon(true);
        t.start();
    }

    @SuppressLint("MissingPermission")
    public static void connect(String address) throws IOException {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) throw new IOException("Bluetooth is not available on this device.");
        if (!adapter.isEnabled()) throw new IOException("Turn on Bluetooth first.");
        BluetoothDevice device = adapter.getRemoteDevice(address);
        BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
        adapter.cancelDiscovery();
        socket.connect();
        setSocket(socket, device.getName() != null ? device.getName() : address);
    }

    private static synchronized void setSocket(BluetoothSocket s, String name) throws IOException {
        disconnect();
        activeSocket = s;
        activeOut = s.getOutputStream();
        connectedName = name != null ? name : "Laptop";
    }

    public static synchronized void disconnect() {
        try { if (activeOut != null) activeOut.close(); } catch (Exception ignored) {}
        try { if (activeSocket != null) activeSocket.close(); } catch (Exception ignored) {}
        activeOut = null;
        activeSocket = null;
        connectedName = "";
    }

    public static void sendBoard(String json) {
        if (!isConnected() || json == null) return;
        new Thread(() -> {
            try {
                byte[] line = (json + "\n").getBytes(StandardCharsets.UTF_8);
                synchronized (BluetoothSyncManager.class) {
                    if (activeOut != null) {
                        activeOut.write(line);
                        activeOut.flush();
                    }
                }
            } catch (Exception e) {
                disconnect();
            }
        }).start();
    }
}
