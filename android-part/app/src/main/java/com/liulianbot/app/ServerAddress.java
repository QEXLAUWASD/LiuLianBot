package com.liulianbot.app;

import java.net.URI;

final class ServerAddress {
  static String normalize(String input) {
    try {
      URI uri = new URI(input.trim());
      if (!"https".equalsIgnoreCase(uri.getScheme())
          || uri.getHost() == null
          || uri.getRawUserInfo() != null
          || uri.getRawQuery() != null
          || uri.getRawFragment() != null
          || uri.getPort() == 0
          || uri.getPort() > 65535
          || !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))) {
        throw new IllegalArgumentException();
      }
      return "https://" + uri.getRawAuthority();
    } catch (Exception e) {
      throw new IllegalArgumentException("請輸入 HTTPS 網站根網址，不含帳密、路徑或查詢參數。");
    }
  }
}
