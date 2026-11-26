using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography.X509Certificates;

namespace Aetheria.PetArena.Infrastructure
{
    // Explicit local-only CA trust for the native TLS/WSS bridge. The CA is a
    // public certificate supplied by the local composition; it never carries a
    // private key or changes the packaged player's system trust store.
    public sealed class Arena8NativeTrust : IDisposable
    {
        private readonly PropertyInfo defaults;
        private readonly object previous;
        private readonly X509Certificate certificate;

        private Arena8NativeTrust(string caFile, Uri origin)
        {
            if (origin == null || origin.Scheme != "https" || !origin.IsLoopback ||
                string.IsNullOrEmpty(caFile) || new FileInfo(caFile).Length > 8192)
                throw new ArgumentException("Local native CA required");
            var type = Type.GetType("Mono.Security.Interface.MonoTlsSettings, Mono.Security", true);
            defaults = type.GetProperty("DefaultSettings");
            previous = defaults.GetValue(null);
            var settings = type.GetMethod("Clone").Invoke(previous, null);
            var pem = File.ReadAllText(caFile)
                .Replace("-----BEGIN CERTIFICATE-----", string.Empty)
                .Replace("-----END CERTIFICATE-----", string.Empty);
            certificate = new X509Certificate(Convert.FromBase64String(pem));
            type.GetProperty("TrustAnchors").SetValue(settings, new X509CertificateCollection { certificate });
            defaults.SetValue(null, settings);
        }

        public static Arena8NativeTrust FromEnvironment(Uri origin)
        {
            var file = Environment.GetEnvironmentVariable("AETHERIA_ARENA8_NATIVE_CA");
            return string.IsNullOrEmpty(file) ? null : new Arena8NativeTrust(file, origin);
        }

        public void Dispose()
        {
            defaults?.SetValue(null, previous);
            certificate?.Dispose();
        }
    }
}
