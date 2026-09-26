package com.liulianbot.app;

import static com.liulianbot.app.MainActivity.*;

import android.widget.*;
import java.util.*;
import org.json.*;

final class FilesScreen {
  final MainActivity a;
  JSONObject access = obj();

  FilesScreen(MainActivity a) {
    this.a = a;
  }

  static String join(String base, String name) {
    return base.isEmpty() ? name : base + "/" + name;
  }

  static String parent(String path) {
    int at = path.lastIndexOf('/');
    return at < 0 ? "" : path.substring(0, at);
  }

  void show(String path) {
    a.screen("檔案與資料夾", path.isEmpty() ? "FnOS · 儲存磁碟" : "FnOS / " + path);
    a.run(
        () -> {
          JSONObject permissions = a.api().request("GET", "files/access", null);
          JSONObject result = obj("access", permissions);
          if (permissions.optBoolean("read"))
            result.put("listing", a.api().request("GET", "files/list?path=" + enc(path), null));
          return result;
        },
        r -> {
          access = r.getJSONObject("access");
          a.card("檔案工具");
          a.button("重新整理", () -> show(path));
          if (!path.isEmpty()) a.button("上一層", () -> show(parent(path)));
          if (access.optBoolean("owner")) a.button("使用者權限", this::permissions);
          if (!access.optBoolean("read")) {
            a.text(access.optBoolean("requested") ? "已申請，等待擁有者核准。" : "尚未取得檔案權限。", 16);
            a.button(
                "申請存取權", () -> a.mutate("POST", "files/access/request", obj(), () -> show(path)));
            return;
          }
          if (access.optBoolean("share")) a.button("管理分享", this::shares);
          if (access.optBoolean("write") && !path.isEmpty()) {
            a.button("新增資料夾", () -> nameForm(path, false));
            a.button("上傳檔案", () -> nameForm(path, true));
          }
          JSONArray entries = r.getJSONObject("listing").getJSONArray("entries");
          LinkedHashSet<String> selection = new LinkedHashSet<>();
          a.button("打包下載選取項目", () -> archive(selection, null));
          if (entries.length() == 0) a.text("此資料夾是空的。", 16);
          for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            String name = str(entry, "name"), full = join(path, name);
            boolean directory = entry.optBoolean("directory");
            a.card((directory ? "▣ " : "▤ ") + name);
            a.text(directory ? "資料夾" : entry.optLong("size") + " bytes", 13);
            a.text("修改時間：" + str(entry, "modified"), 13);
            CheckBox selected = a.check("加入打包選取", false);
            selected.setOnCheckedChangeListener(
                (v, on) -> {
                  if (on) selection.add(full);
                  else selection.remove(full);
                });
            if (directory) a.button("開啟資料夾", () -> show(full));
            else
              a.button(
                  "下載",
                  () ->
                      a.save(
                          name,
                          "application/octet-stream",
                          "GET",
                          "files/download?path=" + enc(full),
                          null));
            if (access.optBoolean("share")) a.button("建立分享", () -> share(full, name));
            if (access.optBoolean("write") && !path.isEmpty()) {
              a.button("重新命名", () -> rename(full, path, name));
              a.button(
                  "刪除",
                  () ->
                      a.confirm(
                          "刪除「" + name + "」？資料夾必須為空。",
                          () ->
                              a.mutate(
                                  "DELETE", "files/entry", obj("path", full), () -> show(path))));
            }
          }
        });
  }

  void nameForm(String path, boolean upload) {
    a.screen(upload ? "上傳檔案" : "新增資料夾", path);
    a.card("名稱");
    EditText name = a.field(upload ? "儲存檔名（含副檔名）" : "資料夾名稱", "", false);
    a.button(
        upload ? "選擇檔案並上傳" : "建立",
        () -> {
          String leaf = value(name).trim();
          if (!validName(leaf)) {
            a.status.setText("名稱不能空白、包含斜線或使用 . / ..。");
            return;
          }
          if (upload) a.pickUpload(join(path, leaf));
          else a.mutate("POST", "files/folder", obj("path", join(path, leaf)), () -> show(path));
        });
  }

  static boolean validName(String name) {
    return !name.isEmpty()
        && !name.equals(".")
        && !name.equals("..")
        && !name.contains("/")
        && !name.contains("\\");
  }

  void rename(String full, String path, String old) {
    a.screen("重新命名", full);
    a.card("新名稱");
    EditText name = a.field("名稱", old, false);
    a.button(
        "儲存",
        () -> {
          String leaf = value(name).trim();
          if (!validName(leaf)) {
            a.status.setText("請輸入有效名稱。");
            return;
          }
          a.mutate(
              "POST", "files/rename", obj("from", full, "to", join(path, leaf)), () -> show(path));
        });
  }

  void archive(Set<String> paths, String code) {
    if (paths.isEmpty() || paths.size() > 50) {
      a.status.setText(R.string.archive_selection_limit);
      return;
    }
    JSONObject body = obj("paths", new JSONArray(paths));
    if (code != null) body = obj("paths", new JSONArray(paths), "code", code);
    a.save(
        "FnOS.zip",
        "application/zip",
        "POST",
        code == null ? "files/archive" : "files/shared/archive",
        body);
  }

  void share(String path, String name) {
    a.screen("建立分享", name);
    a.card("有效期限");
    EditText hours = a.field("小時（1–168）", "24", false);
    a.button(
        "產生分享碼",
        () ->
            a.run(
                () ->
                    a.api()
                        .request("POST", "files/shares", obj("path", path, "hours", number(hours))),
                r -> {
                  a.card("分享碼只顯示一次");
                  String code = r.getString("code");
                  a.text(code, 18);
                  a.text("有效至：" + str(r, "expiresAt"), 14);
                  a.button("複製分享碼", () -> a.copy(code));
                  a.button("複製分享網址", () -> a.copy(a.api().server + "/share.html#" + code));
                }));
  }

  void shares() {
    a.screen("管理分享", "查看與撤銷有效分享");
    a.get(
        "files/shares",
        r -> {
          JSONArray list = r.getJSONArray("shares");
          if (list.length() == 0) a.text("沒有分享。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.getJSONObject(i);
            a.card(str(s, "name"));
            a.text("到期：" + str(s, "expires_at"), 14);
            a.button(
                "撤銷分享",
                () ->
                    a.confirm(
                        "撤銷後此分享碼將無法再使用。",
                        () ->
                            a.mutate(
                                "DELETE",
                                "files/shares/" + enc(str(s, "id")),
                                null,
                                this::shares)));
          }
        });
  }

  void permissions() {
    a.screen("檔案使用者權限", "僅檔案擁有者可以管理");
    a.button("授權使用者", () -> permission(obj()));
    a.get(
        "files/permissions",
        r -> {
          JSONArray users = r.getJSONArray("users");
          for (int i = 0; i < users.length(); i++) {
            JSONObject u = users.getJSONObject(i);
            a.card(str(u, "username"));
            a.text(
                "讀取 "
                    + flag(u, "can_read")
                    + " · 寫入 "
                    + flag(u, "can_write")
                    + " · 分享 "
                    + flag(u, "can_share"),
                14);
            if (!str(u, "requested_at").isEmpty()) a.text("申請時間：" + str(u, "requested_at"), 13);
            a.button("編輯權限", () -> permission(u));
          }
        });
  }

  void permission(JSONObject user) {
    a.screen("編輯檔案權限", "寫入及分享需要同時允許讀取");
    a.card("帳戶");
    EditText name = a.field("使用者名稱", str(user, "username"), false);
    CheckBox read = a.check("讀取", flag(user, "can_read")),
        write = a.check("寫入", flag(user, "can_write")),
        share = a.check("分享", flag(user, "can_share"));
    a.button(
        "儲存",
        () -> {
          if (!read.isChecked() && (write.isChecked() || share.isChecked())) {
            a.status.setText("請先允許讀取。");
            return;
          }
          a.mutate(
              "PUT",
              "files/permissions",
              obj(
                  "username",
                  value(name),
                  "read",
                  read.isChecked(),
                  "write",
                  write.isChecked(),
                  "share",
                  share.isChecked()),
              this::permissions);
        });
  }

  void openShare() {
    a.screen("開啟分享", "不需登入，輸入分享碼或網站分享網址");
    a.card("分享碼");
    EditText code = a.field("分享碼／網址", "", false);
    a.button(
        "開啟",
        () -> {
          String input = value(code).trim();
          if (input.contains("#")) input = input.substring(input.lastIndexOf('#') + 1);
          if (!input.matches("[a-f0-9]{32}")) {
            a.status.setText(R.string.invalid_share_code);
            return;
          }
          shared(input, "");
        });
  }

  void shared(String code, String path) {
    a.screen("分享內容", path.isEmpty() ? "分享根目錄" : path);
    a.run(
        () -> a.api().request("POST", "files/shared/list", obj("code", code, "path", path)),
        r -> {
          String name = str(r, "name");
          a.card(name);
          a.text("有效至：" + str(r, "expiresAt"), 14);
          if (!r.optBoolean("directory")) {
            a.button(
                "下載檔案",
                () ->
                    a.save(
                        name,
                        "application/octet-stream",
                        "POST",
                        "files/shared/download",
                        obj("code", code, "path", "")));
            return;
          }
          if (!path.isEmpty()) a.button("上一層", () -> shared(code, parent(path)));
          a.button(
              "下載完整分享資料夾",
              () ->
                  a.save(
                      name + ".zip",
                      "application/zip",
                      "POST",
                      "files/shared/archive-all",
                      obj("code", code)));
          LinkedHashSet<String> selected = new LinkedHashSet<>();
          a.button("打包選取項目", () -> archive(selected, code));
          JSONArray list = r.getJSONArray("entries");
          if (list.length() == 0) a.text("此資料夾是空的。", 16);
          for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            String child = str(item, "name"), relative = join(path, child);
            a.card((item.optBoolean("directory") ? "▣ " : "▤ ") + child);
            CheckBox select = a.check("加入打包選取", false);
            select.setOnCheckedChangeListener(
                (v, on) -> {
                  if (on) selected.add(relative);
                  else selected.remove(relative);
                });
            if (item.optBoolean("directory")) a.button("開啟", () -> shared(code, relative));
            else
              a.button(
                  "下載",
                  () ->
                      a.save(
                          child,
                          "application/octet-stream",
                          "POST",
                          "files/shared/download",
                          obj("code", code, "path", relative)));
          }
        });
  }
}
