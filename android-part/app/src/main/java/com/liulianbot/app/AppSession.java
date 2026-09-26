package com.liulianbot.app;

import android.app.Application;
import org.json.JSONObject;

public final class AppSession extends Application {
  ApiClient api;
  JSONObject user = new JSONObject();
  JSONObject pages = new JSONObject();

  @Override
  public void onCreate() {
    super.onCreate();
    String previous =
        getSharedPreferences("MainActivity", MODE_PRIVATE)
            .getString("server", "https://www.liulian.dev");
    String server = getSharedPreferences("settings", MODE_PRIVATE).getString("server", previous);
    api = new ApiClient(server);
    attach(api);
    try {
      api.restoreCookies(ProfileStore.load(this, server, "session").optJSONArray("cookies"));
    } catch (Exception ignored) {
      ProfileStore.clear(this, server, "session");
    }
  }

  void attach(ApiClient client) {
    client.onSessionCleared = () -> ProfileStore.clear(this, client.server, "session");
  }

  void remember(boolean enabled) throws Exception {
    if (enabled)
      ProfileStore.save(
          this, api.server, "session", ApiClient.object("cookies", api.persistentCookies()));
    else ProfileStore.clear(this, api.server, "session");
  }
}
