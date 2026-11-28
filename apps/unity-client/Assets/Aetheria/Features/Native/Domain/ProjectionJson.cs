using System;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Aetheria.Networking
{
    internal static class ProjectionJson
    {
        // `depth` bounds nested objects, arrays and array items. The Arena8
        // projection nests artifacts -> item -> modifiers, so it passes a larger
        // bound than the shallow Pet Arena view while staying explicitly bounded.
        internal static XElement Parse(byte[] bytes, int depth = 8)
        {
            if (bytes == null || bytes.Length == 0 || bytes.Length > 16384 || depth < 1 || depth > 32)
                throw new FormatException("Invalid projection");
            try {
                // Check the complete UTF-8 document, then preserve duplicate keys in the XML infoset.
                new Google.Protobuf.JsonParser(new Google.Protobuf.JsonParser.Settings(depth))
                    .Parse<Google.Protobuf.WellKnownTypes.Struct>(new UTF8Encoding(false, true).GetString(bytes));
                var quotas = new XmlDictionaryReaderQuotas { MaxDepth = depth, MaxStringContentLength = 16384, MaxArrayLength = 64 };
                using var reader = JsonReaderWriterFactory.CreateJsonReader(bytes, quotas);
                return XDocument.Load(reader).Root;
            } catch (Exception error) when (error is XmlException || error is DecoderFallbackException ||
                error is Google.Protobuf.InvalidJsonException || error is Google.Protobuf.InvalidProtocolBufferException) {
                throw new FormatException("Invalid projection");
            }
        }
        internal static string Type(XElement field)
        {
            if (field == null || field.Attributes().Count() != 1 || field.Attribute("type") == null)
                throw new FormatException("Invalid projection field");
            return field.Attribute("type").Value;
        }
        internal static void ObjectFields(XElement field, params string[] names)
        {
            if (Type(field) != "object" || field.Nodes().Any(node => !(node is XElement)) ||
                field.Elements().Any(child => child.Name.NamespaceName.Length != 0 || !names.Contains(child.Name.LocalName)) ||
                field.Elements().Select(child => child.Name).Distinct().Count() != field.Elements().Count())
                throw new FormatException("Invalid projection fields");
        }
        internal static string Scalar(XElement field, string type)
        {
            if (Type(field) != type || field.HasElements) throw new FormatException("Invalid projection scalar");
            return field.Value;
        }
        internal static bool Boolean(XElement field)
        {
            if (Type(field) != "boolean" || field.HasElements) throw new FormatException("Invalid projection boolean");
            if (field.Value == "true") return true;
            if (field.Value == "false") return false;
            throw new FormatException("Invalid projection boolean");
        }
        internal static long Integer(XElement field)
        {
            if (!long.TryParse(Scalar(field, "number"), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value))
                throw new FormatException("Invalid projection integer");
            return value;
        }
        internal static string OptionalString(XElement field)
        {
            if (field == null) return null;
            if (Type(field) != "null") return Scalar(field, "string");
            if (Scalar(field, "null").Length != 0) throw new FormatException("Invalid projection null");
            return null;
        }
        internal static XElement[] Array(XElement field, int maximum)
        {
            if (Type(field) != "array" || field.Nodes().Any(node => !(node is XElement)) ||
                field.Elements().Any(child => child.Name != "item") || field.Elements().Count() > maximum)
                throw new FormatException("Invalid projection array");
            return field.Elements().ToArray();
        }
    }
}
