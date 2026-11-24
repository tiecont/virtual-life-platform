using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Aetheria.RemoteContent
{
    [Serializable]
    public sealed class RemoteAssetDefinition
    {
        public string id;
        public string address;
        public string contentHash;
    }

    [Serializable]
    public sealed class RemoteContentManifest
    {
        public int schemaVersion;
        public string release;
        public string contentVersion;
        public RemoteAssetDefinition[] pets;
        public RemoteAssetDefinition[] maps;

        public const int SupportedSchemaVersion = 1;
        public const int MaximumEntries = 96;
        public const string RequiredRelease = "DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC";
        private static readonly Regex StableId = new Regex("^[a-z0-9][a-z0-9-]{2,63}$",
            RegexOptions.CultureInvariant);
        private static readonly HashSet<string> ReservedPaths = new HashSet<string> {
            ".", "..", "%2e", "%2e%2e"
        };

        public IReadOnlyDictionary<string, RemoteAssetDefinition> Index()
        {
            var result = new Dictionary<string, RemoteAssetDefinition>(StringComparer.Ordinal);
            if (pets != null)
                foreach (var entry in pets) result[entry.id] = entry;
            if (maps != null)
                foreach (var entry in maps) result[entry.id] = entry;
            return result;
        }

        public bool TryValidate(Uri expectedBaseUri, out string error)
        {
            error = null;
            if (expectedBaseUri == null || expectedBaseUri.Scheme != Uri.UriSchemeHttps ||
                !string.IsNullOrEmpty(expectedBaseUri.UserInfo) ||
                !string.IsNullOrEmpty(expectedBaseUri.Query) ||
                !string.IsNullOrEmpty(expectedBaseUri.Fragment))
                return Fail("R2 base URL must be HTTPS without credentials, query or fragment", out error);
            if (schemaVersion != SupportedSchemaVersion)
                return Fail("Unsupported remote manifest schema", out error);
            if (!string.Equals(release, RequiredRelease, StringComparison.Ordinal))
                return Fail("Remote manifest release state is not offline-only", out error);
            if (!SafeSegment(contentVersion, 64))
                return Fail("Invalid remote content version", out error);
            if (pets == null || maps == null || pets.Length + maps.Length > MaximumEntries)
                return Fail("Remote manifest entry count exceeds the bound", out error);

            var ids = new HashSet<string>(StringComparer.Ordinal);
            var addresses = new HashSet<string>(StringComparer.Ordinal);
            if (!ValidateEntries(pets, "pets/", ids, addresses, out error)) return false;
            if (!ValidateEntries(maps, "maps/", ids, addresses, out error)) return false;
            return true;
        }

        public static bool TryParse(string json, Uri expectedBaseUri,
            out RemoteContentManifest manifest, out string error)
        {
            manifest = null;
            error = null;
            if (string.IsNullOrWhiteSpace(json) || json.Length > 65536)
                return Fail("Remote manifest is empty or exceeds 64 KiB", out error);
            try
            {
                manifest = JsonUtility.FromJson<RemoteContentManifest>(json);
            }
            catch (Exception)
            {
                return Fail("Remote manifest is not valid JSON", out error);
            }
            if (manifest == null) return Fail("Remote manifest is missing", out error);
            if (!manifest.TryValidate(expectedBaseUri, out error))
            {
                manifest = null;
                return false;
            }
            return true;
        }

        public static bool TryCreateBaseUri(string value, out Uri uri)
        {
            uri = null;
            if (!Uri.TryCreate(value, UriKind.Absolute, out var parsed) ||
                parsed.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(parsed.UserInfo) ||
                !string.IsNullOrEmpty(parsed.Query) || !string.IsNullOrEmpty(parsed.Fragment))
                return false;
            uri = parsed;
            return true;
        }

        private static bool ValidateEntries(RemoteAssetDefinition[] entries, string prefix,
            HashSet<string> ids, HashSet<string> addresses, out string error)
        {
            error = null;
            foreach (var entry in entries)
            {
                if (entry == null || string.IsNullOrWhiteSpace(entry.id) ||
                    entry.id.Length > 64 || !StableId.IsMatch(entry.id))
                    return Fail("Remote asset ID is invalid", out error);
                if (!ids.Add(entry.id)) return Fail("Remote asset ID is duplicated", out error);
                if (string.IsNullOrWhiteSpace(entry.address) || entry.address.Length > 160 ||
                    !entry.address.StartsWith(prefix, StringComparison.Ordinal) ||
                    entry.address.Contains("\\") || entry.address.Contains("//") ||
                    entry.address.Contains("..") || entry.address.StartsWith("/", StringComparison.Ordinal) ||
                    !addresses.Add(entry.address))
                    return Fail("Remote Addressables address is invalid or duplicated", out error);
                if (string.IsNullOrWhiteSpace(entry.contentHash) || entry.contentHash.Length < 32 ||
                    entry.contentHash.Length > 128)
                    return Fail("Remote asset hash is invalid", out error);
            }
            return true;
        }

        private static bool SafeSegment(string value, int maximum)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > maximum || ReservedPaths.Contains(value))
                return false;
            foreach (var character in value)
                if (!(char.IsLetterOrDigit(character) || character == '-' || character == '_' || character == '.'))
                    return false;
            return !value.Contains("..");
        }

        private static bool Fail(string message, out string error)
        {
            error = message;
            return false;
        }
    }
}
