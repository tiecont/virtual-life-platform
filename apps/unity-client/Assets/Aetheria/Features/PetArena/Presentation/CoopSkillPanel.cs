using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    internal sealed class CoopSkillPanel : VisualElement
    {
        private readonly CoopSkillClient client;
        private readonly Guid instanceId;
        private readonly Wave1Pet pet;
        private readonly CancellationToken cancellation;
        private readonly Action back;
        private CoopSkillClient.Progression progression;
        private CoopSkillClient.Skill pendingSkill;
        private Guid pendingRequest;
        private string notice;
        private bool busy;

        public CoopSkillPanel(CoopSkillClient client, Guid instanceId, Wave1Pet pet,
            CancellationToken cancellation, Action back)
        {
            this.client = client;
            this.instanceId = instanceId;
            this.pet = pet;
            this.cancellation = cancellation;
            this.back = back;
            AddToClassList("arena-panel");
            CampaignLocale.ApplyFont(this);
        }

        private void Render()
        {
            Clear();
            var title = new Label(CampaignLocale.Format("training.title", "{0} skills", pet.name)) { name = "coop-skill-title" };
            title.AddToClassList("arena-title");
            Add(title);
            if (progression != null)
            {
                Add(new Label(CampaignLocale.Format("training.materials", "{0} Artifact materials", progression.materials))
                    { name = "coop-skill-materials" });
                var skills = new ScrollView();
                skills.AddToClassList("training-list");
                foreach (var skill in progression.skills)
                {
                    var name = SkillName(skill.skillId);
                    var card = new VisualElement();
                    card.AddToClassList("training-card");
                    skills.Add(card);
                    var heading = new Label(name);
                    heading.AddToClassList("training-name");
                    card.Add(heading);
                    var level = skill.effectiveLevel == skill.level
                        ? CampaignLocale.Format("training.level", "Level {0} / {1}", skill.level, skill.maxLevel)
                        : CampaignLocale.Format("training.level_active", "Owned Lv {0} · Active Lv {1}", skill.level, skill.effectiveLevel);
                    card.Add(new Label(level) { name = "coop-skill-level-" + skill.skillId });
                    if (!(skill.nextMaterialCost is int cost)) continue;
                    var upgrade = new Button(() => _ = UpgradeAsync(skill))
                    {
                        name = "coop-skill-upgrade-" + skill.skillId,
                        text = CampaignLocale.Format("training.upgrade", "Upgrade to Lv {0} · {1} materials", skill.level + 1, cost)
                    };
                    upgrade.SetEnabled(!busy && pendingSkill == null && progression.materials >= cost);
                    card.Add(upgrade);
                    if (progression.materials < cost)
                        card.Add(new Label(CampaignLocale.Format("training.materials_needed", "{0} more materials needed", cost - progression.materials)));
                }
                Add(skills);
            }
            if (!string.IsNullOrEmpty(notice))
            {
                var status = new Label(notice) { name = "coop-skill-notice" };
                status.AddToClassList("arena-notice");
                Add(status);
            }
            if (pendingSkill != null)
            {
                var retry = new Button(() => _ = UpgradeAsync(pendingSkill))
                {
                    name = "coop-skill-retry", text = CampaignLocale.Text("training.retry", "Retry pending upgrade")
                };
                retry.SetEnabled(!busy);
                Add(retry);
            }
            else if (!busy)
                Add(new Button(() => _ = RefreshAsync()) { name = "coop-skill-refresh", text = CampaignLocale.Text("training.refresh", "Refresh skills") });
            var returnButton = new Button(back) { name = "coop-skill-back", text = CampaignLocale.Text("training.back", "Back to Pet collection") };
            returnButton.SetEnabled(!busy);
            Add(returnButton);
        }

        public async Task RefreshAsync(string outcome = null)
        {
            if (busy || pendingSkill != null) return;
            busy = true;
            progression = null;
            notice = CampaignLocale.Text("training.loading", "Loading skills…");
            Render();
            try
            {
                progression = await client.ReadAsync(instanceId, pet.petId, cancellation);
                notice = outcome;
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return; }
            catch (Wave1ApiException error) { notice = outcome == null ? error.Message : outcome + "\n" + error.Message; }
            catch (Exception)
            {
                var failure = CampaignLocale.Text("training.load_failed", "Skills could not be loaded.");
                notice = outcome == null ? failure : outcome + "\n" + failure;
            }
            finally { busy = false; }
            Render();
        }

        private async Task UpgradeAsync(CoopSkillClient.Skill skill)
        {
            if (busy || progression == null) return;
            if (pendingSkill == null)
            {
                pendingSkill = skill;
                pendingRequest = Guid.NewGuid();
            }
            busy = true;
            notice = CampaignLocale.Text("training.checking", "Checking upgrade…");
            Render();
            try
            {
                var receipt = await client.UpgradeAsync(instanceId, pendingRequest, progression, pendingSkill, cancellation);
                notice = CampaignLocale.Format("training.upgraded", "{0} reached Lv {1} · {2} materials spent · {3} remaining",
                    SkillName(receipt.skillId), receipt.level, receipt.spentMaterials, receipt.remainingMaterials);
                pendingSkill = null;
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return; }
            catch (Wave1ApiException error) when (error.Status >= 400 && error.Status < 500 && error.Status != 408 && error.Status != 429)
            {
                notice = error.Message;
                pendingSkill = null;
            }
            catch (Exception) { notice = CampaignLocale.Text("training.upgrade_unknown", "Upgrade result unavailable. Retry to check the same request."); }
            finally { busy = false; }
            if (pendingSkill == null) await RefreshAsync(notice);
            else Render();
        }

        private string SkillName(string skillId)
        {
            var prefix = pet.petId + "-";
            var name = skillId.StartsWith(prefix, StringComparison.Ordinal) ? skillId.Substring(prefix.Length) : skillId;
            return name == "guard" ? CoopNativePresentation.ActionName(name) :
                CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.Replace('-', ' '));
        }
    }
}
