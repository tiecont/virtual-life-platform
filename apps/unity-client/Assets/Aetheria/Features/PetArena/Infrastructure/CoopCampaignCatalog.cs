using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;

namespace Aetheria.PetArena.Infrastructure
{
    [DataContract]
    public sealed class CoopCampaignCatalog
    {
        [DataContract]
        public sealed class Encounter
        {
            [DataMember(IsRequired = true)] public string mapId, mapName, bossId, bossName;
            [DataMember(IsRequired = true)] public int requiredPoints;
            [DataMember(IsRequired = true)] public bool eligible;
            [DataMember(IsRequired = true)] public Prerequisite prerequisite;
        }

        [DataContract]
        public sealed class Prerequisite
        {
            [DataMember(IsRequired = true)] public string mapId, mapName;
            [DataMember(IsRequired = true)] public bool cleared;
        }

        [DataMember(IsRequired = true)] private string ruleset;
        [DataMember(IsRequired = true)] private Encounter[] encounters;
        [DataMember(IsRequired = true)] public long configVersion;
        [DataMember(IsRequired = true)] public long points;

        private static readonly Regex Identifier = new Regex(@"\A[a-z][a-z0-9-]{2,63}\z");

        private CoopCampaignCatalog() { }

        public Encounter Find(string mapId) => Array.Find(encounters, encounter => encounter.mapId == mapId);

        public static CoopCampaignCatalog Decode(string json)
        {
            if (json == null || Encoding.UTF8.GetByteCount(json) > 16384)
                throw new FormatException("Invalid cooperative campaign response.");
            CoopCampaignCatalog catalog;
            try
            {
                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
                catalog = new DataContractJsonSerializer(typeof(CoopCampaignCatalog)).ReadObject(stream) as CoopCampaignCatalog;
            }
            catch (SerializationException error) { throw new FormatException("Invalid cooperative campaign response.", error); }

            if (catalog == null || catalog.ruleset != "arena8-coop-pve" ||
                catalog.configVersion <= 0 || catalog.configVersion > 9_007_199_254_740_991 ||
                catalog.points < 0 || catalog.points > 9_007_199_254_740_991 || catalog.encounters == null || catalog.encounters.Length > 6 ||
                catalog.encounters.Any(encounter => !ValidEncounter(encounter, catalog.points)) ||
                catalog.encounters.Select(encounter => encounter.mapId).Distinct(StringComparer.Ordinal).Count() != catalog.encounters.Length)
                throw new FormatException("Invalid cooperative campaign response.");
            return catalog;
        }

        private static bool ValidEncounter(Encounter encounter, long points)
        {
            if (encounter == null || !ValidId(encounter.mapId) || !ValidId(encounter.bossId) ||
                !ValidMapName(encounter.mapName) || string.IsNullOrWhiteSpace(encounter.bossName) ||
                !ValidPoints(encounter.requiredPoints)) return false;
            var prerequisite = encounter.prerequisite;
            if (prerequisite != null && (!ValidId(prerequisite.mapId) || !ValidMapName(prerequisite.mapName))) return false;
            return !encounter.eligible || (points >= encounter.requiredPoints && (prerequisite == null || prerequisite.cleared));
        }

        private static bool ValidId(string value) => value != null && Identifier.IsMatch(value);
        private static bool ValidMapName(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 128;
        private static bool ValidPoints(int value) => value >= 0 && value <= 1_000_000;
    }
}
