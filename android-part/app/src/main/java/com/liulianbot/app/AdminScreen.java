package com.liulianbot.app;

import static com.liulianbot.app.MainActivity.*;

import android.widget.*;
import java.util.*;
import org.json.*;

final class AdminScreen {
  final MainActivity a;

  AdminScreen(MainActivity a) {
    this.a = a;
  }

  void show() {
    a.screen("管理台", "Users · Groups · Connections · Discord");
    a.card("網站管理");
    a.button("使用者", this::users);
    a.button("群組", this::groups);
    a.button("網站連線", this::connections);
    a.button("頁面可見度", this::visibility);
    a.card("社群管理");
    a.button("Discord 伺服器資訊", this::guilds);
    a.button("活動可見度", this::events);
    a.button("排程公告", this::announcements);
    a.button("使用統計", this::stats);
  }

  static final class Selection {
    final LinkedHashMap<String, CheckBox> entries = new LinkedHashMap<>();
    final boolean numeric;

    Selection(boolean n) {
      numeric = n;
    }

    JSONArray ids() {
      JSONArray result = new JSONArray();
      for (Map.Entry<String, CheckBox> row : entries.entrySet())
        if (row.getValue().isChecked())
          result.put(numeric ? Integer.parseInt(row.getKey()) : row.getKey());
      return result;
    }
  }

  Selection select(
      String title, JSONArray choices, String label, JSONArray selected, boolean numeric) {
    a.text(title, 16);
    Selection s = new Selection(numeric);
    Set<String> ids = new HashSet<>();
    if (selected != null)
      for (int i = 0; i < selected.length(); i++) {
        JSONObject o = selected.optJSONObject(i);
        ids.add(o == null ? selected.optString(i) : str(o, "id"));
      }
    for (int i = 0; i < choices.length(); i++) {
      JSONObject row = choices.optJSONObject(i);
      if (row != null) {
        String id = str(row, "id");
        s.entries.put(id, a.check(str(row, label), ids.contains(id)));
      }
    }
    return s;
  }

  void users() {
    a.screen("使用者管理", "編輯群組及移除帳戶");
    a.get(
        "admin/users",
        r -> {
          JSONArray users = r.getJSONArray("users");
          for (int i = 0; i < users.length(); i++) {
            JSONObject u = users.getJSONObject(i);
            a.card(str(u, "username"));
            a.text("建立於：" + str(u, "created_at"), 14);
            a.button("編輯群組", () -> user(u));
            if (!str(u, "id").equals(str(a.session.user, "id")))
              a.button(
                  "刪除帳戶",
                  () ->
                      a.confirm(
                          "永久刪除帳戶「" + str(u, "username") + "」？",
                          () ->
                              a.mutate(
                                  "DELETE",
                                  "admin/users/" + enc(str(u, "id")),
                                  null,
                                  this::users)));
          }
        });
  }

  void user(JSONObject user) {
    a.screen("使用者群組", str(user, "username"));
    a.get(
        "admin/groups",
        r -> {
          a.card("所屬群組");
          Selection roles =
              select(
                  "至少選擇一個群組",
                  r.getJSONArray("groups"),
                  "name",
                  user.optJSONArray("role_ids"),
                  true);
          a.button(
              "儲存",
              () ->
                  a.mutate(
                      "PUT",
                      "admin/users/" + enc(str(user, "id")),
                      obj("role_ids", roles.ids()),
                      this::users));
        });
  }

  void groups() {
    a.screen("群組管理", "分配網站功能及連線存取權");
    a.button("新增群組", () -> group(obj()));
    a.get(
        "admin/groups",
        r -> {
          JSONArray groups = r.getJSONArray("groups");
          for (int i = 0; i < groups.length(); i++) {
            JSONObject g = groups.getJSONObject(i);
            a.card(str(g, "name"));
            a.text(str(g, "description") + "\n成員：" + g.optInt("user_count"), 14);
            a.button("編輯", () -> group(g));
            if (!str(g, "name").equals("admin"))
              a.button(
                  "刪除",
                  () ->
                      a.confirm(
                          "刪除「" + str(g, "name") + "」？仍有成員的群組無法刪除。",
                          () ->
                              a.mutate(
                                  "DELETE",
                                  "admin/groups/" + enc(str(g, "id")),
                                  null,
                                  this::groups)));
          }
        });
  }

  void group(JSONObject group) {
    boolean fresh = !group.has("id");
    a.screen(fresh ? "新增群組" : "編輯群組", "群組名稱與說明");
    a.card("群組資料");
    EditText name = a.field("名稱", str(group, "name"), false),
        description = a.multiline("說明", str(group, "description"), false);
    a.button(
        "儲存",
        () ->
            a.mutate(
                fresh ? "POST" : "PUT",
                "admin/groups" + (fresh ? "" : "/" + enc(str(group, "id"))),
                obj("name", value(name), "description", value(description)),
                this::groups));
  }

  void connections() {
    a.screen("網站連線管理", "設定代理服務及授權名單");
    a.button("新增連線", () -> connection(obj()));
    a.get(
        "admin/connections",
        r -> {
          JSONArray items = r.getJSONArray("connections");
          for (int i = 0; i < items.length(); i++) {
            JSONObject c = items.getJSONObject(i);
            a.card(str(c, "name"));
            a.text(str(c, "target_url"), 14);
            a.text((flag(c, "enabled") ? "啟用" : "停用") + (flag(c, "hidden") ? " · 隱藏" : ""), 14);
            a.button("編輯連線", () -> connection(c));
            a.button(
                "刪除連線",
                () ->
                    a.confirm(
                        "刪除此連線設定？",
                        () ->
                            a.mutate(
                                "DELETE",
                                "admin/connections/" + enc(str(c, "id")),
                                null,
                                this::connections)));
          }
        });
  }

  void connection(JSONObject c) {
    boolean fresh = !c.has("id");
    a.screen(fresh ? "新增連線" : "編輯連線", "此設定控制網站代理，第三方原生整合仍需該服務 API");
    a.run(
        () ->
            obj(
                "groups",
                a.api().request("GET", "admin/groups", null).getJSONArray("groups"),
                "users",
                a.api().request("GET", "admin/users", null).getJSONArray("users")),
        r -> {
          a.card("連線資料");
          EditText name = a.field("名稱", str(c, "name"), false),
              slug = a.field("網址代稱（小寫英數及連字符）", str(c, "slug"), false),
              url = a.field("目標網址", str(c, "target_url"), false),
              description = a.multiline("說明", str(c, "description"), false);
          CheckBox enabled = a.check("啟用", fresh || flag(c, "enabled")),
              hidden = a.check("隱藏導覽項目", flag(c, "hidden")),
              legacy = a.check("舊版代理路由相容", flag(c, "legacy_proxy_routing"));
          Selection
              groups =
                  select("可存取群組", r.getJSONArray("groups"), "name", c.optJSONArray("roles"), true),
              users =
                  select(
                      "指定使用者", r.getJSONArray("users"), "username", c.optJSONArray("users"), false);
          a.button(
              "儲存",
              () ->
                  a.mutate(
                      fresh ? "POST" : "PUT",
                      "admin/connections" + (fresh ? "" : "/" + enc(str(c, "id"))),
                      obj(
                          "name",
                          value(name),
                          "slug",
                          value(slug),
                          "target_url",
                          value(url),
                          "description",
                          value(description),
                          "enabled",
                          enabled.isChecked(),
                          "hidden",
                          hidden.isChecked(),
                          "legacy_proxy_routing",
                          legacy.isChecked(),
                          "role_ids",
                          groups.ids(),
                          "user_ids",
                          users.ids()),
                      this::connections));
        });
  }

  void visibility() {
    a.screen("頁面可見度", "訪客、登入使用者、群組與個別使用者");
    a.get(
        "admin/page-visibility",
        r -> {
          JSONArray pages = r.getJSONArray("pages");
          for (int i = 0; i < pages.length(); i++) {
            JSONObject p = pages.getJSONObject(i);
            a.card(str(p, "name"));
            a.button("編輯可見度", () -> visibilityPage(p, r));
          }
        });
  }

  void visibilityPage(JSONObject p, JSONObject data) {
    a.screen("頁面可見度", str(p, "name"));
    a.card("可見對象");
    CheckBox guests = a.check("所有訪客", flag(p, "public_access")),
        signed = a.check("所有登入使用者", flag(p, "authenticated_access"));
    Selection
        groups =
            select("指定群組", data.optJSONArray("groups"), "name", p.optJSONArray("role_ids"), true),
        users =
            select(
                "指定使用者", data.optJSONArray("users"), "username", p.optJSONArray("user_ids"), false);
    a.button(
        "儲存",
        () ->
            a.mutate(
                "PUT",
                "admin/page-visibility/" + enc(str(p, "key")),
                obj(
                    "public_access",
                    guests.isChecked(),
                    "authenticated_access",
                    signed.isChecked(),
                    "role_ids",
                    groups.ids(),
                    "user_ids",
                    users.ids()),
                this::visibility));
  }

  void events() {
    a.screen("活動管理", "顯示或隱藏社群活動");
    a.get(
        "admin/events",
        r -> {
          JSONArray events = r.getJSONArray("events");
          for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.getJSONObject(i);
            a.card(str(e, "title"));
            a.text(str(e, "guild_name") + "\n" + str(e, "start_at") + " · " + str(e, "status"), 14);
            boolean visible = flag(e, "visible");
            a.button(
                visible ? "隱藏活動" : "顯示活動",
                () ->
                    a.mutate(
                        "PUT",
                        "admin/events/" + enc(str(e, "id")) + "/visibility",
                        obj("visible", !visible),
                        this::events));
          }
        });
  }

  void announcements() {
    a.screen("排程公告", "建立 Discord 公告或取消尚未發送的排程");
    a.button("新增公告", this::announcementTargets);
    a.get(
        "admin/announcements",
        r -> {
          JSONArray list = r.getJSONArray("announcements");
          if (list.length() == 0) a.text("尚無公告。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject n = list.getJSONObject(i);
            a.card(str(n, "scheduled_at"));
            a.text(str(n, "content"), 16);
            a.text("狀態：" + str(n, "status"), 14);
            a.button(
                "取消排程",
                () ->
                    a.confirm(
                        "取消這則公告的排程？",
                        () ->
                            a.mutate(
                                "DELETE",
                                "admin/announcements/" + enc(str(n, "id")),
                                null,
                                this::announcements)));
          }
        });
  }

  void announcementTargets() {
    a.screen("公告目標", "選擇 Discord 伺服器");
    a.get(
        "admin/announcement-targets",
        r -> {
          JSONArray guilds = r.getJSONArray("guilds");
          for (int i = 0; i < guilds.length(); i++) {
            JSONObject g = guilds.getJSONObject(i);
            a.button(str(g, "guild_name"), () -> announcement(g));
          }
        });
  }

  void announcement(JSONObject guild) {
    a.screen("建立公告", str(guild, "guild_name"));
    a.card("公告內容");
    MainActivity.Choice channel =
        a.choice("頻道", guild.optJSONArray("channels"), "channel_id", "channel_name", "", false);
    EditText content = a.multiline("內容（最多 2000 字元）", "", false), when = a.dateTime("發送時間");
    a.button(
        "建立排程",
        () ->
            a.confirm(
                "將此公告排程發送至選擇的 Discord 頻道？",
                () ->
                    a.mutate(
                        "POST",
                        "admin/announcements",
                        obj(
                            "guildId",
                            str(guild, "guild_id"),
                            "channelId",
                            channel.value(),
                            "content",
                            value(content),
                            "scheduledAt",
                            value(when)),
                        this::announcements)));
  }

  void stats() {
    a.screen("使用統計", "最近 30 日 Discord 活動");
    a.get(
        "admin/stats",
        r -> {
          JSONArray list = r.getJSONArray("stats");
          if (list.length() == 0) a.text("目前沒有統計資料。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.getJSONObject(i);
            a.card("伺服器 " + str(s, "guild_id"));
            a.text(
                "指令使用："
                    + str(s, "command_count")
                    + "\n語音加入："
                    + str(s, "voice_joins")
                    + "\n最後記錄："
                    + str(s, "last_day"),
                16);
          }
        });
  }

  void guilds() {
    a.screen("Discord 伺服器資訊", "伺服器、頻道與設定摘要");
    a.get(
        "admin/guilds",
        r -> {
          JSONArray list = r.getJSONArray("guilds");
          for (int i = 0; i < list.length(); i++) {
            JSONObject g = list.getJSONObject(i);
            a.card(str(g, "guild_name"));
            a.text(
                "語言："
                    + str(g, "language")
                    + "\n管理員："
                    + g.optInt("admin_count")
                    + " · 語音頻道："
                    + g.optInt("voice_channel_count"),
                14);
            a.button("查看詳情", () -> guild(str(g, "guild_id")));
          }
        });
  }

  void guild(String id) {
    a.screen("伺服器詳情", id);
    a.get(
        "admin/guilds/" + enc(id),
        r -> {
          JSONObject g = r.getJSONObject("guild");
          a.card(str(g, "guild_name"));
          a.text(
              "語言："
                  + str(g, "language")
                  + "\n紀錄頻道："
                  + str(g, "log_channel_id")
                  + "\n抽選頻道："
                  + str(g, "roller_channel_id"),
              16);
          JSONArray admins = g.optJSONArray("admin_ids");
          if (admins != null)
            for (int i = 0; i < admins.length(); i++) a.text("管理員：" + admins.optString(i), 14);
          JSONArray voices = g.optJSONArray("voice_channels");
          if (voices != null)
            for (int i = 0; i < voices.length(); i++) {
              JSONObject v = voices.getJSONObject(i);
              a.card("語音 " + str(v, "channel_id"));
              a.text("擁有者：" + str(v, "owner_id") + "\n建立：" + str(v, "created_at"), 14);
            }
        });
  }
}
