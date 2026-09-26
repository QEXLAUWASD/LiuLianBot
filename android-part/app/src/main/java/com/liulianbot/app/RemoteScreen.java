package com.liulianbot.app;

import static com.liulianbot.app.MainActivity.*;

import android.app.Dialog;
import android.graphics.*;
import android.util.Base64;
import android.view.*;
import android.widget.*;
import io.socket.client.IO;
import io.socket.client.Socket;
import java.util.*;
import okhttp3.*;
import org.json.*;

final class RemoteScreen {
  final MainActivity a;
  WebSocket websocket;
  Socket rdpSocket;
  RemoteCanvas canvas;
  volatile boolean connected;
  volatile long connectionVersion;
  int token;
  int chromiumModifiers;
  Dialog fullscreen;
  final java.util.concurrent.atomic.AtomicReference<Bitmap> latestFrame =
      new java.util.concurrent.atomic.AtomicReference<>();
  final java.util.concurrent.atomic.AtomicBoolean frameScheduled =
      new java.util.concurrent.atomic.AtomicBoolean();
  final java.util.concurrent.atomic.AtomicLong pendingTileBytes =
      new java.util.concurrent.atomic.AtomicLong();

  RemoteScreen(MainActivity a) {
    this.a = a;
  }

  void show() {
    a.screen("遠端工作區", "原生 SSH 與 RDP · 使用網站後端連線");
    a.get(
        "remote-profile",
        r -> {
          JSONObject features = r.getJSONObject("features"), profile = r.optJSONObject("profile");
          a.card("連線方式");
          if (features.optBoolean("ssh"))
            a.button("SSH 終端機", () -> ssh(profile == null ? obj() : profile.optJSONObject("ssh")));
          if (features.optBoolean("rdp")) {
            a.button(
                "RDP 桌面", () -> rdp(profile == null ? obj() : profile.optJSONObject("rdp"), ""));
            a.button("已儲存的 RDP 連線", this::profiles);
          }
          if (!features.optBoolean("ssh") && !features.optBoolean("rdp"))
            a.text("伺服器目前未啟用遠端功能。", 16);
          a.button(
              "刪除伺服器舊版連線設定",
              () ->
                  a.confirm(
                      "刪除你的舊版 SSH／RDP 設定？命名 RDP 設定不受影響。",
                      () -> a.mutate("DELETE", "remote-profile", null, this::show)));
        });
  }

  boolean active() {
    return !a.isDestroyed() && token == a.generation;
  }

  void close() {
    connectionVersion++;
    connected = false;
    chromiumModifiers = 0;
    Bitmap queued = latestFrame.getAndSet(null);
    if (queued != null) queued.recycle();
    if (fullscreen != null) {
      fullscreen.dismiss();
      fullscreen = null;
    }
    if (canvas != null) {
      canvas.dispose();
      canvas = null;
    }
    if (websocket != null) {
      websocket.close(1000, "Client closed");
      websocket = null;
    }
    if (rdpSocket != null) {
      rdpSocket.off();
      rdpSocket.disconnect();
      rdpSocket = null;
    }
  }

  void fail(long connection, String message) {
    a.runOnUiThread(
        () -> {
          if (!active() || connection != connectionVersion) return;
          close();
          a.status.setText(message);
        });
  }

  void state(long connection, String message) {
    a.runOnUiThread(
        () -> {
          if (active() && connection == connectionVersion) a.status.setText(message);
        });
  }

  void send(JSONObject data) {
    if (websocket != null) websocket.send(data.toString());
  }

  JSONObject values(EditText host, EditText port, EditText user, EditText secret, EditText domain) {
    return obj(
        "host",
        value(host).trim(),
        "port",
        number(port),
        "username",
        value(user),
        "password",
        value(secret),
        "domain",
        domain == null ? "" : value(domain));
  }

  void ssh(JSONObject initial) {
    JSONObject p = initial == null ? obj() : initial;
    a.screen("SSH 終端機", "密碼只用於目前連線，不儲存");
    token = a.generation;
    a.cleanup = this::close;
    a.card("連線資料");
    EditText host = a.field("主機", str(p, "host"), false),
        port = a.field("連接埠", p.optString("port", "22"), false),
        user = a.field("帳戶", str(p, "username"), false),
        password = a.field("密碼", "", true),
        key = a.multiline("SSH 私密金鑰（可選，使用金鑰時不需密碼）", str(p, "privateKey"), true);
    a.button(
        "連線",
        () -> {
          if (websocket != null) {
            a.status.setText("請先中斷目前連線。");
            return;
          }
          JSONObject credentials = values(host, port, user, password, null);
          try {
            credentials.put("type", "connect");
            if (!value(key).isEmpty()) credentials.put("privateKey", value(key));
          } catch (Exception e) {
            a.error(e);
            return;
          }
          password.setText("");
          key.setText("");
          connectSsh(credentials);
        });
    a.button(
        "中斷",
        () -> {
          close();
          a.status.setText("已中斷");
        });
    a.button(
        "加密儲存至此裝置",
        () -> {
          try {
            ProfileStore.save(
                a,
                a.api().server,
                "ssh",
                obj(
                    "host",
                    value(host),
                    "port",
                    number(port),
                    "username",
                    value(user),
                    "privateKey",
                    value(key)));
            a.status.setText("已加密儲存，不包含密碼。");
          } catch (Exception e) {
            a.error(e);
          }
        });
    a.button(
        "載入此裝置設定",
        () -> {
          try {
            ssh(ProfileStore.load(a, a.api().server, "ssh"));
          } catch (Exception e) {
            a.error(e);
          }
        });
    a.button(
        "刪除此裝置設定",
        () -> {
          ProfileStore.clear(a, a.api().server, "ssh");
          a.status.setText("已刪除");
        });
    a.button(
        "加密儲存至伺服器",
        () -> {
          JSONObject ssh =
              obj(
                  "host",
                  value(host),
                  "port",
                  number(port),
                  "username",
                  value(user),
                  "privateKey",
                  value(key));
          a.run(
              () -> {
                JSONObject current =
                    a.api().request("GET", "remote-profile", null).optJSONObject("profile");
                if (current == null) current = obj();
                current.put("ssh", ssh);
                return a.api().request("PUT", "remote-profile", current);
              },
              r -> a.status.setText("已儲存"));
        });
    a.card("終端輸出");
    terminal = a.text("尚未連線", 14);
    terminal.setTypeface(Typeface.MONOSPACE);
    EditText command = a.field("指令或輸入文字", "", false);
    a.button(
        "傳送並換行",
        () -> {
          if (!connected) {
            a.status.setText("請先連線。");
            return;
          }
          send(obj("type", "input", "data", value(command) + "\n"));
          command.setText("");
        });
    a.button("Ctrl+C", () -> send(obj("type", "input", "data", "\u0003")));
    a.button("Tab", () -> send(obj("type", "input", "data", "\t")));
    a.button("Esc", () -> send(obj("type", "input", "data", "\u001b")));
  }

  TextView terminal;

  void connectSsh(JSONObject initial) {
    int expected = token;
    long connection = ++connectionVersion;
    websocket =
        a.api()
            .http
            .newWebSocket(
                new Request.Builder().url(a.api().server + "/api/ssh").build(),
                new WebSocketListener() {
                  @Override
                  public void onOpen(WebSocket socket, Response response) {
                    if (!active() || expected != token || connection != connectionVersion) {
                      socket.close(1000, "Closed");
                      return;
                    }
                    socket.send(initial.toString());
                    initial.remove("password");
                    initial.remove("privateKey");
                    state(connection, "正在連接 SSH…");
                  }

                  @Override
                  public void onMessage(WebSocket socket, String text) {
                    if (expected != token || connection != connectionVersion || !active()) return;
                    try {
                      JSONObject m = new JSONObject(text);
                      String type = m.optString("type");
                      if (type.equals("connected")) {
                        connected = true;
                        socket.send(obj("type", "resize", "cols", 100, "rows", 30).toString());
                        state(connection, "SSH 已連線");
                      } else if (type.equals("data")) {
                        String chunk =
                            m.optString("data").replaceAll("\\x1B\\[[0-?]*[ -/]*[@-~]", "");
                        a.runOnUiThread(
                            () -> {
                              if (!active() || expected != token || connection != connectionVersion)
                                return;
                              String value = terminal.getText() + chunk;
                              if (value.length() > 65536)
                                value = value.substring(value.length() - 65536);
                              terminal.setText(value);
                            });
                      } else if (type.equals("error"))
                        fail(connection, m.optString("message", "SSH 失敗"));
                      else if (type.equals("closed")) fail(connection, "SSH 已關閉");
                    } catch (Exception e) {
                      fail(connection, "無法讀取 SSH 訊息");
                    }
                  }

                  @Override
                  public void onFailure(WebSocket socket, Throwable error, Response response) {
                    if (expected == token && connection == connectionVersion)
                      fail(connection, "SSH 連線失敗：" + error.getMessage());
                  }

                  @Override
                  public void onClosing(WebSocket socket, int code, String reason) {
                    socket.close(code, reason);
                    fail(connection, "遠端連線已關閉");
                  }

                  @Override
                  public void onClosed(WebSocket socket, int code, String reason) {
                    if (expected == token && connection == connectionVersion)
                      fail(connection, "SSH 已關閉");
                  }
                });
  }

  void profiles() {
    a.screen("RDP 連線設定", "每組設定獨立保存，可選擇加密儲存密碼");
    a.button("新增 RDP 設定", () -> rdp(obj(), ""));
    a.get(
        "rdp/profiles",
        r -> {
          if (!r.optBoolean("available")) {
            a.text("伺服器尚未設定連線資料加密金鑰。", 16);
            return;
          }
          JSONArray list = r.getJSONArray("profiles");
          for (int i = 0; i < list.length(); i++) {
            JSONObject p = list.getJSONObject(i);
            a.card(str(p, "name"));
            String id = str(p, "id");
            a.button(
                "載入／連線",
                () ->
                    a.get(
                        "rdp/profiles/" + enc(id), data -> rdp(data.getJSONObject("profile"), id)));
            a.button(
                "刪除",
                () ->
                    a.confirm(
                        "刪除此 RDP 設定與儲存密碼？",
                        () -> a.mutate("DELETE", "rdp/profiles/" + enc(id), null, this::profiles)));
          }
        });
  }

  void rdp(JSONObject initial, String profileId) {
    JSONObject p = initial == null ? obj() : initial;
    a.screen("RDP 桌面", "遠端桌面、滑鼠與鍵盤輸入");
    token = a.generation;
    a.cleanup = this::close;
    a.card("連線設定");
    EditText name = a.field("設定名稱", str(p, "name"), false),
        host = a.field("主機", str(p, "host"), false),
        port = a.field("連接埠", p.optString("port", "3389"), false),
        user = a.field("帳戶", str(p, "username"), false),
        domain = a.field("網域", str(p, "domain"), false),
        password = a.field("密碼", str(p, "password"), true);
    a.button(
        "連線",
        () -> {
          if (rdpSocket != null) {
            a.status.setText("請先中斷目前連線。");
            return;
          }
          JSONObject data = values(host, port, user, password, domain);
          password.setText("");
          connectRdp(data);
        });
    a.button(
        "中斷",
        () -> {
          close();
          a.status.setText("已中斷");
        });
    CheckBox savePassword = a.check("將輸入的密碼加密儲存至伺服器", false);
    a.button(
        "儲存命名設定",
        () -> {
          JSONObject data = values(host, port, user, password, domain);
          if (!savePassword.isChecked()) data.remove("password");
          try {
            data.put("name", value(name));
          } catch (Exception e) {
            a.error(e);
            return;
          }
          a.mutate(
              profileId.isEmpty() ? "POST" : "PUT",
              "rdp/profiles" + (profileId.isEmpty() ? "" : "/" + enc(profileId)),
              data,
              this::profiles);
        });
    a.button(
        "匯出 RDP 檔案",
        () ->
            a.save(
                "liulianbot.rdp",
                "application/x-rdp",
                "POST",
                "rdp/download",
                obj(
                    "host",
                    value(host),
                    "port",
                    number(port),
                    "username",
                    value(user),
                    "domain",
                    value(domain))));
    a.button(
        "加密儲存至此裝置（不含密碼）",
        () -> {
          try {
            ProfileStore.save(a, a.api().server, "rdp", values(host, port, user, password, domain));
            a.status.setText("已加密儲存");
          } catch (Exception e) {
            a.error(e);
          }
        });
    a.button(
        "載入此裝置設定",
        () -> {
          try {
            rdp(ProfileStore.load(a, a.api().server, "rdp"), "");
          } catch (Exception e) {
            a.error(e);
          }
        });
    a.button(
        "刪除此裝置設定",
        () -> {
          ProfileStore.clear(a, a.api().server, "rdp");
          a.status.setText("已刪除");
        });
    a.card("遠端桌面");
    a.text("連線後顯示桌面。觸控點擊與拖曳控制滑鼠；下方可輸入文字與特殊按鍵。", 14);
    canvasHolder = new LinearLayout(a);
    canvasHolder.setOrientation(LinearLayout.VERTICAL);
    a.area.addView(canvasHolder);
    controls(false);
  }

  LinearLayout canvasHolder;

  void connectRdp(JSONObject credentials) {
    connected = false;
    int expected = token;
    long connection = ++connectionVersion;
    try {
      IO.Options options = new IO.Options();
      options.forceNew = true;
      options.reconnection = false;
      options.timeout = 15000;
      options.transports = new String[] {"websocket"};
      options.extraHeaders =
          Collections.singletonMap(
              "Cookie", Collections.singletonList(a.api().cookieHeader("/socket.io/")));
      options.callFactory = a.api().http;
      options.webSocketFactory = a.api().http;
      Socket socket = IO.socket(a.api().server, options);
      rdpSocket = socket;
      credentials.put("screen", obj("width", 1280, "height", 720));
      credentials.put("bitmapFormat", "rgba");
      socket.once(Socket.EVENT_CONNECT, args -> socket.emit("infos", credentials));
      socket.on(
          "rdp-connect",
          args ->
              a.runOnUiThread(
                  () -> {
                    if (!active()
                        || expected != token
                        || connection != connectionVersion
                        || rdpSocket != socket) return;
                    connected = true;
                    mountCanvas(false);
                    a.status.setText(R.string.rdp_connected);
                  }));
      socket.on(
          "rdp-bitmap",
          args -> {
            if (!active()
                || expected != token
                || connection != connectionVersion
                || rdpSocket != socket
                || args.length == 0) return;
            try {
              JSONObject frame = (JSONObject) args[0];
              if (!frame.optString("format").equals("rgba"))
                throw new IllegalArgumentException("請先更新網站後端以支援原生 RDP");
              Object raw = frame.get("data");
              byte[] bytes;
              if (raw instanceof byte[]) bytes = (byte[]) raw;
              else {
                JSONArray array =
                    raw instanceof JSONObject
                        ? ((JSONObject) raw).getJSONArray("data")
                        : (JSONArray) raw;
                bytes = new byte[array.length()];
                for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) array.getInt(i);
              }
              int w = frame.getInt("width"),
                  h = frame.getInt("height"),
                  x = frame.getInt("x"),
                  y = frame.getInt("y"),
                  cw = frame.getInt("clipWidth"),
                  ch = frame.getInt("clipHeight");
              if (pendingTileBytes.get() + bytes.length > 16 * 1024 * 1024)
                throw new IllegalArgumentException("裝置無法及時處理桌面更新，請重新連線。");
              int[] pixels = RgbaFrame.pixels(bytes, w, h, cw, ch, x, y, 1280, 720);
              final int queuedBytes = bytes.length;
              pendingTileBytes.addAndGet(queuedBytes);
              a.runOnUiThread(
                  () -> {
                    try {
                      if (active() && rdpSocket == socket && canvas != null)
                        canvas.rgba(pixels, w, x, y, cw, ch);
                    } finally {
                      pendingTileBytes.addAndGet(-queuedBytes);
                    }
                  });
            } catch (Exception e) {
              if (expected == token && connection == connectionVersion)
                fail(connection, e.getMessage());
            }
          });
      socket.on(
          "rdp-error",
          args ->
              fail(
                  connection,
                  args.length > 0 && args[0] instanceof JSONObject
                      ? ((JSONObject) args[0]).optString("message", "RDP 失敗")
                      : "RDP 失敗"));
      socket.on(Socket.EVENT_CONNECT_ERROR, args -> fail(connection, "RDP 無法連線，請確認登入、條款與遠端群組權限。"));
      socket.on("rdp-close", args -> fail(connection, "RDP 已關閉"));
      socket.on(Socket.EVENT_DISCONNECT, args -> fail(connection, "RDP transport 已中斷，請重新連線。"));
      socket.connect();
      a.status.setText(R.string.rdp_connecting);
      new android.os.Handler(android.os.Looper.getMainLooper())
          .postDelayed(
              () -> {
                if (active() && rdpSocket == socket && !connected)
                  fail(connection, "RDP 連線逾時，請重試。");
              },
              35000);
    } catch (Exception e) {
      close();
      a.error(e);
    }
  }

  void mountCanvas(boolean chromium) {
    if (canvas != null) canvas.dispose();
    canvasHolder.removeAllViews();
    canvas =
        new RemoteCanvas(
            a,
            1280,
            720,
            new RemoteCanvas.Input() {
              public void mouse(int x, int y, int button, boolean pressed) {
                if (!connected) return;
                if (chromium)
                  send(
                      obj(
                          "type",
                          "input",
                          "input",
                          obj(
                              "type",
                              "mouse",
                              "eventType",
                              button == 0
                                  ? "mouseMoved"
                                  : pressed ? "mousePressed" : "mouseReleased",
                              "x",
                              x,
                              "y",
                              y,
                              "button",
                              button == 0 ? "none" : button == 2 ? "right" : "left",
                              "clickCount",
                              1)));
                else if (rdpSocket != null) rdpSocket.emit("mouse", x, y, button, pressed);
              }

              public void key(int code, boolean pressed) {
                if (!connected) return;
                if (chromium) {
                  int mask = NativeKeyboard.modifier(code);
                  chromiumModifiers =
                      pressed ? chromiumModifiers | mask : chromiumModifiers & ~mask;
                  send(
                      obj(
                          "type",
                          "input",
                          "input",
                          NativeKeyboard.chromium(code, pressed, chromiumModifiers)));
                } else if (rdpSocket != null) rdpSocket.emit("scancode", code, pressed);
              }
            });
    canvasHolder.addView(canvas, new LinearLayout.LayoutParams(-1, a.dp(280)));
  }

  void controls(boolean chromium) {
    CheckBox right = a.check("滑鼠右鍵", false);
    right.setOnCheckedChangeListener(
        (v, on) -> {
          if (canvas != null) canvas.rightClick(on);
        });
    a.button("全螢幕", this::fullscreen);
    EditText text = a.multiline("傳送文字", "", false);
    a.button(
        "傳送文字",
        () -> {
          if (!connected) {
            a.status.setText("請先連線。");
            return;
          }
          String value = value(text);
          if (chromium) {
            for (int i = 0; i < value.length(); ) {
              int end = Math.min(value.length(), i + 32);
              if (end < value.length() && Character.isHighSurrogate(value.charAt(end - 1))) end--;
              send(
                  obj(
                      "type",
                      "input",
                      "input",
                      obj("type", "key", "eventType", "char", "text", value.substring(i, end))));
              i = end;
            }
          } else if (rdpSocket != null)
            for (int i = 0; i < value.length(); i++) {
              int code = value.charAt(i);
              rdpSocket.emit("unicode", code, true);
              rdpSocket.emit("unicode", code, false);
            }
          text.setText("");
        });
    String[] labels = {"Enter", "Tab", "Backspace", "Escape", "←", "↑", "→", "↓"};
    int[] scans = {28, 15, 14, 1, 0xe04b, 0xe048, 0xe04d, 0xe050};
    int[] virtual = {13, 9, 8, 27, 37, 38, 39, 40};
    String[] keys = {
      "Enter", "Tab", "Backspace", "Escape", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"
    };
    for (int i = 0; i < labels.length; i++) {
      int index = i;
      a.button(
          labels[i],
          () -> {
            if (!connected) return;
            if (chromium) {
              for (String phase : new String[] {"keyDown", "keyUp"})
                send(
                    obj(
                        "type",
                        "input",
                        "input",
                        obj(
                            "type",
                            "key",
                            "eventType",
                            phase,
                            "key",
                            keys[index],
                            "code",
                            keys[index],
                            "windowsVirtualKeyCode",
                            virtual[index])));
            } else if (rdpSocket != null) {
              rdpSocket.emit("scancode", scans[index], true);
              rdpSocket.emit("scancode", scans[index], false);
            }
          });
    }
    a.button("向上捲動", () -> wheel(chromium, true));
    a.button("向下捲動", () -> wheel(chromium, false));
    if (!chromium)
      a.button(
          "Ctrl + Alt + Del",
          () -> {
            if (!connected || rdpSocket == null) return;
            for (int code : new int[] {29, 56, 0xe053}) rdpSocket.emit("scancode", code, true);
            for (int code : new int[] {0xe053, 56, 29}) rdpSocket.emit("scancode", code, false);
          });
  }

  void wheel(boolean chromium, boolean up) {
    if (!connected) return;
    if (chromium)
      send(
          obj(
              "type",
              "input",
              "input",
              obj("type", "wheel", "x", 640, "y", 360, "deltaY", up ? -240 : 240, "deltaX", 0)));
    else if (rdpSocket != null) rdpSocket.emit("wheel", 640, 360, 2, !up, false);
  }

  void fullscreen() {
    if (canvas == null || fullscreen != null) return;
    RemoteCanvas view = canvas;
    canvasHolder.removeView(view);
    Dialog dialog = new Dialog(a, android.R.style.Theme_Material_NoActionBar_Fullscreen);
    fullscreen = dialog;
    LinearLayout root = new LinearLayout(a);
    root.setOrientation(LinearLayout.VERTICAL);
    root.addView(view, new LinearLayout.LayoutParams(-1, 0, 1));
    Button exit = new Button(a);
    exit.setText("離開全螢幕");
    exit.setOnClickListener(v -> dialog.dismiss());
    root.addView(exit);
    dialog.setContentView(root);
    dialog.setOnDismissListener(
        d -> {
          root.removeView(view);
          if (canvas == view)
            canvasHolder.addView(view, new LinearLayout.LayoutParams(-1, a.dp(280)));
          fullscreen = null;
        });
    dialog.show();
  }

  void chromium() {
    a.screen("Chromium 瀏覽器", "伺服器瀏覽工作區 · 滑鼠、鍵盤與文字輸入");
    token = a.generation;
    a.cleanup = this::close;
    a.card("瀏覽網址");
    EditText url = a.field("HTTP／HTTPS 網址", "https://www.liulian.dev", false);
    a.button(
        "啟動工作區",
        () -> {
          if (websocket != null) {
            a.status.setText("請先中斷目前工作區。");
            return;
          }
          connectChromium(value(url));
        });
    a.button(
        "前往網址",
        () -> {
          if (!connected) {
            a.status.setText("請先啟動工作區。");
            return;
          }
          send(obj("type", "navigate", "url", value(url)));
        });
    a.button(
        "關閉工作區",
        () -> {
          close();
          a.status.setText("已關閉");
        });
    a.card("瀏覽器畫面");
    canvasHolder = new LinearLayout(a);
    canvasHolder.setOrientation(LinearLayout.VERTICAL);
    a.area.addView(canvasHolder);
    controls(true);
  }

  void connectChromium(String url) {
    int expected = token;
    long connection = ++connectionVersion;
    websocket =
        a.api()
            .http
            .newWebSocket(
                new Request.Builder().url(a.api().server + "/api/chromium/ws").build(),
                new WebSocketListener() {
                  @Override
                  public void onOpen(WebSocket socket, Response response) {
                    if (!active() || expected != token || connection != connectionVersion) {
                      socket.close(1000, "Closed");
                      return;
                    }
                    socket.send(
                        obj("type", "open", "url", url, "size", obj("width", 1280, "height", 720))
                            .toString());
                    state(connection, "正在啟動 Chromium…");
                  }

                  @Override
                  public void onMessage(WebSocket socket, String text) {
                    if (!active() || expected != token || connection != connectionVersion) return;
                    try {
                      JSONObject m = new JSONObject(text);
                      String type = m.optString("type");
                      if (type.equals("ready")) {
                        a.runOnUiThread(
                            () -> {
                              if (active()
                                  && expected == token
                                  && connection == connectionVersion) {
                                connected = true;
                                mountCanvas(true);
                                a.status.setText(R.string.chromium_connected);
                              }
                            });
                      } else if (type.equals("frame")) {
                        String data = m.getString("data");
                        if (data.length() > 16 * 1024 * 1024)
                          throw new IllegalArgumentException("畫面資料過大");
                        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                        BitmapFactory.Options options = new BitmapFactory.Options();
                        options.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                        if (options.outWidth < 1
                            || options.outHeight < 1
                            || options.outWidth > 1920
                            || options.outHeight > 1080)
                          throw new IllegalArgumentException("畫面尺寸無效");
                        Bitmap frame = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                        if (frame == null) throw new IllegalArgumentException("無法解碼畫面");
                        presentFrame(frame, connection);
                      } else if (type.equals("error"))
                        fail(connection, m.optString("message", "Chromium 失敗"));
                      else if (type.equals("closed")) fail(connection, "工作區已關閉");
                      else if (type.equals("navigated"))
                        state(connection, "已前往 " + m.optString("url"));
                    } catch (Exception e) {
                      fail(connection, e.getMessage());
                    }
                  }

                  @Override
                  public void onFailure(WebSocket socket, Throwable error, Response response) {
                    if (expected == token && connection == connectionVersion)
                      fail(connection, "Chromium 連線失敗：" + error.getMessage());
                  }

                  @Override
                  public void onClosing(WebSocket socket, int code, String reason) {
                    socket.close(code, reason);
                    fail(connection, "遠端連線已關閉");
                  }

                  @Override
                  public void onClosed(WebSocket socket, int code, String reason) {
                    if (expected == token && connection == connectionVersion)
                      fail(connection, "Chromium 已中斷");
                  }
                });
  }

  void presentFrame(Bitmap frame, long connection) {
    if (connection != connectionVersion) {
      frame.recycle();
      return;
    }
    Bitmap previous = latestFrame.getAndSet(frame);
    if (previous != null) previous.recycle();
    if (frameScheduled.compareAndSet(false, true))
      a.runOnUiThread(
          () -> {
            Bitmap next = latestFrame.getAndSet(null);
            frameScheduled.set(false);
            if (next != null) {
              if (active() && canvas != null && connection == connectionVersion) canvas.frame(next);
              else next.recycle();
            }
          });
  }

  void vless() {
    a.screen("VLESS Tunnel", "合併臨時 VLESS／Clash 設定");
    a.card("設定來源");
    JSONArray formats = new JSONArray().put("vless").put("clash");
    MainActivity.Choice format = a.choice("格式", formats, "", "", "vless", false);
    EditText source = a.multiline("現有 VLESS 位址列表或 Clash／Mihomo YAML", "", false);
    a.button(
        "產生設定",
        () ->
            a.run(
                () ->
                    a.api()
                        .request(
                            "POST",
                            "vless-tunnel/generate",
                            obj("format", format.value(), "source", value(source))),
                r -> {
                  a.card("產生結果");
                  String config = r.getString("config");
                  a.text(config, 14).setTypeface(Typeface.MONOSPACE);
                  JSONObject interim = r.optJSONObject("interim");
                  if (interim != null) a.text("有效至：" + str(interim, "expiresAt"), 14);
                  a.button("複製設定", () -> a.copy(config));
                  a.button(
                      "儲存設定檔",
                      () ->
                          a.saveText(
                              format.value().equals("clash")
                                  ? "liulian-clash.yaml"
                                  : "liulian-vless.txt",
                              config));
                }));
  }
}
