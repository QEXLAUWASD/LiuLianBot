package com.liulianbot.app;

import static com.liulianbot.app.MainActivity.*;

import android.widget.*;
import org.json.*;

final class AccountScreen {
  final MainActivity a;

  AccountScreen(MainActivity a) {
    this.a = a;
  }

  void show() {
    a.screen("帳戶設定", "登入、身份、密碼與 Discord 連結");
    a.get(
        "auth/me",
        r -> {
          a.session.user = r.optBoolean("loggedIn") ? r.getJSONObject("user") : obj();
          if (!a.signedIn()) {
            login(false);
            return;
          }
          a.card(str(a.session.user, "username"));
          a.text("群組：" + str(a.session.user, "role"), 15);
          if (!a.session.user.optBoolean("termsAccepted")) a.button("閱讀並接受服務條款", this::terms);
          a.button("Discord 帳戶連結", this::discord);
          a.button("變更使用者名稱", this::username);
          a.button("變更密碼", this::password);
          a.button(
              "登出",
              () ->
                  a.mutate(
                      "POST",
                      "auth/logout",
                      obj(),
                      () -> {
                        a.api().clearSession();
                        a.session.user = obj();
                        a.home();
                      }));
        });
  }

  void login(boolean register) {
    a.screen(register ? "建立帳戶" : "登入", "LiuLianBot · Home server console");
    a.card(register ? "註冊" : "歡迎回來");
    EditText username = a.field("使用者名稱", "", false);
    EditText password = a.field("密碼", "", true);
    CheckBox accept = register ? a.check("我已閱讀並同意服務條款與資料儲存說明", false) : null;
    CheckBox remember = register ? null : a.check("記住登入（加密保存，最長 30 日）", false);
    a.button("閱讀服務條款", this::terms);
    a.button(
        register ? "註冊並登入" : "登入",
        () -> {
          String name = value(username).trim(), secret = value(password);
          if (name.isEmpty() || secret.isEmpty()) {
            a.status.setText("請輸入帳戶及密碼。");
            return;
          }
          if (register && !accept.isChecked()) {
            a.status.setText("請先閱讀並同意條款。");
            return;
          }
          password.setText("");
          boolean persistent = remember != null && remember.isChecked();
          JSONObject body = obj("username", name, "password", secret, "remember", persistent);
          if (register) body = obj("username", name, "password", secret, "termsAccepted", true);
          final JSONObject payload = body;
          a.run(
              () -> {
                JSONObject result =
                    a.api().request("POST", "auth/" + (register ? "register" : "login"), payload);
                a.session.remember(persistent);
                return result;
              },
              r -> a.home());
        });
    a.button(register ? "已有帳戶，返回登入" : "建立新帳戶", () -> login(!register));
  }

  void terms() {
    a.screen("服務條款", "與網站共用的條款版本與資料儲存說明");
    a.get(
        "auth/terms-document",
        r -> {
          a.card(r.getString("title"));
          a.text("版本：" + r.getString("version"), 14);
          JSONArray sections = r.getJSONArray("sections");
          for (int i = 0; i < sections.length(); i++) {
            JSONObject s = sections.getJSONObject(i);
            a.card(s.getString("title"));
            JSONArray p = s.getJSONArray("paragraphs");
            for (int j = 0; j < p.length(); j++) a.text(p.getString(j), 16);
          }
          if (a.signedIn()) {
            a.card("同意條款");
            CheckBox confirm = a.check("我同意上述服務條款與資料儲存說明", false);
            a.button(
                "同意並繼續",
                () -> {
                  if (!confirm.isChecked()) {
                    a.status.setText("請先勾選同意。");
                    return;
                  }
                  a.mutate("POST", "auth/terms", obj("termsAccepted", true), a::home);
                });
          }
          a.button("返回帳戶", this::show);
        });
  }

  void username() {
    a.screen("變更使用者名稱", "輸入目前密碼以確認身份");
    a.card("帳戶名稱");
    EditText name = a.field("新名稱", str(a.session.user, "username"), false),
        password = a.field("目前密碼", "", true);
    a.button(
        "儲存名稱",
        () -> {
          JSONObject data = obj("username", value(name).trim(), "currentPassword", value(password));
          password.setText("");
          a.mutate("PUT", "auth/username", data, this::show);
        });
  }

  void password() {
    a.screen("變更密碼", "新密碼至少 8 個字元，避免使用常見密碼");
    a.card("密碼");
    EditText old = a.field("目前密碼", "", true),
        next = a.field("新密碼", "", true),
        confirm = a.field("再次輸入新密碼", "", true);
    a.button(
        "更新密碼",
        () -> {
          if (!value(next).equals(value(confirm))) {
            a.status.setText("兩次新密碼不相同。");
            return;
          }
          JSONObject data =
              obj(
                  "currentPassword",
                  value(old),
                  "newPassword",
                  value(next),
                  "confirmPassword",
                  value(confirm));
          old.setText("");
          next.setText("");
          confirm.setText("");
          a.mutate("PUT", "auth/password", data, this::show);
        });
  }

  void discord() {
    a.screen("Discord 連結", "將網站帳戶與 Discord 身份連結");
    a.get(
        "auth/discord-link",
        r -> {
          a.card(r.optBoolean("linked") ? "已連結" : "尚未連結");
          if (r.optBoolean("linked")) {
            a.text(str(r, "discordUserId"), 16);
            a.button(
                "解除連結",
                () ->
                    a.confirm(
                        "解除目前的 Discord 帳戶連結？",
                        () -> a.mutate("DELETE", "auth/discord-link", null, this::discord)));
          } else
            a.button(
                "產生一次性連結碼",
                () ->
                    a.run(
                        () -> a.api().request("POST", "auth/discord-link", obj()),
                        data -> {
                          a.card("連結碼");
                          String code = data.getString("code");
                          a.text(code, 24);
                          a.text(
                              "有效至：" + str(data, "expiresAt") + "\n請在 Discord 使用網站連結指令完成驗證。", 15);
                          a.button("複製連結碼", () -> a.copy(code));
                        }));
        });
  }
}
