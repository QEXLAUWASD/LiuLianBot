package com.liulianbot.app;

import android.view.KeyEvent;
import org.json.JSONObject;

final class NativeKeyboard {
  static final int[] LETTERS = {
    30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31, 20, 22, 47, 17, 45,
    21, 44
  };

  static int scan(int key) {
    if (key >= KeyEvent.KEYCODE_A && key <= KeyEvent.KEYCODE_Z)
      return LETTERS[key - KeyEvent.KEYCODE_A];
    if (key >= KeyEvent.KEYCODE_0 && key <= KeyEvent.KEYCODE_9)
      return key == KeyEvent.KEYCODE_0 ? 11 : key - KeyEvent.KEYCODE_0 + 1;
    if (key >= KeyEvent.KEYCODE_F1 && key <= KeyEvent.KEYCODE_F10)
      return 59 + key - KeyEvent.KEYCODE_F1;
    switch (key) {
      case KeyEvent.KEYCODE_F11:
        return 87;
      case KeyEvent.KEYCODE_F12:
        return 88;
      case KeyEvent.KEYCODE_SPACE:
        return 57;
      case KeyEvent.KEYCODE_MINUS:
        return 12;
      case KeyEvent.KEYCODE_EQUALS:
        return 13;
      case KeyEvent.KEYCODE_LEFT_BRACKET:
        return 26;
      case KeyEvent.KEYCODE_RIGHT_BRACKET:
        return 27;
      case KeyEvent.KEYCODE_BACKSLASH:
        return 43;
      case KeyEvent.KEYCODE_SEMICOLON:
        return 39;
      case KeyEvent.KEYCODE_APOSTROPHE:
        return 40;
      case KeyEvent.KEYCODE_GRAVE:
        return 41;
      case KeyEvent.KEYCODE_COMMA:
        return 51;
      case KeyEvent.KEYCODE_PERIOD:
        return 52;
      case KeyEvent.KEYCODE_SLASH:
        return 53;
      case KeyEvent.KEYCODE_CTRL_RIGHT:
        return 0xe01d;
      case KeyEvent.KEYCODE_ALT_RIGHT:
        return 0xe038;
      case KeyEvent.KEYCODE_SHIFT_RIGHT:
        return 54;
      case KeyEvent.KEYCODE_MOVE_HOME:
        return 0xe047;
      case KeyEvent.KEYCODE_MOVE_END:
        return 0xe04f;
      case KeyEvent.KEYCODE_INSERT:
        return 0xe052;
      case KeyEvent.KEYCODE_FORWARD_DEL:
        return 0xe053;
      case KeyEvent.KEYCODE_PAGE_UP:
        return 0xe049;
      case KeyEvent.KEYCODE_PAGE_DOWN:
        return 0xe051;
      default:
        return 0;
    }
  }

  static int modifier(int scan) {
    if (scan == 29 || scan == 0xe01d) return 2;
    if (scan == 56 || scan == 0xe038) return 1;
    if (scan == 42 || scan == 54) return 8;
    return 0;
  }

  static JSONObject chromium(int scan, boolean pressed, int modifiers) {
    String key = "", code = "", text = "";
    int vk = 0;
    for (int i = 0; i < LETTERS.length; i++)
      if (LETTERS[i] == scan) {
        vk = 65 + i;
        code = "Key" + (char) vk;
        key = String.valueOf((char) (((modifiers & 8) != 0 ? 65 : 97) + i));
        text = key;
      }
    if (scan >= 2 && scan <= 11) {
      int digit = scan == 11 ? 0 : scan - 1;
      vk = 48 + digit;
      code = "Digit" + digit;
      key =
          (modifiers & 8) == 0 ? String.valueOf(digit) : String.valueOf(")!@#$%^&*(".charAt(digit));
      text = key;
    }
    int[] scans = {
      28, 15, 14, 1, 29, 0xe01d, 56, 0xe038, 42, 54, 0xe04b, 0xe048, 0xe04d, 0xe050, 0xe047, 0xe04f,
      0xe052, 0xe053, 0xe049, 0xe051
    };
    String[] names = {
      "Enter",
      "Tab",
      "Backspace",
      "Escape",
      "Control",
      "Control",
      "Alt",
      "Alt",
      "Shift",
      "Shift",
      "ArrowLeft",
      "ArrowUp",
      "ArrowRight",
      "ArrowDown",
      "Home",
      "End",
      "Insert",
      "Delete",
      "PageUp",
      "PageDown"
    };
    int[] virtual = {13, 9, 8, 27, 17, 17, 18, 18, 16, 16, 37, 38, 39, 40, 36, 35, 45, 46, 33, 34};
    for (int i = 0; i < scans.length; i++)
      if (scans[i] == scan) {
        key = names[i];
        code = key;
        vk = virtual[i];
      }
    int[] punctuation = {57, 12, 13, 26, 27, 43, 39, 40, 41, 51, 52, 53};
    String plain = " -=[]\\;'`,./", shifted = " _+{}|:\"~<>?";
    for (int i = 0; i < punctuation.length; i++)
      if (punctuation[i] == scan) {
        key = String.valueOf(((modifiers & 8) != 0 ? shifted : plain).charAt(i));
        text = key;
        code = scan == 57 ? "Space" : "";
        vk = scan == 57 ? 32 : 0;
      }
    if (scan >= 59 && scan <= 68) {
      vk = 112 + scan - 59;
      key = "F" + (scan - 58);
      code = key;
    }
    if (scan == 87 || scan == 88) {
      key = scan == 87 ? "F11" : "F12";
      code = key;
      vk = scan == 87 ? 122 : 123;
    }
    JSONObject result =
        ApiClient.object(
            "type",
            "key",
            "eventType",
            pressed ? "keyDown" : "keyUp",
            "key",
            key,
            "code",
            code,
            "windowsVirtualKeyCode",
            vk,
            "modifiers",
            modifiers);
    if (pressed && !text.isEmpty() && (modifiers & 3) == 0)
      try {
        result.put("text", text);
      } catch (Exception e) {
        throw new IllegalArgumentException(e);
      }
    return result;
  }
}
