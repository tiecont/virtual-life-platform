using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography.X509Certificates;

namespace VirtualLife.NativeScene
{
    // Explicit development-build, loopback-only trust. Mono's UnityTls backend
    // still validates certificate chain, hostname and expiry against this CA.
    internal sealed class DevelopmentCertificateTrust : IDisposable
    {
        private readonly PropertyInfo defaults;
        private readonly object previous;
        private readonly X509Certificate certificate;
        public DevelopmentCertificateTrust(string file, Uri origin)
        {
            if (!origin.IsLoopback || origin.Scheme != "https" || new FileInfo(file).Length > 8192)
                throw new ArgumentException("Local development CA required");
            var type = Type.GetType("Mono.Security.Interface.MonoTlsSettings, Mono.Security", true);
            defaults = type.GetProperty("DefaultSettings"); previous = defaults.GetValue(null);
            var settings = type.GetMethod("Clone").Invoke(previous, null);
            var pem = File.ReadAllText(file).Replace("-----BEGIN CERTIFICATE-----", "").Replace("-----END CERTIFICATE-----", "");
            certificate = new X509Certificate(Convert.FromBase64String(pem));
            type.GetProperty("TrustAnchors").SetValue(settings, new X509CertificateCollection { certificate });
            defaults.SetValue(null, settings);
        }
        public void Dispose() { defaults.SetValue(null, previous); certificate.Dispose(); }
    }
}
