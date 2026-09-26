package com.liulianbot.app;

final class RgbaFrame {
  static int[] pixels(
      byte[] bytes,
      int width,
      int height,
      int clipWidth,
      int clipHeight,
      int x,
      int y,
      int screenWidth,
      int screenHeight) {
    if (width < 1
        || height < 1
        || width > 4096
        || height > 2160
        || clipWidth < 1
        || clipHeight < 1
        || clipWidth > width
        || clipHeight > height
        || x < 0
        || y < 0
        || x + clipWidth > screenWidth
        || y + clipHeight > screenHeight
        || bytes.length != (long) width * height * 4)
      throw new IllegalArgumentException("無效的 RDP 畫面資料");
    int[] pixels = new int[width * height];
    for (int i = 0; i < pixels.length; i++) {
      int at = i * 4;
      pixels[i] =
          0xff000000
              | ((bytes[at] & 255) << 16)
              | ((bytes[at + 1] & 255) << 8)
              | (bytes[at + 2] & 255);
    }
    return pixels;
  }

  static int coordinate(float touch, float offset, float scale, int limit) {
    if (scale <= 0 || !Float.isFinite(touch) || !Float.isFinite(scale)) return -1;
    int value = (int) Math.floor((touch - offset) / scale);
    return value < 0 || value >= limit ? -1 : value;
  }
}
