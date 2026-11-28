using System;
using UnityEngine;

namespace Aetheria.RemoteContent
{
    [CreateAssetMenu(menuName = "Aetheria/Remote Content/R2 Settings", fileName = "R2RemoteContentSettings")]
    public sealed class R2RemoteContentSettings : ScriptableObject
    {
        [SerializeField] private bool enabled;
        [SerializeField] private string manifestUrl;
        [SerializeField] private int timeoutSeconds = 12;
        [SerializeField] private int maximumManifestBytes = 65536;

        public bool Enabled => enabled;
        public string ManifestUrl => manifestUrl;
        public int TimeoutSeconds => Mathf.Clamp(timeoutSeconds, 1, 30);
        public int MaximumManifestBytes => Mathf.Clamp(maximumManifestBytes, 1024, 65536);

        public bool TryGetManifestUri(out Uri uri)
        {
            uri = null;
            return enabled && RemoteContentManifest.TryCreateBaseUri(manifestUrl, out uri);
        }

        public void Configure(bool useRemoteContent, string url)
        {
            enabled = useRemoteContent;
            manifestUrl = url;
        }
    }
}
