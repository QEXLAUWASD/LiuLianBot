package com.liulianbot.app;

import android.content.Context;
import android.graphics.*;
import android.view.*;
import java.util.*;

// Constructed with its negotiated desktop dimensions, not inflated from XML.
@android.annotation.SuppressLint("ViewConstructor")
final class RemoteCanvas extends View {
  interface Input {
    void mouse(int x, int y, int button, boolean pressed);

    void key(int code, boolean pressed);
  }

  private Bitmap bitmap;
  private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
  private final Set<Integer> pressedKeys = new HashSet<>();
  private final Input input;
  final int screenWidth, screenHeight;
  private int lastX, lastY, button = 1;
  private boolean pressed;

  RemoteCanvas(Context context, int width, int height, Input input) {
    super(context);
    screenWidth = width;
    screenHeight = height;
    this.input = input;
    setFocusableInTouchMode(true);
    setContentDescription("遠端畫面，觸控拖曳控制滑鼠，文字輸入使用下方表單");
    bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    bitmap.eraseColor(Color.BLACK);
  }

  int pixelForTest(int x, int y) {
    return bitmap == null ? 0 : bitmap.getPixel(x, y);
  }

  void rightClick(boolean right) {
    releasePointer();
    button = right ? 2 : 1;
  }

  void rgba(int[] pixels, int width, int x, int y, int clipWidth, int clipHeight) {
    if (bitmap == null) return;
    bitmap.setPixels(pixels, 0, width, x, y, clipWidth, clipHeight);
    invalidate();
  }

  void frame(Bitmap next) {
    if (next == null) return;
    Bitmap old = bitmap;
    bitmap = next;
    invalidate();
    if (old != null) old.recycle();
  }

  private RectF viewport() {
    float scale = Math.min(getWidth() / (float) screenWidth, getHeight() / (float) screenHeight);
    float w = screenWidth * scale, h = screenHeight * scale;
    return new RectF(
        (getWidth() - w) / 2, (getHeight() - h) / 2, (getWidth() + w) / 2, (getHeight() + h) / 2);
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    canvas.drawColor(Color.BLACK);
    if (bitmap != null) canvas.drawBitmap(bitmap, null, viewport(), paint);
  }

  @Override
  public boolean onTouchEvent(android.view.MotionEvent event) {
    RectF rect = viewport();
    float scale = rect.width() / screenWidth;
    int x = RgbaFrame.coordinate(event.getX(), rect.left, scale, screenWidth),
        y = RgbaFrame.coordinate(event.getY(), rect.top, scale, screenHeight);
    int action = event.getActionMasked();
    if (action == MotionEvent.ACTION_CANCEL) {
      releasePointer();
      getParent().requestDisallowInterceptTouchEvent(false);
      return true;
    }
    if (action == MotionEvent.ACTION_UP) {
      releasePointer();
      getParent().requestDisallowInterceptTouchEvent(false);
      performClick();
      return true;
    }
    if (x < 0 || y < 0) return true;
    lastX = x;
    lastY = y;
    if (action == MotionEvent.ACTION_DOWN) {
      requestFocus();
      getParent().requestDisallowInterceptTouchEvent(true);
      pressed = true;
      input.mouse(x, y, button, true);
    } else if (action == MotionEvent.ACTION_MOVE) input.mouse(x, y, 0, false);
    return true;
  }

  @Override
  public boolean performClick() {
    super.performClick();
    return true;
  }

  private void releasePointer() {
    if (pressed) {
      input.mouse(lastX, lastY, button, false);
      pressed = false;
    }
  }

  void release() {
    releasePointer();
    for (int code : pressedKeys) input.key(code, false);
    pressedKeys.clear();
  }

  void dispose() {
    release();
    if (bitmap != null) {
      bitmap.recycle();
      bitmap = null;
    }
  }

  @Override
  protected void onFocusChanged(boolean focused, int direction, Rect old) {
    super.onFocusChanged(focused, direction, old);
    if (!focused) release();
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    int scan = scanCode(keyCode);
    if (scan == 0) return super.onKeyDown(keyCode, event);
    pressedKeys.add(scan);
    input.key(scan, true);
    return true;
  }

  @Override
  public boolean onKeyUp(int keyCode, KeyEvent event) {
    int scan = scanCode(keyCode);
    if (scan == 0) return super.onKeyUp(keyCode, event);
    pressedKeys.remove(scan);
    input.key(scan, false);
    return true;
  }

  static int scanCode(int key) {
    int mapped = NativeKeyboard.scan(key);
    if (mapped != 0) return mapped;
    switch (key) {
      case KeyEvent.KEYCODE_ENTER:
        return 28;
      case KeyEvent.KEYCODE_DEL:
        return 14;
      case KeyEvent.KEYCODE_TAB:
        return 15;
      case KeyEvent.KEYCODE_ESCAPE:
        return 1;
      case KeyEvent.KEYCODE_CTRL_LEFT:
        return 29;
      case KeyEvent.KEYCODE_ALT_LEFT:
        return 56;
      case KeyEvent.KEYCODE_SHIFT_LEFT:
        return 42;
      case KeyEvent.KEYCODE_DPAD_LEFT:
        return 0xe04b;
      case KeyEvent.KEYCODE_DPAD_RIGHT:
        return 0xe04d;
      case KeyEvent.KEYCODE_DPAD_UP:
        return 0xe048;
      case KeyEvent.KEYCODE_DPAD_DOWN:
        return 0xe050;
      default:
        return 0;
    }
  }
}
