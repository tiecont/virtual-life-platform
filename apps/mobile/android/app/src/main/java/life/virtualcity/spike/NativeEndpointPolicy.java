package life.virtualcity.spike;

import java.net.URI;

/** Fixed HTTPS destination; credentials never follow a caller-selected URL. */
final class NativeEndpointPolicy {
    final String origin;
    NativeEndpointPolicy(String origin) {
        URI uri = URI.create(origin);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getRawPath() == null || uri.getRawPath().isEmpty()) || uri.getPort() == 0 || uri.getPort() > 65535)
            throw new IllegalArgumentException("Native destination unavailable");
        this.origin = uri.toASCIIString();
    }
    String endpoint(String path) {
        if (!path.matches("/v1/[a-z0-9/-]+") || path.contains("//") || path.endsWith("/"))
            throw new IllegalArgumentException("Native endpoint unavailable");
        return origin + path;
    }
    void publicRequest(String method, String path) {
        // Deliberately bounded to account settings. Social/gameplay requires its
        // complete safety/business adapter before extending this allowlist.
        boolean allowed = (path.equals("/v1/me") && (method.equals("GET") || method.equals("PATCH")))
            || (path.equals("/v1/me/privacy") && (method.equals("GET") || method.equals("PATCH")));
        if (!allowed) throw new IllegalArgumentException("Native endpoint unavailable");
        endpoint(path);
    }
}
