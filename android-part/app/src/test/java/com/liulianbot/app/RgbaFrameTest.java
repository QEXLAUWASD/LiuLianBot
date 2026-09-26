package com.liulianbot.app;

import static org.junit.Assert.*;

import org.junit.Test;

public class RgbaFrameTest {
  @Test
  public void convertsRgbaWithoutSwappingRedAndBlue() {
    assertArrayEquals(
        new int[] {0xffff0000, 0xff0000ff},
        RgbaFrame.pixels(
            new byte[] {(byte) 255, 0, 0, (byte) 255, 0, 0, (byte) 255, (byte) 255},
            2,
            1,
            2,
            1,
            0,
            0,
            1280,
            720));
  }

  @Test
  public void rejectsTruncatedOrOutOfBoundsTiles() {
    assertThrows(
        IllegalArgumentException.class,
        () -> RgbaFrame.pixels(new byte[3], 1, 1, 1, 1, 0, 0, 1280, 720));
    assertThrows(
        IllegalArgumentException.class,
        () -> RgbaFrame.pixels(new byte[4], 1, 1, 1, 1, 1280, 0, 1280, 720));
    assertThrows(
        IllegalArgumentException.class,
        () -> RgbaFrame.pixels(new byte[4], 1, 1, 2, 1, 0, 0, 1280, 720));
  }

  @Test
  public void mapsLetterboxedTouchesAndRejectsOutsideArea() {
    assertEquals(640, RgbaFrame.coordinate(330, 10, 0.5f, 1280));
    assertEquals(-1, RgbaFrame.coordinate(9, 10, 0.5f, 1280));
    assertEquals(-1, RgbaFrame.coordinate(650, 10, 0.5f, 1280));
  }
}
