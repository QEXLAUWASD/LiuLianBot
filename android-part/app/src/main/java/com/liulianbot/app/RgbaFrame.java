package com.liulianbot.app;

final class RgbaFrame {
  private static final int MAX_WIDTH = 4096;
  private static final int MAX_HEIGHT = 2160;
  private static final long MAX_FRAME_BYTES = 16L * 1024 * 1024;

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
        || width > MAX_WIDTH
        || height > MAX_HEIGHT
        || clipWidth < 1
        || clipHeight < 1
        || clipWidth > width
        || clipHeight > height
        || x < 0
        || y < 0
        || screenWidth < 1
        || screenHeight < 1
        // Subtraction avoids integer overflow when validating untrusted coordinates.
        || x > screenWidth - clipWidth
        || y > screenHeight - clipHeight
        || (long) width * height * 4 > MAX_FRAME_BYTES
        || bytes == null
        || bytes.length != (long) width * height * 4)
      throw new IllegalArgumentException("無效的 RDP 畫面資料");
    // The wire payload contains the complete decoded frame, but Android only draws the
    // dirty rectangle. Convert that rectangle into a compact buffer instead of allocating
    // and iterating over the whole frame for every update.
    int[] pixels = new int[clipWidth * clipHeight];
    for (int row = 0; row < clipHeight; row++) {
      // x/y locate the destination rectangle on the screen. The protocol's source rectangle
      // always starts at (0, 0), just like Canvas.putImageData(..., 0, 0, clipWidth, clipHeight).
      int source = row * width * 4;
      int target = row * clipWidth;
      for (int column = 0; column < clipWidth; column++) {
        int at = source + column * 4;
        pixels[target + column] =
            0xff000000
                | ((bytes[at] & 255) << 16)
                | ((bytes[at + 1] & 255) << 8)
                | (bytes[at + 2] & 255);
      }
    }
    return pixels;
  }

  static int coordinate(float touch, float offset, float scale, int limit) {
    if (scale <= 0 || !Float.isFinite(touch) || !Float.isFinite(scale)) return -1;
    int value = (int) Math.floor((touch - offset) / scale);
    return value < 0 || value >= limit ? -1 : value;
  }
}
