package com.liulianbot.app;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** One client per server/session. Cookies stay in memory and never enter browser URLs. */
final class ApiClient {
    final String server;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    ApiClient(String server) { this.server = ServerAddress.normalize(server); }
    void clearSession() { cookies.getCookieStore().removeAll(); }

    JSONObject request(String method, String path, JSONObject body) throws Exception {
        URI uri = URI.create(server + "/api/" + path);
        HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        for (Map.Entry<String, List<String>> header : cookies.get(uri, java.util.Collections.emptyMap()).entrySet()) {
            connection.setRequestProperty(header.getKey(), String.join("; ", header.getValue()));
        }
        try {
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (var output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            cookies.put(uri, connection.getHeaderFields());
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String content = "";
            if (stream != null) {
                try (stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (output.size() + count > 2 * 1024 * 1024) throw new Exception("伺服器回應過大。");
                        output.write(buffer, 0, count);
                    }
                    content = output.toString("UTF-8");
                }
            }
            if (status == 401) {
                clearSession();
                throw new Exception(path.equals("auth/login") ? "登入失敗，請確認帳戶及密碼。" : "登入已失效，請回到帳戶重新登入。");
            }
            JSONObject result;
            try { result = content.isEmpty() ? new JSONObject() : new JSONObject(content); }
            catch (Exception e) { throw new Exception("網站未回傳 JSON，請確認網址及 API 設定（HTTP " + status + "）。"); }
            if (status < 200 || status >= 300) throw new Exception(result.optString("error", "HTTP " + status));
            return result;
        } finally { connection.disconnect(); }
    }
}
