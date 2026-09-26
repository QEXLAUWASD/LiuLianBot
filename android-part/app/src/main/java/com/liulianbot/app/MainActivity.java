package com.liulianbot.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private ApiClient api;
    private LinearLayout content;
    private TextView status;
    private boolean busy;
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String server = getPreferences(MODE_PRIVATE).getString("server", "");
        if (!server.isEmpty()) api = new ApiClient(server);
        settings();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void screen(String title) {
        generation++;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(12), dp(20), dp(12));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(20), dp(12) + insets.getSystemWindowInsetTop(), dp(20), dp(12) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        status = new TextView(this);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(status);
        LinearLayout nav = new LinearLayout(this);
        String[] labels = {"設定", "帳戶", "R6", "活動", "連線"};
        Runnable[] actions = {this::settings, this::account, this::roller, this::events, this::connections};
        for (int i = 0; i < labels.length; i++) {
            Button button = new Button(this);
            button.setText(labels[i]);
            button.setTextSize(12);
            button.setPadding(0, 0, 0, 0);
            final Runnable action = actions[i];
            button.setOnClickListener(v -> { if (!busy) action.run(); });
            nav.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
        }
        root.addView(nav);
        setContentView(root);
        root.requestApplyInsets();
        text(title, 26);
    }
    private void text(String value, int size) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setPadding(0, dp(10), 0, dp(10));
        view.setTextIsSelectable(true);
        content.addView(view);
    }
    private EditText input(String hint, boolean password) {
        EditText view = new EditText(this);
        view.setHint(hint);
        view.setContentDescription(hint);
        view.setSingleLine(true);
        view.setInputType(password ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        if (password) { view.setSaveEnabled(false); view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); }
        content.addView(view);
        return view;
    }
    private void button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(v -> { if (!busy) action.run(); });
        content.addView(button, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
    }
    private interface Job { JSONObject run() throws Exception; }
    private interface Done { void accept(JSONObject value) throws Exception; }
    private void call(Job job, Done done) {
        if (busy) return;
        busy = true;
        status.setText("連線中…");
        final int current = generation;
        worker.execute(() -> {
            JSONObject result = null;
            Exception failure = null;
            try { result = job.run(); } catch (Exception e) { failure = e; }
            final JSONObject value = result;
            final Exception error = failure;
            runOnUiThread(() -> {
                busy = false;
                if (isDestroyed() || current != generation) return;
                status.setText("");
                if (error != null) { status.setText(error.getMessage() == null ? "連線失敗，請檢查網絡後重試。" : error.getMessage()); return; }
                try { done.accept(value); } catch (Exception e) { status.setText("無法讀取網站資料，請重新整理。"); }
            });
        });
    }
    private boolean configured() {
        if (api != null) return true;
        settings(); status.setText("請先設定網站網址。"); return false;
    }
    private void settings() {
        screen("LiuLianBot · 網站設定");
        text("連接你的 LiuLianBot 網站，使用原生手機介面。", 16);
        EditText url = input("https://你的網站", false);
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        if (api != null) url.setText(api.server);
        button("儲存並連接", () -> {
            try {
                ApiClient candidate = new ApiClient(url.getText().toString());
                call(() -> candidate.request("GET", "auth/me", null), result -> {
                    if (api != null) api.clearSession();
                    api = candidate;
                    getPreferences(MODE_PRIVATE).edit().putString("server", api.server).apply();
                    account();
                });
            } catch (IllegalArgumentException e) { status.setText(e.getMessage()); }
        });
        text("只儲存網站網址。密碼與登入 session 不寫入裝置儲存空間；App 重啟後需重新登入。", 14);
    }
    private void account() {
        if (!configured()) return;
        screen("帳戶");
        button("重新整理", this::account);
        call(() -> api.request("GET", "auth/me", null), result -> {
            if (result.optBoolean("loggedIn")) {
                JSONObject user = result.getJSONObject("user");
                text(user.optString("username"), 22);
                text("身份：" + user.optString("role"), 16);
                if (!user.optBoolean("termsAccepted")) {
                    text("此帳戶尚未接受網站條款，部分功能可能受到限制。", 16);
                    button("在網站閱讀與接受條款", () -> open("/terms.html"));
                }
                button("登出", () -> call(() -> api.request("POST", "auth/logout", new JSONObject()), ignored -> {
                    api.clearSession(); account();
                }));
            } else {
                EditText username = input("使用者名稱", false);
                EditText password = input("密碼", true);
                button("登入", () -> {
                    String name = username.getText().toString().trim();
                    String secret = password.getText().toString();
                    if (name.isEmpty() || secret.isEmpty()) { status.setText("請輸入使用者名稱及密碼。"); return; }
                    password.setText("");
                    call(() -> api.request("POST", "auth/login", new JSONObject().put("username", name)
                            .put("password", secret).put("remember", false)), ignored -> account());
                });
                button("在網站註冊", () -> open("/login.html"));
            }
        });
    }
    private void roller() {
        if (!configured()) return;
        screen("R6 隨機抽選");
        call(() -> api.request("GET", "page-visibility", null), visibility -> {
            if (!visibility.getJSONObject("pages").optBoolean("roller")) { text("此帳戶無法查看 R6 頁面。", 16); return; }
            TextView result = new TextView(this);
            result.setTextSize(20);
            button("抽進攻方幹員", () -> roll("operator?side=att", result));
            button("抽防守方幹員", () -> roll("operator?side=def", result));
            button("抽地圖", () -> roll("map", result));
            content.addView(result);
        });
    }
    private void roll(String path, TextView output) {
        call(() -> api.request("GET", "roller/" + path, null), result -> {
            StringBuilder value = new StringBuilder(result.optString("name"));
            String[] keys = {"side", "primary", "secondary", "gadget", "location", "playlist", "gameMode"};
            String[] labels = {"陣營", "主武器", "副武器", "裝備", "地點", "模式列表", "遊戲模式"};
            for (int i = 0; i < keys.length; i++) if (result.has(keys[i])) value.append("\n").append(labels[i]).append("：").append(result.optString(keys[i]));
            output.setText(value.toString());
        });
    }
    private void events() {
        if (!configured()) return;
        screen("社群活動");
        button("重新整理", this::events);
        call(() -> {
            JSONObject visibility = api.request("GET", "page-visibility", null);
            if (!visibility.getJSONObject("pages").optBoolean("events")) throw new Exception("請登入具有活動頁面權限的帳戶。");
            return api.request("GET", "events", null);
        }, result -> {
            JSONArray events = result.getJSONArray("events");
            if (events.length() == 0) text("目前沒有可報名的活動。", 16);
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                text(event.optString("title"), 22);
                text(event.optString("description") + "\n" + event.optString("guild_name") + "\n"
                        + event.optString("start_at") + "\n人數：" + event.optInt("participant_count") + "/" + event.optInt("max_players"), 16);
                String id = Uri.encode(event.getString("id"));
                boolean joined = event.optBoolean("joined") || event.optInt("joined", 0) == 1;
                button(joined ? "取消報名" : "報名", () -> call(() -> api.request("POST", "events/" + id + (joined ? "/leave" : "/join"), new JSONObject()), ignored -> events()));
            }
        });
    }
    private void connections() {
        if (!configured()) return;
        screen("網站連線");
        text("連線服務以瀏覽器開啟。瀏覽器使用獨立登入狀態，首次使用請先登入網站，再返回 App 開啟連線。", 16);
        button("在瀏覽器登入網站", () -> open("/login.html"));
        button("重新整理", this::connections);
        call(() -> api.request("GET", "connections", null), result -> {
            JSONArray connections = result.getJSONArray("connections");
            if (connections.length() == 0) text("目前沒有可存取的連線。", 16);
            for (int i = 0; i < connections.length(); i++) {
                JSONObject item = connections.getJSONObject(i);
                text(item.optString("description"), 16);
                String slug = item.getString("slug");
                button(item.getString("name"), () -> open("/api/mobile/connect/" + Uri.encode(slug)));
            }
        });
    }
    private void open(String path) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(api.server + path))); }
        catch (android.content.ActivityNotFoundException e) { status.setText("裝置未安裝可開啟網站的瀏覽器。"); }
    }
    @Override protected void onDestroy() {
        generation++;
        worker.shutdownNow();
        super.onDestroy();
    }
}
