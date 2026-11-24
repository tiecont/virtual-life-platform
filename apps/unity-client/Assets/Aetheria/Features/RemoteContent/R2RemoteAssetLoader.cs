using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.Networking;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace Aetheria.RemoteContent
{
    public sealed class R2RemoteAssetLoader : IDisposable
    {
        private readonly R2RemoteContentSettings settings;
        private readonly Dictionary<string, RemoteAssetDefinition> entries =
            new Dictionary<string, RemoteAssetDefinition>(StringComparer.Ordinal);
        private bool disposed;

        public RemoteContentManifest Manifest { get; private set; }
        public bool Ready { get; private set; }
        public string LastError { get; private set; }
        public bool IsEnabled => !disposed && settings != null && settings.Enabled;

        public R2RemoteAssetLoader(R2RemoteContentSettings source)
        {
            settings = source;
        }

        public async Task<bool> InitializeAsync(CancellationToken cancellationToken)
        {
            if (disposed) throw new ObjectDisposedException(nameof(R2RemoteAssetLoader));
            if (!IsEnabled)
            {
                LastError = "Remote content is disabled; local content remains active.";
                return false;
            }
            if (!settings.TryGetManifestUri(out var manifestUri))
            {
                LastError = "R2 manifest URL is invalid.";
                return false;
            }

            using (var request = UnityWebRequest.Get(manifestUri))
            using (cancellationToken.Register(request.Abort))
            {
                request.timeout = settings.TimeoutSeconds;
                var operation = request.SendWebRequest();
                while (!operation.isDone)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await Task.Yield();
                }
                if (cancellationToken.IsCancellationRequested)
                    throw new OperationCanceledException(cancellationToken);
                if (request.result != UnityWebRequest.Result.Success)
                {
                    LastError = "R2 manifest request failed: " + request.result;
                    return false;
                }
                var text = request.downloadHandler.text;
                if (text == null || System.Text.Encoding.UTF8.GetByteCount(text) > settings.MaximumManifestBytes)
                {
                    LastError = "R2 manifest exceeded the configured size.";
                    return false;
                }
                if (!RemoteContentManifest.TryParse(text, BaseOrigin(manifestUri),
                        out var manifest, out var error))
                {
                    LastError = error;
                    return false;
                }
                Manifest = manifest;
                entries.Clear();
                foreach (var pair in manifest.Index()) entries.Add(pair.Key, pair.Value);
                Ready = true;
                LastError = null;
                return true;
            }
        }

        public Task<RemoteAssetLease> LoadPetAsync(string petId, CancellationToken cancellationToken) =>
            LoadAsync("pets/", petId, cancellationToken);

        public Task<RemoteAssetLease> LoadArenaMapAsync(string mapId, CancellationToken cancellationToken) =>
            LoadAsync("maps/", mapId, cancellationToken);

        public void Release(RemoteAssetLease lease) => lease?.Dispose();

        private async Task<RemoteAssetLease> LoadAsync(string prefix, string id,
            CancellationToken cancellationToken)
        {
            if (disposed) throw new ObjectDisposedException(nameof(R2RemoteAssetLoader));
            if (!Ready) throw new InvalidOperationException("Remote manifest is not initialized.");
            if (string.IsNullOrWhiteSpace(id) || !entries.TryGetValue(id, out var entry) ||
                !entry.address.StartsWith(prefix, StringComparison.Ordinal))
                throw new ArgumentException("Unknown remote content ID.", nameof(id));
            var handle = Addressables.LoadAssetAsync<GameObject>(entry.address);
            while (!handle.IsDone)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await Task.Yield();
            }
            if (cancellationToken.IsCancellationRequested)
            {
                if (handle.IsValid()) Addressables.Release(handle);
                throw new OperationCanceledException(cancellationToken);
            }
            if (handle.Status != AsyncOperationStatus.Succeeded || handle.Result == null)
            {
                if (handle.IsValid()) Addressables.Release(handle);
                throw new InvalidOperationException("Addressables failed to load " + entry.address);
            }
            return new RemoteAssetLease(handle, entry);
        }

        private static Uri BaseOrigin(Uri manifestUri)
        {
            return new Uri(manifestUri.GetLeftPart(UriPartial.Path));
        }

        public void Dispose()
        {
            disposed = true;
            Ready = false;
            entries.Clear();
        }
    }

    public sealed class RemoteAssetLease : IDisposable
    {
        private AsyncOperationHandle<GameObject> handle;
        private bool released;

        public GameObject Asset { get; }
        public RemoteAssetDefinition Definition { get; }

        internal RemoteAssetLease(AsyncOperationHandle<GameObject> source, RemoteAssetDefinition definition)
        {
            handle = source;
            Asset = source.Result;
            Definition = definition;
        }

        public void Dispose()
        {
            if (released) return;
            released = true;
            if (handle.IsValid()) Addressables.Release(handle);
        }
    }
}
