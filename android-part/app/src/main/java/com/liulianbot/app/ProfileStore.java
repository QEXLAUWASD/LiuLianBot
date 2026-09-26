package com.liulianbot.app;

import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class ProfileStore {
  private static final String ALIAS = "liulian-native-profiles";

  private static SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(
          new KeyGenParameterSpec.Builder(
                  ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }

  static void save(Context context, String server, String kind, JSONObject profile)
      throws Exception {
    // SSH passwords and RDP passwords are intentionally absent from device profiles.
    JSONObject safe = new JSONObject(profile.toString());
    safe.remove("password");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    cipher.updateAAD((server + "/" + kind).getBytes(StandardCharsets.UTF_8));
    byte[] data = cipher.doFinal(safe.toString().getBytes(StandardCharsets.UTF_8));
    context
        .getSharedPreferences("profiles", Context.MODE_PRIVATE)
        .edit()
        .putString(
            server + "/" + kind,
            Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + ":"
                + Base64.encodeToString(data, Base64.NO_WRAP))
        .apply();
  }

  static JSONObject load(Context context, String server, String kind) throws Exception {
    String value =
        context
            .getSharedPreferences("profiles", Context.MODE_PRIVATE)
            .getString(server + "/" + kind, null);
    if (value == null) return new JSONObject();
    String[] parts = value.split(":", 2);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        Cipher.DECRYPT_MODE,
        key(),
        new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
    cipher.updateAAD((server + "/" + kind).getBytes(StandardCharsets.UTF_8));
    return new JSONObject(
        new String(
            cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
  }

  static void clear(Context context, String server, String kind) {
    context
        .getSharedPreferences("profiles", Context.MODE_PRIVATE)
        .edit()
        .remove(server + "/" + kind)
        .apply();
  }
}
