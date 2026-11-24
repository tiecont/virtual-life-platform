using System;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEngine;

namespace Aetheria.Editor
{
    public static class RemoteContentSetupEditor
    {
        public const string PetsGroup = "Pets_Remote";
        public const string MapsGroup = "ArenaMaps_Remote";
        public const string PetsLabel = "pet-remote";
        public const string MapsLabel = "arena-map-remote";

        [MenuItem("Aetheria/Remote Content/Configure Addressables for R2")]
        public static void Configure()
        {
            var settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            if (settings == null) throw new InvalidOperationException("Addressables settings could not be created.");
            settings.BuildRemoteCatalog = true;
            settings.profileSettings.SetValue(settings.activeProfileId,
                AddressableAssetSettings.kRemoteBuildPath, "ServerData/[BuildTarget]");
            settings.profileSettings.SetValue(settings.activeProfileId,
                AddressableAssetSettings.kRemoteLoadPath,
                "https://assets.example.invalid/aetheria/[BuildTarget]");
            settings.RemoteCatalogBuildPath.SetVariableByName(settings,
                AddressableAssetSettings.kRemoteBuildPath);
            settings.RemoteCatalogLoadPath.SetVariableByName(settings,
                AddressableAssetSettings.kRemoteLoadPath);
            EnsureRemoteGroup(settings, PetsGroup);
            EnsureRemoteGroup(settings, MapsGroup);
            settings.AddLabel(PetsLabel);
            settings.AddLabel(MapsLabel);
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();
            Debug.Log("Addressables remote catalog and R2 groups configured. " +
                "Replace the example.invalid load path in the build profile before publishing.");
        }

        private static void EnsureRemoteGroup(AddressableAssetSettings settings, string name)
        {
            var group = settings.FindGroup(name);
            if (group == null)
                group = settings.CreateGroup(name, false, false, true, null,
                    typeof(ContentUpdateGroupSchema), typeof(BundledAssetGroupSchema));
            var schema = group.GetSchema<BundledAssetGroupSchema>();
            if (schema == null) throw new InvalidOperationException("Remote group has no bundle schema.");
            schema.BuildPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteBuildPath);
            schema.LoadPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteLoadPath);
            schema.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackTogetherByLabel;
            EditorUtility.SetDirty(group);
            EditorUtility.SetDirty(schema);
        }
    }
}
