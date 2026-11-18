package com.vikashya.resuvika.omniball.mobile;

import android.content.Context;
import android.net.wifi.WifiManager;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;

/** Lightweight same-Wi-Fi HTTP server so any Smart TV or Laptop browser can mirror the board at http://<phone-ip>:8765 */
public class LocalTvServer {
    public static final int PORT = 8765;
    private static ServerSocket serverSocket;
    private static volatile boolean running = false;
    private static volatile String latestBoardJson = "{\"elements\":[],\"background\":\"whiteboard\"}";

    public static void updateBoard(String json) {
        if (json != null && !json.isEmpty()) latestBoardJson = json;
    }

    public static synchronized void start() {
        if (running) return;
        running = true;
        Thread t = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(PORT);
                while (running) {
                    Socket client = serverSocket.accept();
                    handleClient(client);
                }
            } catch (Exception ignored) {
                running = false;
            }
        }, "LocalTvServer");
        t.setDaemon(true);
        t.start();
    }

    private static void handleClient(Socket client) {
        new Thread(() -> {
            try (Socket s = client;
                 BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                 OutputStream out = s.getOutputStream()) {
                String line = in.readLine();
                if (line == null) return;
                String path = "/";
                String[] parts = line.split(" ");
                if (parts.length >= 2) path = parts[1];

                String body;
                String contentType;
                if (path.startsWith("/state")) {
                    body = latestBoardJson;
                    contentType = "application/json; charset=utf-8";
                } else {
                    body = RECEIVER_HTML;
                    contentType = "text/html; charset=utf-8";
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                String headers = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + contentType + "\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
                out.write(headers.getBytes(StandardCharsets.US_ASCII));
                out.write(bytes);
                out.flush();
            } catch (Exception ignored) {}
        }).start();
    }

    public static String getLocalIpAddress(Context context) {
        try {
            WifiManager wm = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int ip = wm.getConnectionInfo().getIpAddress();
                if (ip != 0) {
                    return String.format("%d.%d.%d.%d", (ip & 0xff), (ip >> 8 & 0xff), (ip >> 16 & 0xff), (ip >> 24 & 0xff));
                }
            }
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (ni.isLoopback() || !ni.isUp()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    private static final String RECEIVER_HTML = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
        + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<title>Resuvika Omniball — Live TV & Laptop Display</title>"
        + "<style>*{margin:0;padding:0;box-sizing:border-box}body{overflow:hidden;background:#fff;font-family:system-ui,sans-serif}"
        + "canvas{position:fixed;inset:0;width:100vw;height:100vh}"
        + "#badge{position:fixed;bottom:14px;left:14px;background:rgba(15,23,42,.82);color:#fff;padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600}"
        + "</style></head><body><canvas id='c'></canvas><div id='badge'>📺 Resuvika Omniball · Connected on Same Wi-Fi</div>"
        + "<script>const c=document.getElementById('c'),ctx=c.getContext('2d');let last='';"
        + "function resize(){c.width=innerWidth;c.height=innerHeight;}"
        + "addEventListener('resize',resize);resize();"
        + "function draw(data){"
        + "const bg=data.background==='blackboard'?'#0f172a':data.background==='chalkboard'?'#143b2f':'#fff';"
        + "ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);"
        + "const els=data.elements||[];if(!els.length)return;"
        + "const sx=c.width/(data.width||c.width),sy=c.height/(data.height||c.height),s=Math.min(sx,sy);"
        + "ctx.save();ctx.scale(s,s);"
        + "for(const el of els){if(el.type==='stroke'&&el.points&&el.points.length){"
        + "ctx.strokeStyle=el.color||'#ef4444';ctx.lineWidth=el.size||4;ctx.lineCap='round';ctx.lineJoin='round';"
        + "ctx.beginPath();ctx.moveTo(el.points[0].x,el.points[0].y);"
        + "for(let i=1;i<el.points.length;i++)ctx.lineTo(el.points[i].x,el.points[i].y);ctx.stroke();"
        + "}else if(el.type==='text'&&el.text){ctx.fillStyle=el.color||'#0f172a';ctx.font=(el.fontSize||24)+'px sans-serif';ctx.fillText(el.text,el.x,el.y);}}"
        + "ctx.restore();}"
        + "setInterval(async()=>{try{const r=await fetch('/state');const t=await r.text();if(t!==last){last=t;draw(JSON.parse(t));}}catch(e){}},250);"
        + "</script></body></html>";
}
