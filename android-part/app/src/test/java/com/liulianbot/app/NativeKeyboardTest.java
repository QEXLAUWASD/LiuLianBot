package com.liulianbot.app;

import static org.junit.Assert.*;

import org.json.JSONObject;
import org.junit.Test;

public class NativeKeyboardTest {
  @Test
  public void mapsPhysicalLettersDigitsAndExtendedKeys() {
    assertEquals(30, NativeKeyboard.scan(android.view.KeyEvent.KEYCODE_A));
    assertEquals(11, NativeKeyboard.scan(android.view.KeyEvent.KEYCODE_0));
    assertEquals(0xe053, NativeKeyboard.scan(android.view.KeyEvent.KEYCODE_FORWARD_DEL));
  }

  @Test
  public void chromiumUsesShiftedTextAndDoesNotTypeControlShortcuts() throws Exception {
    JSONObject shifted = NativeKeyboard.chromium(30, true, 8);
    assertEquals("A", shifted.getString("text"));
    assertEquals("KeyA", shifted.getString("code"));
    JSONObject ctrl = NativeKeyboard.chromium(30, true, 2);
    assertFalse(ctrl.has("text"));
    assertEquals(2, ctrl.getInt("modifiers"));
    assertFalse(NativeKeyboard.chromium(30, false, 0).has("text"));
  }
}
