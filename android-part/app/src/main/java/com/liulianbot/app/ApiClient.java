package com.liulianbot.app;

import java.io.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;
import okio.BufferedSink;
import org.json.JSONObject;

final class ApiClient {
  final String server;
  final OkHttpClient http;
  Runnable onSessionCleared = () -> {};
  private final List<Cookie> cookies = new ArrayList<>();
  static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

  ApiClient(String server) {
    this(server, false);
  }

  // HTTP is available only to local JVM test fixtures, never from App settings.
  ApiClient(String server, boolean testFixture) {
    this.server = testFixture ? server : ServerAddress.normalize(server);
    http =
        new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .followRedirects(false)
            .followSslRedirects(false)
            .cookieJar(
                new CookieJar() {
                  @Override
                  public void saveFromResponse(HttpUrl url, List<Cookie> received) {
                    synchronized (cookies) {
                      for (Cookie incoming : received) {
                        cookies.removeIf(
                            old ->
                                old.name().equals(incoming.name())
                                    && old.domain().equals(incoming.domain())
                                    && old.path().equals(incoming.path()));
                        if (incoming.expiresAt() > System.currentTimeMillis())
                          cookies.add(incoming);
                      }
                    }
                  }

                  @Override
                  public List<Cookie> loadForRequest(HttpUrl url) {
                    synchronized (cookies) {
                      cookies.removeIf(cookie -> cookie.expiresAt() <= System.currentTimeMillis());
                      List<Cookie> result = new ArrayList<>();
                      for (Cookie cookie : cookies) if (cookie.matches(url)) result.add(cookie);
                      return result;
                    }
                  }
                })
            .build();
  }

  void clearSession() {
    synchronized (cookies) {
      cookies.clear();
    }
    onSessionCleared.run();
  }

  org.json.JSONArray persistentCookies() {
    org.json.JSONArray values = new org.json.JSONArray();
    synchronized (cookies) {
      for (Cookie cookie : cookies)
        if (cookie.persistent() && cookie.expiresAt() > System.currentTimeMillis())
          values.put(object("origin", server, "value", cookie.toString()));
    }
    return values;
  }

  void restoreCookies(org.json.JSONArray values) {
    if (values == null) return;
    HttpUrl origin = HttpUrl.get(server);
    synchronized (cookies) {
      for (int i = 0; i < values.length(); i++) {
        JSONObject record = values.optJSONObject(i);
        if (record == null || !server.equals(record.optString("origin"))) continue;
        Cookie cookie = Cookie.parse(origin, record.optString("value"));
        if (cookie != null
            && cookie.persistent()
            && cookie.expiresAt() > System.currentTimeMillis()
            && cookie.matches(origin)) cookies.add(cookie);
      }
    }
  }

  String cookieHeader(String path) {
    List<String> values = new ArrayList<>();
    for (Cookie cookie : http.cookieJar().loadForRequest(HttpUrl.get(server + path)))
      values.add(cookie.name() + "=" + cookie.value());
    return String.join("; ", values);
  }

  Request requestBuilder(String method, String path, RequestBody body) {
    if (path.startsWith("/")
        || path.split("\\?", 2)[0].contains("..")
        || path.contains("\\")
        || path.contains("://")) throw new IllegalArgumentException("無效的 API 路徑");
    if (body == null && !method.equals("GET") && !method.equals("HEAD"))
      body = RequestBody.create("", JSON);
    return new Request.Builder()
        .url(server + "/api/" + path)
        .header("Accept", "application/json")
        .header("X-Files-Request", "1")
        .method(method, body)
        .build();
  }

  static RequestBody jsonBody(JSONObject data) {
    return data == null ? null : RequestBody.create(data.toString(), JSON);
  }

  JSONObject request(String method, String path, JSONObject data) throws Exception {
    try (Response response = http.newCall(requestBuilder(method, path, jsonBody(data))).execute()) {
      check(response);
      if (response.code() == 204
          || response.body() == null
          || (response.code() == 201
              && response.header("Content-Type", "").startsWith("text/plain")))
        return new JSONObject();
      try (InputStream in = response.body().byteStream()) {
        byte[] bytes = limitedBytes(in, 4 * 1024 * 1024);
        return bytes.length == 0
            ? new JSONObject()
            : new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
      } catch (org.json.JSONException e) {
        throw new IOException("網站未回傳 JSON，請確認 API 版本與網址。");
      }
    }
  }

  void check(Response response) throws IOException {
    if (response.isSuccessful()) return;
    String message = "操作失敗（HTTP " + response.code() + "）";
    if (response.code() == 401) clearSession();
    try {
      JSONObject error = new JSONObject(response.peekBody(8192).string());
      message = error.optString("error", message);
    } catch (Exception ignored) {
    }
    if (response.code() == 401) message += "，請重新登入。";
    throw new IOException(message);
  }

  interface StreamSource {
    InputStream open() throws IOException;
  }

  void upload(String path, StreamSource source) throws Exception {
    RequestBody body =
        new RequestBody() {
          @Override
          public MediaType contentType() {
            return MediaType.get("application/octet-stream");
          }

          @Override
          public void writeTo(BufferedSink sink) throws IOException {
            try (InputStream in = source.open()) {
              if (in == null) throw new IOException("無法開啟檔案");
              byte[] buffer = new byte[65536];
              long total = 0;
              int count;
              while ((count = in.read(buffer)) != -1) {
                total += count;
                if (total > 1024L * 1024 * 1024) throw new IOException("上傳上限為 1 GiB");
                sink.write(buffer, 0, count);
              }
            }
          }
        };
    try (Response response =
        http.newCall(requestBuilder("PUT", "files/upload?path=" + encode(path), body)).execute()) {
      check(response);
    }
  }

  void download(String method, String path, JSONObject body, OutputStream output) throws Exception {
    try (Response response = http.newCall(requestBuilder(method, path, jsonBody(body))).execute()) {
      check(response);
      if (response.body() == null) throw new IOException("下載內容為空");
      try (InputStream input = response.body().byteStream()) {
        byte[] buffer = new byte[65536];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
      }
    }
  }

  static byte[] limitedBytes(InputStream in, int max) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] b = new byte[8192];
    int count;
    while ((count = in.read(b)) != -1) {
      if (out.size() + count > max) throw new IOException("回應內容過大");
      out.write(b, 0, count);
    }
    return out.toByteArray();
  }

  static String encode(String value) {
    try {
      return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
    } catch (Exception e) {
      throw new IllegalArgumentException(e);
    }
  }

  static JSONObject object(Object... pairs) {
    JSONObject result = new JSONObject();
    try {
      for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
    } catch (Exception e) {
      throw new IllegalArgumentException(e);
    }
    return result;
  }
}
