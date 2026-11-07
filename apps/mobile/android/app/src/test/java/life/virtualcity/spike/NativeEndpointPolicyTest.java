package life.virtualcity.spike;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeEndpointPolicyTest {
    @Test public void acceptsOnlyAnOriginWithHttps() {
        assertEquals("https://localhost:18443/v1/me", new NativeEndpointPolicy("https://localhost:18443").endpoint("/v1/me"));
        for (String value : new String[]{"", "http://localhost:18443", "https://user:password@localhost", "https://localhost/", "https://localhost/path", "https://localhost?secret=value", "https://localhost#value", "https://localhost:0", "https://localhost:99999"}) {
            try { new NativeEndpointPolicy(value); fail("Unsafe origin accepted"); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void rejectsAlternateDestinationsAndEncodedPaths() {
        NativeEndpointPolicy policy = new NativeEndpointPolicy("https://api.example.invalid");
        for (String value : new String[]{"https://other.invalid/v1/me", "//other.invalid/v1/me", "/v1/../session/login", "/v1/%2e%2e/session/login", "/v1/me?token=value", "/v1/me#value", "/v1//me", "/v1/me/", "/v1/me\n"}) {
            try { policy.endpoint(value); fail("Unsafe endpoint accepted"); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void publicPortIsLimitedToAccountSettings() {
        NativeEndpointPolicy policy = new NativeEndpointPolicy("https://api.example.invalid");
        policy.publicRequest("GET", "/v1/me"); policy.publicRequest("PATCH", "/v1/me/privacy");
        for (String value : new String[]{"/v1/native/session/refresh", "/v1/session/guest", "/v1/operator/accounts", "/v1/me/legacy/import", "/v1/travel-intents", "/v1/native/devices"}) {
            try { policy.publicRequest("POST", value); fail("Unreviewed route accepted"); } catch (IllegalArgumentException expected) { }
        }
    }
}
