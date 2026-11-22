package com.gaia.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 极小的本地静态服务器：把 assets/web 下的 web 产物以 http://127.0.0.1:&lt;port&gt; 暴露出来。
 * 用 http 而不是 file:// 的原因：Chromium WebView 在 file:// origin 下不保证 IndexedDB 可用，
 * 而对话与附件都存在 IndexedDB 里。
 *
 * 它只做两件事：发静态文件、发运行期配置。业务逻辑一律在 web 源码里。
 */
public final class LocalServer {

    /**
     * 固定端口：浏览器存储（localStorage / IndexedDB）按 origin 隔离，
     * 端口一变 origin 就变，历史对话会"看不见"。
     *
     * 这一版固定用 47831。旧版 dialog-shell 的数据在 47821 那个 origin 下，
     * 换包名覆盖安装后不会自动继承（两边的 WebView 存储本来就分开）；旧数据留在手机上不动。
     */
    private static final int PREFERRED_PORT = 47831;
    private static final int PORT_TRIES = 12;

    private final AssetManager assets;
    private final SharedPreferences prefs;
    private final Map<String, String> mime = new HashMap<String, String>();

    private ServerSocket serverSocket;
    private ExecutorService pool;
    private int port = 0;
    private volatile boolean running = false;
    /** 由 MainActivity 在启动时写入，供配置下发使用 */
    public static volatile String appVersion = "1.0.0";

    public LocalServer(Context context) {
        this.assets = context.getApplicationContext().getAssets();
        this.prefs = context.getApplicationContext().getSharedPreferences("gaia", Context.MODE_PRIVATE);

        mime.put("html", "text/html; charset=utf-8");
        mime.put("js", "application/javascript; charset=utf-8");
        mime.put("mjs", "application/javascript; charset=utf-8");
        mime.put("css", "text/css; charset=utf-8");
        mime.put("json", "application/json; charset=utf-8");
        mime.put("map", "application/json; charset=utf-8");
        mime.put("svg", "image/svg+xml");
        mime.put("png", "image/png");
        mime.put("jpg", "image/jpeg");
        mime.put("jpeg", "image/jpeg");
        mime.put("gif", "image/gif");
        mime.put("webp", "image/webp");
        mime.put("ico", "image/x-icon");
        mime.put("ttf", "font/ttf");
        mime.put("otf", "font/otf");
        mime.put("woff", "font/woff");
        mime.put("woff2", "font/woff2");
        mime.put("wasm", "application/wasm");
        mime.put("txt", "text/plain; charset=utf-8");
        mime.put("pdf", "application/pdf");
    }

    public synchronized int start() throws IOException {
        if (running) {
            return port;
        }
        IOException lastError = null;
        for (int candidate = PREFERRED_PORT; candidate < PREFERRED_PORT + PORT_TRIES; candidate++) {
            try {
                serverSocket = new ServerSocket(candidate, 32, InetAddress.getByName("127.0.0.1"));
                break;
            } catch (IOException e) {
                lastError = e;
                serverSocket = null;
            }
        }
        if (serverSocket == null) {
            try {
                serverSocket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
            } catch (IOException e) {
                throw lastError != null ? lastError : e;
            }
        }
        port = serverSocket.getLocalPort();
        running = true;
        pool = Executors.newFixedThreadPool(4);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                loop();
            }
        }, "gaia-http");
        t.setDaemon(true);
        t.start();
        return port;
    }

    public int getPort() {
        return port;
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null) {
                serverSocket.close();
            }
        } catch (IOException ignored) {
        }
        if (pool != null) {
            pool.shutdownNow();
        }
    }

    private void loop() {
        while (running) {
            Socket socket = null;
            try {
                socket = serverSocket.accept();
            } catch (IOException e) {
                if (!running) {
                    return;
                }
                continue;
            }
            final Socket s = socket;
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    handle(s);
                }
            });
        }
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(20000);
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) {
                return;
            }
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                // drain headers
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                return;
            }
            String method = parts[0].toUpperCase(Locale.US);
            String path = parts[1];
            int q = path.indexOf('?');
            if (q >= 0) {
                path = path.substring(0, q);
            }
            int h = path.indexOf('#');
            if (h >= 0) {
                path = path.substring(0, h);
            }
            path = URLDecoder.decode(path, "UTF-8");
            OutputStream out = socket.getOutputStream();

            if (path.contains("..")) {
                respondText(out, method, 400, "text/plain; charset=utf-8", "bad request");
                return;
            }

            if ("/__gaia/config.js".equals(path)) {
                respondText(out, method, 200,
                        "application/javascript; charset=utf-8", configJs());
                return;
            }

            if ("/".equals(path) || path.isEmpty()) {
                serveFile(out, method, "web/index.html", "text/html; charset=utf-8");
                return;
            }

            String ext = extOf(path);
            String type = mime.get(ext);
            if (type == null) {
                type = "application/octet-stream";
            }
            if (exists("web" + path)) {
                serveFile(out, method, "web" + path, type);
                return;
            }
            // SPA 回退：不带扩展名的路径一律交给 index.html
            if (ext.isEmpty() || "html".equals(ext)) {
                serveFile(out, method, "web/index.html", "text/html; charset=utf-8");
                return;
            }
            respondText(out, method, 404, "text/plain; charset=utf-8", "not found");
        } catch (Exception ignored) {
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private boolean exists(String assetPath) {
        try {
            InputStream in = assets.open(assetPath);
            in.close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private void serveFile(OutputStream out, String method, String assetPath, String type)
            throws IOException {
        InputStream in = assets.open(assetPath);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[16384];
        int read;
        while ((read = in.read(chunk)) > 0) {
            buffer.write(chunk, 0, read);
        }
        in.close();
        byte[] body = buffer.toByteArray();
        writeHead(out, 200, type, body.length);
        if (!"HEAD".equals(method)) {
            out.write(body);
        }
        out.flush();
    }

    private void respondText(OutputStream out, String method, int status, String type, String text)
            throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        writeHead(out, status, type, body.length);
        if (!"HEAD".equals(method)) {
            out.write(body);
        }
        out.flush();
    }

    private void writeHead(OutputStream out, int status, String type, int length)
            throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(status).append(' ').append(status == 200 ? "OK" : "Error").append("\r\n");
        sb.append("Content-Type: ").append(type).append("\r\n");
        sb.append("Content-Length: ").append(length).append("\r\n");
        sb.append("Cache-Control: no-store\r\n");
        sb.append("Access-Control-Allow-Origin: *\r\n");
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.US_ASCII));
    }

    private String extOf(String path) {
        int slash = path.lastIndexOf('/');
        int dot = path.lastIndexOf('.');
        if (dot <= slash || dot < 0) {
            return "";
        }
        return path.substring(dot + 1).toLowerCase(Locale.US);
    }

    /** 运行期配置：形状与 web/src/features/host/contract.ts 的 HostConfig 一一对应 */
    private String configJs() {
        String apiBase = prefs.getString("apiBase", "");
        String apiKey = prefs.getString("apiKey", "");
        String userName = prefs.getString("userName", "");
        StringBuilder sb = new StringBuilder();
        sb.append("window.__GAIA_CONFIG__={");
        sb.append("apiBase:").append(apiBase.trim().isEmpty() ? "null" : quote(apiBase.trim())).append(',');
        sb.append("apiKey:").append(apiKey.isEmpty() ? "null" : quote(apiKey)).append(',');
        // 角色库在 web 侧（IndexedDB），原生不再持有；这里保持空数组占位契约
        sb.append("roles:[],");
        sb.append("activeRole:\"\",");
        sb.append("user:{name:").append(quote(userName)).append(",avatar:null},");
        sb.append("flags:{},");
        int triggerTurns = prefs.getInt("memoryTriggerTurns", 0);
        if (triggerTurns > 0) {
            sb.append("memoryTriggerTurns:").append(triggerTurns).append(',');
        }
        int keepTurns = prefs.getInt("memoryKeepTurns", 0);
        if (keepTurns > 0) {
            sb.append("memoryKeepTurns:").append(keepTurns).append(',');
        }
        sb.append("appVersion:").append(quote(appVersion)).append("};");
        return sb.toString();
    }

    /** JS 字符串字面量转义，供其他原生代码复用 */
    public static String quoteJs(String raw) {
        return quote(raw);
    }

    private static String quote(String raw) {
        if (raw == null) {
            return "\"\"";
        }
        return "\"" + raw.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "") + "\"";
    }
}
