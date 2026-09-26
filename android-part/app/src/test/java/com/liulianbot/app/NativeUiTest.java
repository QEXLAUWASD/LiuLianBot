package com.liulianbot.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.graphics.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import okhttp3.mockwebserver.*;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;

@RunWith(RobolectricTestRunner.class)
@Config(application = AppSession.class, sdk = 28, qualifiers = "w393dp-h852dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class NativeUiTest {
  MockWebServer server;
  MainActivity activity;
  ActivityController<MainActivity> controller;
  volatile boolean loggedIn = true;
  volatile String lastLogin;
  volatile String sshInput;
  volatile JSONObject rdpInfos;

  @Before
  public void setup() throws Exception {
    server = new MockWebServer();
    server.setDispatcher(
        new Dispatcher() {
          @Override
          public MockResponse dispatch(RecordedRequest r) {
            if (r.getPath().startsWith("/api/ssh"))
              return new MockResponse()
                  .withWebSocketUpgrade(
                      new okhttp3.WebSocketListener() {
                        @Override
                        public void onClosing(okhttp3.WebSocket socket, int code, String reason) {
                          socket.close(code, reason);
                        }

                        @Override
                        public void onMessage(okhttp3.WebSocket socket, String text) {
                          try {
                            JSONObject m = new JSONObject(text);
                            if (m.optString("type").equals("connect")) {
                              socket.send("{\"type\":\"connected\"}");
                              socket.send("{\"type\":\"data\",\"data\":\"Welcome to SSH\"}");
                            }
                            if (m.optString("type").equals("input")) sshInput = m.getString("data");
                          } catch (Exception e) {
                            throw new AssertionError(e);
                          }
                        }
                      });
            if (r.getPath().startsWith("/socket.io/"))
              return new MockResponse()
                  .withWebSocketUpgrade(
                      new okhttp3.WebSocketListener() {
                        @Override
                        public void onClosing(okhttp3.WebSocket socket, int code, String reason) {
                          socket.close(code, reason);
                        }

                        @Override
                        public void onOpen(okhttp3.WebSocket socket, okhttp3.Response response) {
                          socket.send(
                              "0{\"sid\":\"test\",\"upgrades\":[],\"pingInterval\":25000,\"pingTimeout\":20000,\"maxPayload\":1000000}");
                        }

                        @Override
                        public void onMessage(okhttp3.WebSocket socket, String text) {
                          try {
                            if (text.equals("40")) socket.send("40{\"sid\":\"native\"}");
                            else if (text.startsWith("42")) {
                              org.json.JSONArray event = new org.json.JSONArray(text.substring(2));
                              if (event.getString(0).equals("infos")) {
                                rdpInfos = event.getJSONObject(1);
                                socket.send("42[\"rdp-connect\"]");
                                socket.send(
                                    "451-[\"rdp-bitmap\",{\"format\":\"rgba\",\"width\":1,\"height\":1,\"x\":0,\"y\":0,\"clipWidth\":1,\"clipHeight\":1,\"data\":{\"_placeholder\":true,\"num\":0}}]");
                                socket.send(
                                    okio.ByteString.of(new byte[] {(byte) 255, 0, 0, (byte) 255}));
                              }
                            }
                          } catch (Exception e) {
                            throw new AssertionError(e);
                          }
                        }
                      });
            String path = r.getPath();
            String body = "{}";
            if (path.equals("/api/auth/me"))
              body =
                  loggedIn
                      ? "{\"loggedIn\":true,\"user\":{\"id\":\"u1\",\"username\":\"LiuLian\",\"role\":\"admin\",\"termsAccepted\":true}}"
                      : "{\"loggedIn\":false}";
            else if (path.equals("/api/auth/login")) {
              lastLogin = r.getBody().readUtf8();
              loggedIn = true;
              body = "{\"success\":true}";
            } else if (path.equals("/api/page-visibility"))
              body =
                  "{\"pages\":{\"roller\":true,\"events\":true,\"account\":true,\"remote\":true,\"chromium\":true,\"vless-tunnel\":true}}";
            else if (path.equals("/api/files/access"))
              body = "{\"read\":true,\"write\":true,\"share\":true,\"owner\":true}";
            else if (path.startsWith("/api/files/list"))
              body =
                  "{\"entries\":[{\"name\":\"Photos\",\"directory\":true,\"size\":0},{\"name\":\"README.txt\",\"directory\":false,\"size\":1200}]}";
            else if (path.equals("/api/remote-profile"))
              body =
                  "{\"features\":{\"ssh\":true,\"rdp\":true},\"profile\":null,\"serverStorageAvailable\":true}";
            else if (path.equals("/api/events") || path.equals("/api/admin/events"))
              body =
                  "{\"events\":[{\"id\":1,\"title\":\"週末 R6 小隊\",\"guild_name\":\"LiuLian"
                      + " Community\",\"start_at\":\"2026-10-01T20:00:00+08:00\",\"participant_count\":3,\"max_players\":5,\"joined\":0}]}";
            else if (path.contains("guilds") || path.contains("announcement-targets"))
              body = "{\"guilds\":[]}";
            else if (path.contains("connections")) body = "{\"connections\":[]}";
            else if (path.contains("users")) body = "{\"users\":[]}";
            else if (path.contains("groups")) body = "{\"groups\":[]}";
            else if (path.contains("announcements")) body = "{\"announcements\":[]}";
            else if (path.contains("stats")) body = "{\"stats\":[]}";
            else if (path.contains("profiles")) body = "{\"available\":true,\"profiles\":[]}";
            else if (path.equals("/api/admin/page-visibility"))
              body = "{\"pages\":[],\"groups\":[],\"users\":[]}";
            return new MockResponse().setHeader("Content-Type", "application/json").setBody(body);
          }
        });
    server.start();
    AppSession session = (AppSession) RuntimeEnvironment.getApplication();
    String origin = server.url("/").toString();
    session.api = new ApiClient(origin.substring(0, origin.length() - 1), true);
    session.user = new JSONObject();
    controller = Robolectric.buildActivity(MainActivity.class).setup();
    activity = controller.get();
    await();
  }

  @After
  public void close() throws Exception {
    controller.pause().stop().destroy();
    server.shutdown();
  }

  void await() throws Exception {
    for (int i = 0; i < 200; i++) {
      shadowOf(android.os.Looper.getMainLooper()).idle();
      if (!activity.busy) return;
      Thread.sleep(10);
    }
    fail("UI did not finish request");
  }

  View find(View v, String text) {
    if (v instanceof TextView && text.contentEquals(((TextView) v).getText())) return v;
    if (v instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
        View found = find(((ViewGroup) v).getChildAt(i), text);
        if (found != null) return found;
      }
    return null;
  }

  EditText field(View v, String description) {
    if (v instanceof EditText && description.contentEquals(v.getContentDescription()))
      return (EditText) v;
    if (v instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
        EditText found = field(((ViewGroup) v).getChildAt(i), description);
        if (found != null) return found;
      }
    return null;
  }

  @Test
  public void nativeFeaturePagesRenderWithoutWebView() throws Exception {
    assertNotNull(find(activity.content, "歡迎回來，LiuLian"));
    capture("home");
    for (String route :
        new String[] {
          "account",
          "roller",
          "events",
          "files",
          "share",
          "admin",
          "remote",
          "chromium",
          "vless-tunnel",
          "guilds",
          "connections",
          "settings"
        }) {
      activity.navigate(route);
      await();
      assertFalse("Error on " + route, activity.status.getText().toString().contains("Exception"));
      assertNoWebView(activity.getWindow().getDecorView());
      if (route.equals("files") || route.equals("events") || route.equals("admin")) capture(route);
    }
  }

  @Test
  public void loginUsesNativeFieldsAndClearsPassword() throws Exception {
    loggedIn = false;
    activity.navigate("account");
    await();
    EditText user = field(activity.content, "使用者名稱"), password = field(activity.content, "密碼");
    assertNotNull(user);
    assertNotNull(password);
    user.setText("tester");
    password.setText("not-real-password");
    findButton(activity.content, "登入").performClick();
    await();
    assertEquals("", password.getText().toString());
    JSONObject body = new JSONObject(lastLogin);
    assertEquals("tester", body.getString("username"));
    assertEquals("not-real-password", body.getString("password"));
    assertNotNull(find(activity.content, "歡迎回來，LiuLian"));
  }

  @Test
  public void adminAndRemoteEditorsAreNativeAndUsable() throws Exception {
    AdminScreen admin = new AdminScreen(activity);
    Runnable[] screens = {
      admin::users,
      admin::groups,
      admin::connections,
      admin::visibility,
      admin::events,
      admin::announcements,
      admin::stats,
      admin::guilds,
      () -> admin.group(new JSONObject()),
      () -> admin.connection(new JSONObject()),
      () -> activity.remote.ssh(new JSONObject()),
      () -> activity.remote.rdp(new JSONObject(), "")
    };
    for (Runnable screen : screens) {
      screen.run();
      await();
      assertNoWebView(activity.content);
    }
    assertNotNull(find(activity.content, "儲存命名設定"));
    assertNotNull(find(activity.content, "Ctrl + Alt + Del"));
  }

  @Test
  public void sshUsesAuthenticatedWebsocketAndNativeTerminal() throws Exception {
    activity.remote.ssh(new JSONObject().put("host", "ssh.example").put("username", "tester"));
    findButton(activity.content, "連線").performClick();
    waitUntil(() -> activity.remote.connected);
    waitUntil(() -> activity.remote.terminal.getText().toString().contains("Welcome to SSH"));
    field(activity.content, "指令或輸入文字").setText("whoami");
    findButton(activity.content, "傳送並換行").performClick();
    waitUntil(() -> sshInput != null);
    assertEquals("whoami\n", sshInput);
  }

  @Test
  public void rdpNegotiatesNativeRgbaAndAcceptsBinarySocketIoFrame() throws Exception {
    activity.remote.rdp(new JSONObject().put("host", "rdp.example").put("username", "tester"), "");
    findButton(activity.content, "連線").performClick();
    waitUntil(() -> activity.remote.connected && activity.remote.canvas != null);
    assertEquals("rgba", rdpInfos.getString("bitmapFormat"));
    waitUntil(() -> activity.remote.canvas.pixelForTest(0, 0) == 0xffff0000);
    activity.remote.close();
    assertFalse(activity.remote.connected);
  }

  void waitUntil(java.util.function.BooleanSupplier condition) throws Exception {
    for (int i = 0; i < 300; i++) {
      shadowOf(android.os.Looper.getMainLooper()).idle();
      if (condition.getAsBoolean()) return;
      Thread.sleep(10);
    }
    fail("Native transport did not complete: " + activity.status.getText());
  }

  Button findButton(View view, String label) {
    if (view instanceof Button && label.contentEquals(((Button) view).getText()))
      return (Button) view;
    if (view instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
        Button button = findButton(((ViewGroup) view).getChildAt(i), label);
        if (button != null) return button;
      }
    return null;
  }

  void assertNoWebView(View view) {
    assertFalse(view instanceof android.webkit.WebView);
    if (view instanceof ViewGroup)
      for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++)
        assertNoWebView(((ViewGroup) view).getChildAt(i));
  }

  void capture(String name) throws Exception {
    View root = activity.getWindow().getDecorView();
    root.measure(
        View.MeasureSpec.makeMeasureSpec(393, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(852, View.MeasureSpec.EXACTLY));
    root.layout(0, 0, 393, 852);
    Bitmap bitmap = Bitmap.createBitmap(393, 852, Bitmap.Config.ARGB_8888);
    root.draw(new Canvas(bitmap));
    File directory = new File(System.getProperty("ui.screenshots"));
    directory.mkdirs();
    try (FileOutputStream out = new FileOutputStream(new File(directory, name + ".png"))) {
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
    bitmap.recycle();
  }
}
