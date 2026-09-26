package com.liulianbot.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServerAddressTest {
    @Test public void acceptsHttpsOrigin() {
        assertEquals("https://example.com:8443", ServerAddress.normalize(" https://example.com:8443/ "));
    }
    @Test public void rejectsUnsafeOrAmbiguousAddresses() {
        String[] values = {"http://example.com", "https://user:pass@example.com", "https://example.com/path",
                "https://example.com?token=secret", "https://example.com/#fragment", "file:///tmp/a", "", "https://example.com:99999"};
        for (String value : values) assertThrows(value, IllegalArgumentException.class, () -> ServerAddress.normalize(value));
    }
}
