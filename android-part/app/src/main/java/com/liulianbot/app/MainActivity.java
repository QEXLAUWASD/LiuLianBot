package com.liulianbot.app;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public final class MainActivity extends Activity {
  static final int BG = Color.rgb(7, 11, 18),
      CARD = Color.rgb(16, 26, 39),
      BORDER = Color.rgb(40, 57, 76);
  static final int TEXT = Color.rgb(232, 238, 247),
      MUTED = Color.rgb(133, 147, 168),
      BLUE = Color.rgb(47, 142, 203);
  final ExecutorService worker = Executors.newFixedThreadPool(2);
  AppSession session;
  LinearLayout content, area;
  TextView status;
  ProgressBar progress;
  int generation;
  boolean busy;
  String current = "home";
  Runnable cleanup;
  FilesScreen files;
  RemoteScreen remote;
  private Download pendingDownload;
  private String uploadPath;
  private byte[] localDownload;
  private final ArrayDeque<String> history = new ArrayDeque<>();

  ApiClient api() {
    return session.api;
  }

  static JSONObject obj(Object... values) {
    return ApiClient.object(values);
  }

  static String enc(String value) {
    return ApiClient.encode(value);
  }

  static String str(JSONObject data, String key) {
    return data.isNull(key) ? "" : data.optString(key);
  }

  static boolean flag(JSONObject data, String key) {
    return data.optBoolean(key) || data.optInt(key, 0) == 1;
  }

  boolean signedIn() {
    return session.user.has("id");
  }

  boolean admin() {
    return "admin".equals(session.user.optString("role"));
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    session = (AppSession) getApplication();
    files = new FilesScreen(this);
    remote = new RemoteScreen(this);
    home();
  }

  int dp(int n) {
    return Math.round(n * getResources().getDisplayMetrics().density);
  }

  GradientDrawable shape(int color, int radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    d.setStroke(dp(1), BORDER);
    return d;
  }

  void screen(String title, String subtitle) {
    if (cleanup != null) {
      cleanup.run();
      cleanup = null;
    }
    generation++;
    busy = false;
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(BG);
    root.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          view.setPadding(
              0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });
    LinearLayout bar = new LinearLayout(this);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(12), dp(4), dp(12), dp(4));
    bar.setBackgroundColor(CARD);
    Button menu = new Button(this);
    menu.setText("☰");
    menu.setContentDescription("開啟導覽選單");
    menu.setTextColor(TEXT);
    menu.setBackground(shape(CARD, 9));
    menu.setOnClickListener(v -> navigation());
    bar.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(48)));
    TextView brand = new TextView(this);
    brand.setText(getString(R.string.toolbar_title, title));
    brand.setTextColor(TEXT);
    brand.setTextSize(16);
    brand.setTypeface(null, Typeface.BOLD);
    bar.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
    root.addView(bar);
    progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    progress.setIndeterminate(true);
    progress.setVisibility(View.INVISIBLE);
    root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    content = new LinearLayout(this);
    content.setOrientation(LinearLayout.VERTICAL);
    content.setPadding(dp(20), dp(16), dp(20), dp(24));
    scroll.addView(content);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    area = content;
    TextView heading = text(title, 28);
    heading.setTypeface(null, Typeface.BOLD);
    TextView intro = text(subtitle, 14);
    intro.setTextColor(MUTED);
    status = new TextView(this);
    status.setPadding(dp(20), dp(6), dp(20), dp(6));
    status.setTextColor(0xff66d9c5);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    root.addView(status);
    setContentView(root);
    root.requestApplyInsets();
  }

  void card(String title) {
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(16), dp(12), dp(16), dp(16));
    box.setBackground(shape(CARD, 14));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.topMargin = dp(14);
    content.addView(box, params);
    area = box;
    if (!title.isEmpty()) {
      TextView heading = text(title, 19);
      heading.setTypeface(null, Typeface.BOLD);
    }
  }

  TextView text(String value, int size) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setTextColor(TEXT);
    v.setTextSize(size);
    v.setPadding(0, dp(5), 0, dp(7));
    v.setTextIsSelectable(true);
    area.addView(v);
    return v;
  }

  Button button(String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setTextColor(TEXT);
    b.setTextSize(15);
    b.setBackground(shape(0xff142132, 9));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.topMargin = dp(8);
    b.setMinHeight(dp(48));
    area.addView(b, p);
    b.setOnClickListener(
        v -> {
          if (!busy) {
            try {
              action.run();
            } catch (Exception e) {
              error(e);
            }
          }
        });
    return b;
  }

  EditText field(String label, String initial, boolean secret) {
    text(label, 13).setTextColor(MUTED);
    EditText v = new EditText(this);
    v.setTextColor(TEXT);
    v.setHintTextColor(MUTED);
    v.setSingleLine(true);
    v.setText(initial);
    v.setContentDescription(label);
    v.setTextSize(16);
    v.setPadding(dp(12), dp(10), dp(12), dp(10));
    v.setBackground(shape(BG, 9));
    v.setInputType(
        InputType.TYPE_CLASS_TEXT
            | (secret
                ? InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
    if (secret) {
      v.setSaveEnabled(false);
      v.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
    }
    area.addView(v, new LinearLayout.LayoutParams(-1, -2));
    return v;
  }

  EditText multiline(String label, String initial, boolean secret) {
    EditText v = field(label, initial, secret);
    v.setSingleLine(false);
    v.setMinLines(3);
    v.setGravity(Gravity.TOP);
    return v;
  }

  EditText dateTime(String label) {
    EditText field =
        field(
            label,
            java.time.OffsetDateTime.now().plusHours(1).withSecond(0).withNano(0).toString(),
            false);
    button(
        "選擇日期與時間",
        () -> {
          java.time.LocalDateTime now = java.time.LocalDateTime.now().plusHours(1);
          new DatePickerDialog(
                  this,
                  (picker, year, month, day) ->
                      new TimePickerDialog(
                              this,
                              (clock, hour, minute) -> {
                                java.time.ZonedDateTime selected =
                                    java.time.LocalDateTime.of(year, month + 1, day, hour, minute)
                                        .atZone(java.time.ZoneId.systemDefault());
                                field.setText(selected.toOffsetDateTime().toString());
                              },
                              now.getHour(),
                              now.getMinute(),
                              true)
                          .show(),
                  now.getYear(),
                  now.getMonthValue() - 1,
                  now.getDayOfMonth())
              .show();
        });
    return field;
  }

  CheckBox check(String label, boolean checked) {
    CheckBox v = new CheckBox(this);
    v.setText(label);
    v.setTextColor(TEXT);
    v.setChecked(checked);
    area.addView(v);
    return v;
  }

  Choice choice(
      String label,
      JSONArray values,
      String idKey,
      String labelKey,
      String selected,
      boolean empty) {
    text(label, 13).setTextColor(MUTED);
    Choice v = new Choice(this, values, idKey, labelKey, selected, empty);
    area.addView(v, new LinearLayout.LayoutParams(-1, dp(48)));
    return v;
  }

  // Constructed only by native screen code, never inflated from XML.
  @android.annotation.SuppressLint("ViewConstructor")
  static final class Choice extends Spinner {
    final List<String> ids = new ArrayList<>();

    Choice(
        MainActivity a,
        JSONArray array,
        String idKey,
        String labelKey,
        String selected,
        boolean empty) {
      super(a);
      List<String> labels = new ArrayList<>();
      if (empty) {
        ids.add("");
        labels.add("不指定");
      }
      for (int i = 0; i < array.length(); i++) {
        JSONObject row = array.optJSONObject(i);
        if (row != null) {
          ids.add(str(row, idKey));
          labels.add(str(row, labelKey));
        } else {
          ids.add(array.optString(i));
          labels.add(array.optString(i));
        }
      }
      ArrayAdapter<String> adapter =
          new ArrayAdapter<>(a, android.R.layout.simple_spinner_item, labels);
      adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
      setAdapter(adapter);
      int index = ids.indexOf(selected);
      if (index >= 0) setSelection(index);
    }

    String value() {
      int i = getSelectedItemPosition();
      return i >= 0 && i < ids.size() ? ids.get(i) : "";
    }
  }

  static String value(EditText v) {
    return v.getText().toString();
  }

  static int number(EditText v) {
    return Integer.parseInt(value(v).trim());
  }

  interface Job {
    JSONObject run() throws Exception;
  }

  interface Done {
    void accept(JSONObject result) throws Exception;
  }

  void run(Job job, Done done) {
    if (busy) return;
    busy = true;
    progress.setVisibility(View.VISIBLE);
    status.setText("處理中…");
    int token = generation;
    ApiClient client = api();
    worker.execute(
        () -> {
          JSONObject result = null;
          Exception error = null;
          try {
            result = job.run();
          } catch (Exception e) {
            error = e;
          }
          JSONObject data = result;
          Exception failure = error;
          runOnUiThread(
              () -> {
                if (isDestroyed() || token != generation || api() != client) return;
                busy = false;
                progress.setVisibility(View.INVISIBLE);
                status.setText("");
                if (failure != null) {
                  error(failure);
                  return;
                }
                try {
                  done.accept(data);
                } catch (Exception e) {
                  error(e);
                }
              });
        });
  }

  void get(String path, Done done) {
    run(() -> api().request("GET", path, null), done);
  }

  void mutate(String method, String path, JSONObject body, Runnable after) {
    run(
        () -> api().request(method, path, body),
        r -> {
          if (after != null) after.run();
          else status.setText("已儲存");
        });
  }

  void error(Exception e) {
    status.setText(
        e instanceof NumberFormatException
            ? "請輸入有效整數。"
            : e.getMessage() == null ? "操作失敗，請稍後重試。" : e.getMessage());
  }

  void confirm(String message, Runnable action) {
    new AlertDialog.Builder(this)
        .setTitle("確認操作")
        .setMessage(message)
        .setNegativeButton("取消", null)
        .setPositiveButton("確認", (d, w) -> action.run())
        .show();
  }

  void copy(String text) {
    ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE))
        .setPrimaryClip(ClipData.newPlainText("LiuLianBot", text));
    status.setText("已複製");
  }

  void navigation() {
    Dialog dialog = new Dialog(this);
    ScrollView scroll = new ScrollView(this);
    LinearLayout list = new LinearLayout(this);
    list.setPadding(dp(18), dp(24), dp(18), dp(24));
    list.setOrientation(LinearLayout.VERTICAL);
    list.setBackgroundColor(CARD);
    scroll.addView(list);
    TextView brand = new TextView(this);
    brand.setText("LiuLianBot\nHome server console");
    brand.setTextColor(TEXT);
    brand.setTextSize(22);
    list.addView(brand);
    String[][] entries = {
      {"home", "工作台"},
      {"account", "帳戶"},
      {"roller", "R6 抽選"},
      {"events", "活動"},
      {"files", "檔案與資料夾"},
      {"share", "開啟分享"},
      {"remote", "遠端桌面與 SSH"},
      {"chromium", "Chromium 瀏覽器"},
      {"vless-tunnel", "VLESS Tunnel"},
      {"guilds", "Discord 伺服器"},
      {"admin", "管理台"},
      {"connections", "網站連線"},
      {"terms", "條款"},
      {"settings", "網站設定"}
    };
    for (String[] entry : entries) {
      String key = entry[0];
      boolean restricted =
          Arrays.asList(
                  "events",
                  "files",
                  "remote",
                  "chromium",
                  "vless-tunnel",
                  "guilds",
                  "connections",
                  "admin")
              .contains(key);
      if (restricted && !signedIn()) continue;
      if (key.equals("admin") && !admin()) continue;
      if (session.pages.has(key) && !session.pages.optBoolean(key)) continue;
      Button b = new Button(this);
      b.setText(entry[1]);
      b.setAllCaps(false);
      b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
      b.setTextColor(TEXT);
      b.setOnClickListener(
          v -> {
            dialog.dismiss();
            navigate(key);
          });
      list.addView(b);
    }
    dialog.setContentView(scroll);
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawableResource(android.R.color.transparent);
      window.setLayout(dp(280), -1);
      window.setGravity(Gravity.START);
    }
    dialog.show();
    if (window != null) window.setLayout(dp(280), -1);
  }

  void navigate(String route) {
    if (busy) return;
    if (!current.equals(route)) history.push(current);
    current = route;
    switch (route) {
      case "settings":
        settings();
        break;
      case "account":
        new AccountScreen(this).show();
        break;
      case "terms":
        new AccountScreen(this).terms();
        break;
      case "roller":
        new CommunityScreen(this).roller();
        break;
      case "events":
        new CommunityScreen(this).events();
        break;
      case "guilds":
        new CommunityScreen(this).guilds();
        break;
      case "files":
        files.show("");
        break;
      case "share":
        files.openShare();
        break;
      case "admin":
        new AdminScreen(this).show();
        break;
      case "remote":
        remote.show();
        break;
      case "chromium":
        remote.chromium();
        break;
      case "vless-tunnel":
        remote.vless();
        break;
      case "connections":
        connections();
        break;
      default:
        home();
    }
  }

  @Override
  public void onBackPressed() {
    if (busy) {
      status.setText("操作尚未完成，請稍候。");
      return;
    }
    if (!history.isEmpty()) {
      String next = history.pop();
      current = next;
      navigate(next);
    } else if (!current.equals("home")) {
      current = "home";
      home();
    } else super.onBackPressed();
  }

  void home() {
    current = "home";
    screen("工作台", "Home server console · 原生 Android");
    card("連線狀態");
    text(api().server, 14);
    button("重新整理", this::home);
    button("網站設定", () -> navigate("settings"));
    run(
        () -> {
          JSONObject me = api().request("GET", "auth/me", null);
          me.put("pages", api().request("GET", "page-visibility", null).getJSONObject("pages"));
          return me;
        },
        r -> {
          session.user = r.optBoolean("loggedIn") ? r.getJSONObject("user") : new JSONObject();
          session.pages = r.getJSONObject("pages");
          card(signedIn() ? "歡迎回來，" + str(session.user, "username") : "歡迎使用 LiuLianBot");
          text(signedIn() ? "使用側欄存取你的服務與工作區。" : "登入後即可使用你的活動、檔案與遠端工作區。", 16);
          button(signedIn() ? "帳戶設定" : "登入／註冊", () -> navigate("account"));
          if (session.pages.optBoolean("roller")) {
            card("Rainbow Six Siege");
            text("隨機選擇幹員、裝備與地圖。", 15);
            button("開始抽選", () -> navigate("roller"));
          }
          if (signedIn()) {
            card("你的工作區");
            button("檔案與資料夾", () -> navigate("files"));
            if (session.pages.optBoolean("events")) button("社群活動", () -> navigate("events"));
            button("Discord 伺服器", () -> navigate("guilds"));
            if (admin()) button("管理台", () -> navigate("admin"));
          }
        });
  }

  void settings() {
    screen("網站設定", "HTTPS 連線 · 可選擇加密保存登入狀態");
    card("網站網址");
    EditText server = field("HTTPS 根網址", api().server, false);
    button(
        "儲存並連接",
        () -> {
          ApiClient candidate = new ApiClient(value(server));
          run(
              () -> candidate.request("GET", "auth/me", null),
              r -> {
                api().clearSession();
                session.api = candidate;
                session.attach(candidate);
                session.user = new JSONObject();
                session.pages = new JSONObject();
                getSharedPreferences("settings", MODE_PRIVATE)
                    .edit()
                    .putString("server", candidate.server)
                    .apply();
                home();
              });
        });
    button(
        "檢查完整原生 API",
        () ->
            get(
                "mobile/capabilities",
                r -> {
                  card("API 版本 " + r.optInt("apiVersion"));
                  JSONObject groups = r.getJSONObject("http");
                  Iterator<String> keys = groups.keys();
                  while (keys.hasNext()) {
                    String key = keys.next();
                    text(key + " · " + groups.getJSONArray(key).length() + " 個操作", 14);
                  }
                }));
  }

  void connections() {
    screen("網站連線", "依帳戶權限列出服務；本站功能可直接從側欄使用。");
    get(
        "connections",
        r -> {
          JSONArray items = r.getJSONArray("connections");
          if (items.length() == 0) text("目前沒有可存取的連線。", 16);
          for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            card(str(item, "name"));
            text(str(item, "description"), 15);
            button(
                "服務資訊",
                () ->
                    get(
                        "mobile/connections/" + enc(str(item, "slug")),
                        data -> {
                          new AlertDialog.Builder(this)
                              .setTitle(str(item, "name"))
                              .setMessage("此項目是第三方網站代理。目前未提供該服務的原生 API 整合。本站的檔案、遠端、管理與帳戶功能已在側欄提供。")
                              .setPositiveButton("知道了", null)
                              .show();
                        }));
          }
        });
  }

  static final class Download {
    final String method, path;
    final JSONObject body;

    Download(String m, String p, JSONObject b) {
      method = m;
      path = p;
      body = b;
    }
  }

  void save(String name, String mime, String method, String path, JSONObject body) {
    pendingDownload = new Download(method, path, body);
    localDownload = null;
    pickSave(name, mime);
  }

  void saveText(String name, String text) {
    pendingDownload = null;
    localDownload = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    pickSave(name, "text/plain");
  }

  private void pickSave(String name, String mime) {
    Intent intent =
        new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mime)
            .putExtra(Intent.EXTRA_TITLE, name);
    try {
      startActivityForResult(intent, 20);
    } catch (ActivityNotFoundException e) {
      error(e);
    }
  }

  void pickUpload(String path) {
    uploadPath = path;
    Intent i =
        new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*");
    try {
      startActivityForResult(i, 21);
    } catch (ActivityNotFoundException e) {
      error(e);
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (result != RESULT_OK || data == null || data.getData() == null) {
      pendingDownload = null;
      localDownload = null;
      return;
    }
    Uri uri = data.getData();
    if (request == 20) {
      Download job = pendingDownload;
      byte[] bytes = localDownload;
      pendingDownload = null;
      localDownload = null;
      if (job == null && bytes == null) {
        status.setText("畫面已重建，請重新選擇下載。");
        return;
      }
      ApiClient client = api();
      run(
          () -> {
            try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
              if (out == null) throw new IOException("無法寫入檔案");
              if (bytes != null) out.write(bytes);
              else client.download(job.method, job.path, job.body, out);
            } catch (Exception e) {
              try {
                android.provider.DocumentsContract.deleteDocument(getContentResolver(), uri);
              } catch (Exception ignored) {
              }
              throw e;
            }
            return obj();
          },
          r -> status.setText("下載完成"));
    }
    if (request == 21) {
      String path = uploadPath;
      if (path == null) {
        status.setText("請重新選擇上傳位置。");
        return;
      }
      uploadPath = null;
      ApiClient client = api();
      run(
          () -> {
            client.upload(path, () -> getContentResolver().openInputStream(uri));
            return obj();
          },
          r -> {
            status.setText("上傳完成");
          });
    }
  }

  @Override
  protected void onStop() {
    super.onStop();
    if (remote != null && (remote.websocket != null || remote.rdpSocket != null)) {
      remote.close();
      if (status != null) status.setText(R.string.remote_background_closed);
    }
  }

  @Override
  protected void onDestroy() {
    if (cleanup != null) cleanup.run();
    generation++;
    worker.shutdownNow();
    super.onDestroy();
  }
}
