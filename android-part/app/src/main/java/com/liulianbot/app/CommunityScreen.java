package com.liulianbot.app;

import static com.liulianbot.app.MainActivity.*;

import android.widget.*;
import java.util.*;
import org.json.*;

final class CommunityScreen {
  final MainActivity a;

  CommunityScreen(MainActivity a) {
    this.a = a;
  }

  void roller() {
    a.screen("R6 Roller", "隨機幹員、武器、裝備與地圖");
    a.card("開始抽選");
    TextView result = a.text("選擇進攻方、防守方或地圖。", 20);
    a.button("進攻方", () -> roll("operator?side=att", result));
    a.button("防守方", () -> roll("operator?side=def", result));
    a.button("地圖", () -> roll("map", result));
    a.button("幹員資料庫", this::operators);
  }

  void roll(String route, TextView output) {
    a.get(
        "roller/" + route,
        r -> {
          StringBuilder text = new StringBuilder(str(r, "name"));
          String[][] fields = {
            {"side", "陣營"},
            {"primary", "主武器"},
            {"secondary", "副武器"},
            {"gadget", "裝備"},
            {"location", "地點"},
            {"playlist", "列表"},
            {"gameMode", "模式"}
          };
          for (String[] f : fields)
            if (r.has(f[0])) text.append("\n").append(f[1]).append("：").append(str(r, f[0]));
          output.setText(text);
        });
  }

  void operators() {
    a.screen("幹員資料庫", "Rainbow Six Siege");
    a.get(
        "roller/operators",
        r -> {
          for (String side : new String[] {"Att", "Def"}) {
            JSONObject group = r.optJSONObject(side);
            if (group == null) continue;
            Iterator<String> keys = group.keys();
            while (keys.hasNext()) {
              String name = keys.next();
              JSONObject op = group.getJSONObject(name);
              a.card(name + " · " + side);
              JSONObject weapons = op.optJSONObject("weapon");
              if (weapons != null)
                for (String key : new String[] {"primary", "secondary", "gadget"}) {
                  JSONArray values = weapons.optJSONArray(key);
                  if (values != null) {
                    List<String> names = new ArrayList<>();
                    for (int i = 0; i < values.length(); i++) names.add(values.optString(i));
                    a.text(String.join(" · ", names), 14);
                  }
                }
            }
          }
        });
  }

  void events() {
    a.screen("社群活動", "查看活動、參加名單與報名狀態");
    if (a.admin()) a.button("建立活動", this::createEvent);
    a.button("重新整理", this::events);
    a.get(
        "events",
        r -> {
          JSONArray items = r.getJSONArray("events");
          if (items.length() == 0) a.text("目前沒有可報名活動。", 16);
          for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            a.card(str(item, "title"));
            a.text(str(item, "description"), 16);
            a.text(
                str(item, "guild_name")
                    + "\n"
                    + str(item, "start_at")
                    + "\n"
                    + item.optInt("participant_count")
                    + " / "
                    + item.optInt("max_players")
                    + " 人",
                14);
            String id = enc(str(item, "id"));
            a.button("參加名單", () -> participants(id));
            boolean joined = flag(item, "joined");
            a.button(
                joined ? "取消報名" : "報名",
                () ->
                    a.mutate(
                        "POST",
                        "events/" + id + (joined ? "/leave" : "/join"),
                        obj(),
                        this::events));
          }
        });
  }

  void participants(String id) {
    a.screen("參加名單", "活動成員");
    a.get(
        "events/" + id + "/participants",
        r -> {
          JSONArray list = r.getJSONArray("participants");
          if (list.length() == 0) a.text("尚無報名者。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject p = list.getJSONObject(i);
            a.card(str(p, "username"));
            a.text(str(p, "discord_user_id"), 14);
          }
        });
  }

  void createEvent() {
    a.screen("建立活動", "選擇 Discord 伺服器；需要管理員身份及已連結 Discord");
    a.get(
        "admin/announcement-targets",
        r -> {
          JSONArray guilds = r.getJSONArray("guilds");
          if (guilds.length() == 0) a.text("沒有可用的 Discord 伺服器。", 16);
          for (int i = 0; i < guilds.length(); i++) {
            JSONObject guild = guilds.getJSONObject(i);
            a.button(str(guild, "guild_name"), () -> eventForm(guild));
          }
        });
  }

  void eventForm(JSONObject guild) {
    a.screen("建立活動", str(guild, "guild_name"));
    a.card("活動資料");
    MainActivity.Choice channel =
        a.choice(
            "通知頻道（可選）", guild.optJSONArray("channels"), "channel_id", "channel_name", "", true);
    EditText title = a.field("活動標題", "", false),
        description = a.multiline("活動說明", "", false),
        mode = a.field("遊戲模式", "", false),
        start = a.dateTime("開始時間"),
        max = a.field("人數上限（2–99）", "10", false);
    a.button(
        "建立",
        () ->
            a.mutate(
                "POST",
                "events",
                obj(
                    "guildId",
                    str(guild, "guild_id"),
                    "channelId",
                    channel.value().isEmpty() ? JSONObject.NULL : channel.value(),
                    "title",
                    value(title),
                    "description",
                    value(description),
                    "mode",
                    value(mode),
                    "startAt",
                    value(start),
                    "maxPlayers",
                    number(max)),
                this::events));
  }

  void guilds() {
    a.screen("Discord 伺服器", "管理你有權限的伺服器設定");
    a.get(
        "guild-manager/guilds",
        r -> {
          JSONArray list = r.getJSONArray("guilds");
          if (list.length() == 0) a.text("沒有可管理的伺服器。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject g = list.getJSONObject(i);
            a.card(str(g, "guild_name"));
            a.button("伺服器設定", () -> guild(str(g, "guild_id")));
          }
        });
  }

  void guild(String id) {
    a.screen("Discord 設定", "語言、事件紀錄與私人語音頻道");
    a.get(
        "guild-manager/guilds/" + enc(id),
        r -> {
          JSONObject g = r.getJSONObject("guild");
          a.card(str(g, "guild_name"));
          MainActivity.Choice lang =
              a.choice("語言", r.getJSONArray("languages"), "", "", str(g, "language"), false);
          JSONArray channels = g.getJSONArray("channels"),
              voice = new JSONArray(),
              text = new JSONArray();
          for (int i = 0; i < channels.length(); i++) {
            JSONObject ch = channels.getJSONObject(i);
            if (str(ch, "channel_type").equals("voice")) voice.put(ch);
            if (str(ch, "channel_type").equals("text")) text.put(ch);
          }
          MainActivity.Choice trigger =
              a.choice(
                  "私人語音觸發頻道",
                  voice,
                  "channel_id",
                  "channel_name",
                  str(g, "private_voice_trigger_channel_id"),
                  true);
          JSONArray types = r.getJSONArray("logTypes");
          JSONObject settings = g.optJSONObject("log_channels");
          Map<String, MainActivity.Choice> logs = new LinkedHashMap<>();
          for (int i = 0; i < types.length(); i++) {
            String type = types.getString(i);
            String selected = settings == null ? "" : str(settings, type);
            if (type.equals("all") && selected.isEmpty())
              selected = str(g, "fallback_log_channel_id");
            logs.put(
                type,
                a.choice("事件紀錄 · " + type, text, "channel_id", "channel_name", selected, true));
          }
          a.button(
              "儲存設定",
              () -> {
                JSONObject logValues = obj();
                for (Map.Entry<String, MainActivity.Choice> e : logs.entrySet())
                  if (!e.getValue().value().isEmpty()) {
                    try {
                      logValues.put(e.getKey(), e.getValue().value());
                    } catch (Exception error) {
                      a.error(error);
                      return;
                    }
                  }
                a.mutate(
                    "PUT",
                    "guild-manager/guilds/" + enc(id),
                    obj(
                        "language",
                        lang.value(),
                        "log_channels",
                        logValues,
                        "private_voice_trigger_channel_id",
                        trigger.value().isEmpty() ? JSONObject.NULL : trigger.value()),
                    () -> guild(id));
              });
        });
  }
}
