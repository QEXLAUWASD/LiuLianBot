package com.liulianbot.app;

import android.app.Application;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

public final class AppSession extends Application {
  ApiClient api;
  JSONObject user = new JSONObject();
  JSONObject pages = new JSONObject();
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

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
    client.onSessionCleared =
        () -> {
          ProfileStore.clear(this, client.server, "session");
          // 401 can arrive from OkHttp's worker thread. Keep the UI session state
          // in sync on the main thread, and ignore callbacks from a replaced client.
          mainHandler.post(
              () -> {
                if (api == client) {
                  user = new JSONObject();
                  pages = new JSONObject();
                }
              });
        };
  }

  void remember(boolean enabled) throws Exception {
    if (enabled)
      ProfileStore.save(
          this, api.server, "session", ApiClient.object("cookies", api.persistentCookies()));
    else ProfileStore.clear(this, api.server, "session");
  }
}
