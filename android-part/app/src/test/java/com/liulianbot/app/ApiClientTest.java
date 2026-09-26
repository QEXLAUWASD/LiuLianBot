package com.liulianbot.app;

import static org.junit.Assert.*;

import java.io.*;
import okhttp3.mockwebserver.*;
import org.json.JSONObject;
import org.junit.*;

public class ApiClientTest {
  MockWebServer server;
  ApiClient client;

  @Before
  public void setup() throws Exception {
    server = new MockWebServer();
    server.start();
    String origin = server.url("/").toString();
    client = new ApiClient(origin.substring(0, origin.length() - 1), true);
  }

  @After
  public void close() throws Exception {
    server.shutdown();
  }

  @Test
  public void cookiesAuthenticateJsonAndAreClearedAfterUnauthorized() throws Exception {
    server.enqueue(
        new MockResponse()
            .setBody("{\"success\":true}")
            .addHeader("Set-Cookie", "connect.sid=abc; Path=/; HttpOnly"));
    client.request(
        "POST", "auth/login", ApiClient.object("username", "test", "password", "secret"));
    server.takeRequest();
    server.enqueue(
        new MockResponse().setResponseCode(401).setBody("{\"error\":\"Login required\"}"));
    assertThrows(IOException.class, () -> client.request("GET", "auth/me", null));
    assertEquals("connect.sid=abc", server.takeRequest().getHeader("Cookie"));
    assertEquals("", client.cookieHeader("/api/auth/me"));
  }

  @Test
  public void mutationsCarryFileHeaderAndEmptyCreatedResponseSucceeds() throws Exception {
    server.enqueue(
        new MockResponse()
            .setResponseCode(201)
            .addHeader("Content-Type", "text/plain")
            .setBody("Created"));
    assertEquals(
        0, client.request("POST", "files/folder", ApiClient.object("path", "vol1/new")).length());
    RecordedRequest request = server.takeRequest();
    assertEquals("1", request.getHeader("X-Files-Request"));
    assertEquals("vol1/new", new JSONObject(request.getBody().readUtf8()).getString("path"));
  }

  @Test
  public void credentialsNeverFollowRedirects() throws Exception {
    server.enqueue(
        new MockResponse()
            .setResponseCode(302)
            .setHeader("Location", "https://elsewhere.invalid/"));
    assertThrows(
        IOException.class,
        () -> client.request("POST", "auth/login", ApiClient.object("password", "secret")));
    assertEquals(1, server.getRequestCount());
  }

  @Test
  public void downloadsPreserveBytesAndShareCodesStayOutOfUrls() throws Exception {
    server.enqueue(new MockResponse().setBody("binary-data"));
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    client.download(
        "POST",
        "files/shared/download",
        ApiClient.object("code", "0123456789abcdef0123456789abcdef", "path", "a.txt"),
        output);
    RecordedRequest request = server.takeRequest();
    assertEquals("/api/files/shared/download", request.getPath());
    assertEquals("binary-data", output.toString("UTF-8"));
  }

  @Test
  public void switchingServersDoesNotShareCookies() throws Exception {
    server.enqueue(
        new MockResponse().setBody("{}").addHeader("Set-Cookie", "connect.sid=abc; Path=/"));
    client.request("GET", "auth/me", null);
    assertEquals("", new ApiClient(client.server, true).cookieHeader("/api/auth/me"));
  }

  @Test
  public void malformedJsonAndOversizedResponsesFailClearly() throws Exception {
    server.enqueue(new MockResponse().setBody("<html>Login</html>"));
    assertThrows(IOException.class, () -> client.request("GET", "auth/me", null));
    assertThrows(
        IOException.class, () -> ApiClient.limitedBytes(new ByteArrayInputStream(new byte[5]), 4));
  }

  @Test
  public void uploadIsBinaryAndDoesNotBufferTheFile() throws Exception {
    server.enqueue(new MockResponse().setResponseCode(201).setBody("Created"));
    client.upload("vol1/測試.txt", () -> new ByteArrayInputStream(new byte[] {0, 1, 2, 3}));
    RecordedRequest r = server.takeRequest();
    assertEquals("PUT", r.getMethod());
    assertEquals("application/octet-stream", r.getHeader("Content-Type"));
    assertArrayEquals(new byte[] {0, 1, 2, 3}, r.getBody().readByteArray());
  }

  @Test
  public void rememberedCookiesPreserveExpiryAndRejectOtherOrigins() throws Exception {
    server.enqueue(
        new MockResponse()
            .setBody("{}")
            .addHeader("Set-Cookie", "connect.sid=remembered; Path=/; Max-Age=3600; HttpOnly"));
    client.request("GET", "auth/me", null);
    ApiClient restored = new ApiClient(client.server, true);
    restored.restoreCookies(client.persistentCookies());
    assertEquals("connect.sid=remembered", restored.cookieHeader("/api/auth/me"));
    ApiClient other = new ApiClient("https://other.example", true);
    other.restoreCookies(client.persistentCookies());
    assertEquals("", other.cookieHeader("/api/auth/me"));
  }
}
