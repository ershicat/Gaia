package com.gaia.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 唯一的原生页面。
 *
 * 职责只有四件：起本地服务、装 WebView、把能力桥接给 web、处理 web 做不到的事
 * （选图/拍照/文件/分享/录音权限）。界面一律在 web 源码里，原生不画任何 UI。
 */
public class MainActivity extends Activity {

    private static final String TAG = "Gaia";
    private static final int REQ_FILE = 1001;
    private static final int REQ_CAMERA = 1002;
    private static final int REQ_MIC = 1003;
    private static final int REQ_ATTACH = 2001;
    private static final int REQ_CAPTURE = 2002;

    private WebView web;
    private LocalServer server;
    private ValueCallback<Uri[]> fileCallback;
    /** 拍照（input[type=file][capture]）时的写入目标 */
    private Uri captureTarget;
    private PermissionRequest pendingAudio;
    private int attachKind = 0; // 0 相册 / 1 拍照 / 2 文件

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LocalServer.appVersion = versionName();
        applyIntentConfig(getIntent());
        server = new LocalServer(this);
        int port;
        try {
            port = server.start();
        } catch (Exception e) {
            Log.e(TAG, "local server failed", e);
            return;
        }
        web = buildWebView();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        web.loadUrl("http://127.0.0.1:" + port + "/");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        applyIntentConfig(intent);
        if (web != null) {
            web.reload();
        }
    }

    /**
     * 运维/自动化通道：启动时可以用 intent extra 写入配置，免去在手机上逐字输入。
     *   adb shell am start -n com.gaia.app/.MainActivity --es apiKey sk-xxx
     * 只写非空值，其余配置不受影响。
     */
    private void applyIntentConfig(Intent intent) {
        if (intent == null) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences("gaia", MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        boolean dirty = false;
        String apiKey = intent.getStringExtra("apiKey");
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            editor.putString("apiKey", apiKey.trim());
            dirty = true;
        }
        String apiBase = intent.getStringExtra("apiBase");
        if (apiBase != null && !apiBase.trim().isEmpty()) {
            editor.putString("apiBase", apiBase.trim());
            dirty = true;
        }
        String userName = intent.getStringExtra("userName");
        if (userName != null && !userName.isEmpty()) {
            editor.putString("userName", userName);
            dirty = true;
        }
        int triggerTurns = intent.getIntExtra("memoryTriggerTurns", 0);
        if (triggerTurns == -1) {
            editor.remove("memoryTriggerTurns");
            dirty = true;
        } else if (triggerTurns > 0) {
            editor.putInt("memoryTriggerTurns", triggerTurns);
            dirty = true;
        }
        int keepTurns = intent.getIntExtra("memoryKeepTurns", 0);
        if (keepTurns == -1) {
            editor.remove("memoryKeepTurns");
            dirty = true;
        } else if (keepTurns > 0) {
            editor.putInt("memoryKeepTurns", keepTurns);
            dirty = true;
        }
        if (dirty) {
            editor.apply();
        }
    }

    private WebView buildWebView() {
        WebView view = new WebView(this);
        // beta 包打开 WebView 调试（chrome://inspect / adb forward），便于排查「点了没反应」这类只有真机才复现的问题
        if (versionName().contains("beta")) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        // 必须允许 content://：页面里的 <input type=file> 选完文件后，WebView 需要靠 content 访问权限
        // 才能把选择器返回的 Uri 变成 File；关掉会让 change 事件拿到空 FileList（表现为「选完没反应」）
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " Gaia/" + versionName());
        view.setBackgroundColor(Color.WHITE);
        view.setWebViewClient(new WebViewClient());
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                // 页面里 console.error / 未捕获的 Promise 拒绝都进 logcat，便于线上排查「点了没反应」
                Log.i(TAG, "console " + message.messageLevel() + ": " + message.message()
                        + " @" + message.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // 录音需要运行时权限：先申请，拿到后再授予 web 权限
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (Build.VERSION.SDK_INT >= 23
                                && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                != PackageManager.PERMISSION_GRANTED) {
                            pendingAudio = request;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                        } else {
                            request.grant(request.getResources());
                        }
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(final WebView view, final ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                String[] accept = params.getAcceptTypes();
                Log.i(TAG, "chooser open accept=" + java.util.Arrays.toString(accept)
                        + " capture=" + params.isCaptureEnabled());
                boolean imageOnly = accept != null && accept.length > 0 && accept[0].startsWith("image/");
                // 加号里的「拍照」用 <input type=file accept=image/* capture>，这里接管成系统相机
                if (params.isCaptureEnabled() && startCameraCapture()) {
                    return true;
                }
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(imageOnly ? "image/*" : "*/*");
                try {
                    startActivityForResult(intent, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        view.addJavascriptInterface(new Bridge(), "__GAIA_BRIDGE__");
        return view;
    }

    /**
     * 拍照：先用 MediaStore 建一条可写的图片记录作为 EXTRA_OUTPUT，
     * 拿不到可写目标时返回 false，由调用方退回系统相册选择，保证点了有反应。
     */
    private boolean startCameraCapture() {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        Uri target = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME,
                        "gaia-" + System.currentTimeMillis() + ".jpg");
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        android.os.Environment.DIRECTORY_DCIM + "/Gaia");
                target = getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            }
        } catch (Exception e) {
            Log.w(TAG, "prepare capture target failed", e);
            target = null;
        }
        if (target == null) {
            return false;
        }
        captureTarget = target;
        intent.putExtra(MediaStore.EXTRA_OUTPUT, target);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_CAPTURE);
        } catch (Exception e) {
            Log.w(TAG, "camera unavailable", e);
            captureTarget = null;
            return false;
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_MIC) {
            PermissionRequest request = pendingAudio;
            pendingAudio = null;
            if (request != null) {
                if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            }
        }
        super.onRequestPermissionsResult(requestCode, permissions, results);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            Log.i(TAG, "chooser result code=" + resultCode + " uri="
                    + (data != null && data.getData() != null ? data.getData().toString() : "null")
                    + " callback=" + (callback != null));
            if (callback != null) {
                callback.onReceiveValue(
                        resultCode == RESULT_OK && data != null && data.getData() != null
                                ? new Uri[]{data.getData()}
                                : null);
            }
        } else if (requestCode == REQ_CAPTURE) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            Uri target = captureTarget;
            captureTarget = null;
            if (callback != null) {
                callback.onReceiveValue(
                        resultCode == RESULT_OK && target != null ? new Uri[]{target} : null);
            }
            if (resultCode != RESULT_OK && target != null) {
                try {
                    getContentResolver().delete(target, null, null);
                } catch (Exception ignored) {
                }
            }
        } else if (requestCode == REQ_CAMERA) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                pushAttach(data.getData(), "camera");
            }
        } else if (requestCode == REQ_ATTACH) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                pushAttach(data.getData(), attachKind == 1 ? "camera" : (attachKind == 2 ? "file" : "gallery"));
            }
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 把选中的文件作为 base64 推进页面，由 attach 积木接管（页面没有该入口时静默丢弃） */
    private void pushAttach(Uri uri, String kind) {
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) {
                return;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int read;
            while ((read = in.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
            in.close();
            String mime = getContentResolver().getType(uri);
            String data = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
            String script = "(function(){try{if(window.__gaiaAttachFile){window.__gaiaAttachFile({"
                    + "kind:" + LocalServer.quoteJs(kind) + ","
                    + "mime:" + LocalServer.quoteJs(mime == null ? "application/octet-stream" : mime) + ","
                    + "data:\"" + data + "\"});}}catch(e){}})()";
            web.evaluateJavascript(script, null);
        } catch (Exception e) {
            Log.w(TAG, "push attach failed", e);
        }
    }

    @Override
    public void onBackPressed() {
        // 交给页面自己决定（例如先关抽屉/面板），页面没有处理就退到后台，不销毁实例
        web.evaluateJavascript("(function(){try{return !!(window.__gaiaBack&&window.__gaiaBack());}catch(e){return false;}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) {
                            moveTaskToBack(true);
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.stop();
        }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    /** 按扩展名决定 MIME：MediaStore 会据此决定文件名后缀，写错会变成 xxx.txt.zip */
    private static String mimeOf(String name) {
        String lower = name == null ? "" : name.toLowerCase(java.util.Locale.US);
        if (lower.endsWith(".txt") || lower.endsWith(".log")) {
            return "text/plain";
        }
        if (lower.endsWith(".json")) {
            return "application/json";
        }
        return "application/zip";
    }

    /** 写入系统「下载」目录；Android 10+ 走 MediaStore，无需权限。返回落盘后的 Uri */
    private Uri writeToDownloads(String name, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeOf(name));
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                    android.os.Environment.DIRECTORY_DOWNLOADS + "/Gaia");
            Uri target = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                throw new java.io.IOException("无法创建下载条目");
            }
            java.io.OutputStream out = getContentResolver().openOutputStream(target);
            if (out == null) {
                throw new java.io.IOException("无法写入下载目录");
            }
            try {
                out.write(data);
                out.flush();
            } finally {
                out.close();
            }
            return target;
        }
        java.io.File dir = new java.io.File(
                android.os.Environment.getExternalStoragePublicDirectory(
                        android.os.Environment.DIRECTORY_DOWNLOADS), "Gaia");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new java.io.IOException("无法创建目录");
        }
        java.io.File file = new java.io.File(dir, name);
        java.io.FileOutputStream out = new java.io.FileOutputStream(file);
        try {
            out.write(data);
            out.flush();
        } finally {
            out.close();
        }
        return Uri.fromFile(file);
    }

    /** web → 原生的能力桥；每个方法都可选，页面缺失时静默降级 */
    private class Bridge {

        @JavascriptInterface
        public void log(String message) {
            Log.i(TAG, "JS " + message);
        }

        @JavascriptInterface
        public String appVersion() {
            return versionName();
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, "分享"));
                }
            });
        }

        /**
         * 把页面里的字节落盘：写进「下载/Gaia」目录，随后可在文件管理器里找到。
         * 页面侧负责把 Blob 转成 base64（导出历史 ZIP 走这条路）。
         */
        @JavascriptInterface
        public void saveFile(final String name, final String base64) {
            final String safeName = (name == null || name.trim().isEmpty()) ? "gaia-export.zip" : name.trim();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] data = Base64.decode(base64, Base64.DEFAULT);
                        writeToDownloads(safeName, data);
                        Toast.makeText(MainActivity.this, "已保存到 下载/Gaia/" + safeName, Toast.LENGTH_LONG).show();
                    } catch (Exception e) {
                        Log.w(TAG, "saveFile failed", e);
                        Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        /**
         * 落盘后立刻拉起系统转发面板：文件已经在「下载/Gaia」里，
         * 用户选 QQ 就能直接把诊断日志发出去。
         */
        @JavascriptInterface
        public void shareFile(final String name, final String base64) {
            final String safeName = (name == null || name.trim().isEmpty()) ? "gaia-diag.txt" : name.trim();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] data = Base64.decode(base64, Base64.DEFAULT);
                        Uri target = writeToDownloads(safeName, data);
                        Toast.makeText(MainActivity.this, "已保存到 下载/Gaia/" + safeName, Toast.LENGTH_SHORT).show();
                        if (Build.VERSION.SDK_INT < 29) {
                            Toast.makeText(MainActivity.this, "请在文件管理器里转发该文件", Toast.LENGTH_LONG).show();
                            return;
                        }
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(mimeOf(safeName));
                        send.putExtra(Intent.EXTRA_STREAM, target);
                        send.putExtra(Intent.EXTRA_TITLE, safeName);
                        send.setClipData(android.content.ClipData.newUri(
                                getContentResolver(), safeName, target));
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "发送诊断日志"));
                    } catch (Exception e) {
                        Log.w(TAG, "shareFile failed", e);
                        Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void pickAttach(final String kind) {            attachKind = "camera".equals(kind) ? 1 : ("file".equals(kind) ? 2 : 0);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (attachKind == 1) {
                        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        try {
                            startActivityForResult(camera, REQ_CAMERA);
                        } catch (Exception ignored) {
                        }
                        return;
                    }
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(attachKind == 2 ? "*/*" : "image/*");
                    try {
                        startActivityForResult(intent, REQ_ATTACH);
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }
}
