using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Aetheria.PetArena.Infrastructure
{
    public sealed class CoopSkillClient
    {
        [DataContract]
        public sealed class Progression
        {
            [DataMember(IsRequired = true)] public string ownedPetInstanceId, petId, configDigest;
            [DataMember(IsRequired = true)] public long configVersion;
            [DataMember(IsRequired = true)] public int materials;
            [DataMember(IsRequired = true)] public Skill[] skills;
        }

        [DataContract]
        public sealed class Skill
        {
            [DataMember(IsRequired = true)] public string skillId;
            [DataMember(IsRequired = true)] public int level, effectiveLevel, maxLevel;
            [DataMember(IsRequired = true)] public int? nextMaterialCost;
        }

        [DataContract]
        public sealed class Receipt
        {
            [DataMember(IsRequired = true)] public string ownedPetInstanceId, skillId, configDigest;
            [DataMember(IsRequired = true)] public long configVersion;
            [DataMember(IsRequired = true)] public int level, maxLevel, spentMaterials, remainingMaterials;
        }

        [Serializable]
        private sealed class UpgradeRequest
        {
            public string requestId, skillId;
            public long expectedConfigVersion;
            public int expectedLevel;
        }

        private readonly Wave1LocalApi session;

        public CoopSkillClient(Wave1LocalApi session) =>
            this.session = session ?? throw new ArgumentNullException(nameof(session));

        public async Task<Progression> ReadAsync(Guid instanceId, string petId, CancellationToken cancellation)
        {
            var json = await session.CoopRequest(Path(instanceId, "skills"), null, cancellation);
            var view = Decode<Progression>(json);
            if (!Matches(view.ownedPetInstanceId, instanceId) || view.petId != petId ||
                view.configVersion <= 0 || !IsDigest(view.configDigest) || view.materials < 0 ||
                view.skills == null || view.skills.Length < 1 || view.skills.Length > 5 ||
                view.skills.Any(skill => skill == null || string.IsNullOrWhiteSpace(skill.skillId) ||
                    skill.skillId.Length > 64 || !IsLevel(skill.level) || !IsLevel(skill.maxLevel) ||
                    skill.effectiveLevel != Math.Min(skill.level, skill.maxLevel) ||
                    (skill.level < skill.maxLevel ? !(skill.nextMaterialCost > 0) : skill.nextMaterialCost.HasValue)) ||
                view.skills.Select(skill => skill.skillId).Distinct(StringComparer.Ordinal).Count() != view.skills.Length)
                throw new FormatException("Invalid skill progression for this Pet.");
            return view;
        }

        public async Task<Receipt> UpgradeAsync(Guid instanceId, Guid requestId, Progression view, Skill skill,
            CancellationToken cancellation)
        {
            var request = new UpgradeRequest
            {
                requestId = requestId.ToString("D"), skillId = skill.skillId,
                expectedLevel = skill.level, expectedConfigVersion = view.configVersion
            };
            var json = await session.CoopRequest(Path(instanceId, "skill-upgrades"), JsonUtility.ToJson(request), cancellation);
            var receipt = Decode<Receipt>(json);
            if (!Matches(receipt.ownedPetInstanceId, instanceId) || receipt.skillId != skill.skillId ||
                receipt.configVersion != view.configVersion || receipt.configDigest != view.configDigest ||
                receipt.level != skill.level + 1 || receipt.maxLevel != skill.maxLevel ||
                receipt.spentMaterials != skill.nextMaterialCost || receipt.remainingMaterials < 0)
                throw new FormatException("Invalid upgrade receipt for this Pet.");
            return receipt;
        }

        private static T Decode<T>(string json) where T : class
        {
            if (json == null || Encoding.UTF8.GetByteCount(json) > 8192)
                throw new FormatException("Invalid skill progression response.");
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
            return new DataContractJsonSerializer(typeof(T)).ReadObject(stream) as T
                ?? throw new FormatException("Invalid skill progression response.");
        }

        private static string Path(Guid id, string action) => "/v1/coop/pets/" + id.ToString("D") + "/" + action;
        private static bool Matches(string value, Guid id) => Guid.TryParseExact(value, "D", out var parsed) && id == parsed;
        private static bool IsLevel(int value) => value >= 1 && value <= 10;
        private static bool IsDigest(string value) => value?.Length == 64 &&
            value.All(character => character >= '0' && character <= '9' || character >= 'a' && character <= 'f');
    }
}
