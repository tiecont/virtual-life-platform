using System;
using System.Threading.Tasks;
using Aetheria.Networking;
using Aetheria.PetArena.Infrastructure;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    public sealed partial class Arena8CampaignScreen
    {
        private const string FunctionalBoardVariable = "AETHERIA_ARENA8_FUNCTIONAL";
        private CoopNativePlaySession functionalSession;
        private CoopNativeHud functionalHud;

        private bool UsesFunctionalBoard =>
            nativeMode && Environment.GetEnvironmentVariable(FunctionalBoardVariable) == "1";

        private async Task AllocateFunctional(string map, string encounter, bool automated = false)
        {
            if (api == null || state?.FindPet(selectedPet) == null)
                throw new InvalidOperationException("Choose an owned Pet first.");
            DisposeNative();
            var request = new Arena8FunctionalAllocateRequest
            {
                requestId = NewRequestId(), petId = selectedPet, mapId = map, encounterId = encounter
            };
            var admission = await Arena8NativeAdmission.OpenAsync(
                token => api.AllocateArena8Functional(request, token), lifetime.Token,
                CoopNativeView.FunctionalSoloRuleset);
            nativeTrust = Arena8NativeTrust.FromEnvironment(admission.HttpsOrigin);
            var platform = new PlatformSession(admission.HttpsOrigin);
            CoopNativePlaySession session = null;
            try
            {
                var connection = new NativeConnection(admission.WssOrigin, admission.HttpsOrigin,
                    admission.ContentHash, admission.BootId, admission.TicketAsync, clientBuild: admission.ClientBuild);
                var expectedRoute = encounter.StartsWith("recruit-", StringComparison.Ordinal) ? encounter : null;
                session = new CoopNativePlaySession(platform, connection, admission.MatchId,
                    CoopNativeView.FunctionalSoloRuleset, expectedRoute);
                await session.ConnectAsync(lifetime.Token);

                functionalSession = session;
                matchId = admission.MatchIdText;
                var document = GetComponent<UIDocument>();
                functionalHud = gameObject.AddComponent<CoopNativeHud>();
                // Capture drives the same admitted session and renders each receipt explicitly.
                functionalHud.enabled = !automated;
                functionalHud.Attach(document);
                stage?.PresentFixedNativeBattle(map);
                functionalHud.Bind(session, ReturnFromFunctionalBattle, "Return to roster", requireSettlement: true);
                var settle = new Arena8SettleRequest { requestId = NewRequestId() };
                functionalHud.SetSettlementLoader(async () =>
                {
                    var receipt = await api.SettleArena8Native(admission.MatchIdText, settle, lifetime.Token);
                    if (!Guid.TryParse(receipt.matchId, out var settledMatch) || settledMatch != admission.MatchId)
                        throw new NativeFailure(Failure.Scope);
                    return receipt.coins + " coins · " + receipt.exp + " Pet EXP · " + receipt.materials + " Artifact materials" +
                        (string.IsNullOrEmpty(receipt.artifactId) ? "" : " · Artifact " + receipt.artifactId) +
                        (string.IsNullOrEmpty(receipt.recruitedPetId) ? "" : " · recruited " + receipt.recruitedPetId);
                });
            }
            catch
            {
                if (functionalSession != null) DisposeFunctional();
                else if (session != null) session.Dispose();
                else platform.Dispose();
                nativeTrust?.Dispose();
                nativeTrust = null;
                throw;
            }
        }

        private void ReturnFromFunctionalBattle()
        {
            DisposeNative();
            Run(LoadLobby, "Loading roster");
        }

        private void DisposeFunctional()
        {
            if (functionalHud != null)
            {
                functionalHud.Bind(null);
                Destroy(functionalHud);
                functionalHud = null;
            }
            functionalSession?.Dispose();
            functionalSession = null;
        }
    }
}
