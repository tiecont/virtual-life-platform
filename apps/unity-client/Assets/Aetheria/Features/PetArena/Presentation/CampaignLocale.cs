using System;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Xml;
using System.Xml.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    internal static class CampaignLocale
    {
        private const string Preference = "aetheria.campaign.language";
        private static readonly Lazy<XElement> Catalog = new(Load);
        private static readonly Lazy<Font> Latin = new(() => Resources.Load<Font>("WaveD4/Fonts/AetheriaNotoSans-Regular"));
        private static readonly Lazy<Font> Cjk = new(() => Resources.Load<Font>("WaveD4/Fonts/AetheriaNotoSansCJK-Subset"));

        private static XElement Load()
        {
            var resource = Resources.Load<TextAsset>("WaveD4/Localization/strings_waved4");
            if (resource == null) return null;
            using var reader = JsonReaderWriterFactory.CreateJsonReader(resource.bytes, new XmlDictionaryReaderQuotas());
            return XDocument.Load(reader).Root;
        }

        private static string Language => PlayerPrefs.GetString(Preference, "en");

        public static string Text(string key, string fallback)
        {
            var entry = Catalog.Value?.Element("entries")?.Element(key);
            var language = Language;
            return entry?.Elements().FirstOrDefault(value => value.Name.LocalName == language)?.Value
                ?? entry?.Element("en")?.Value ?? fallback;
        }

        public static string Format(string key, string fallback, params object[] values) =>
            string.Format(CultureInfo.InvariantCulture, Text(key, fallback), values);

        public static void ApplyFont(VisualElement element)
        {
            var font = Language == "ja" || Language == "ko" || Language == "zh" ? Cjk.Value : Latin.Value;
            if (font != null) element.style.unityFontDefinition = FontDefinition.FromFont(font);
        }

        public static void AddSelector(VisualElement parent, Action redraw)
        {
            var languages = Catalog.Value?.Element("supportedLanguages")?.Elements().ToList();
            if (languages == null || languages.Count == 0) return;
            var codes = languages.Select(item => item.Element("code").Value).ToList();
            var names = languages.Select(item => item.Element("nativeName").Value).ToList();
            var index = codes.IndexOf(Language);
            var selector = new DropdownField(Text("settings.tab_language", "Language"), names,
                index >= 0 ? index : codes.IndexOf("en")) { name = "campaign-language" };
            if (Cjk.Value != null) selector.style.unityFontDefinition = FontDefinition.FromFont(Cjk.Value);
            selector.RegisterValueChangedCallback(change =>
            {
                var choice = names.IndexOf(change.newValue);
                if (choice < 0) return;
                PlayerPrefs.SetString(Preference, codes[choice]);
                PlayerPrefs.Save();
                redraw();
            });
            parent.Add(selector);
        }
    }
}
