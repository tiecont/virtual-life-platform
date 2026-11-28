use super::*;
use serde_json::{Value as Json, json};

const SHARED: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../config/gameplay/arena8-coop-shared-rng-v1.candidate.json"
));
const CONTENT: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../specs/pet-arena/campaign-v4-content.json"
));
const COALWHISK: &str = "recruit-fire-coalwhisk";
const EMBERLOOM: &str = "recruit-fire-emberloom";

fn authored_routes() -> Json {
    let content: Json = serde_json::from_slice(CONTENT).unwrap();
    let routes = content["maps"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|map| {
            map["routes"].as_array().unwrap().iter().map(move |route| {
                json!({
                    "id":route["encounterId"],
                    "mapId":map["id"],
                    "opponentPetId":route["opponentPetId"],
                    "tier":route["tier"],
                    "prerequisiteEncounterId":route["prerequisiteEncounterId"],
                    "enabled":false,
                    "mode":if route["tier"] == "entry" {"solo"} else {"either"},
                })
            })
        })
        .collect::<Vec<_>>();
    let mut bundle: Json = serde_json::from_slice(SHARED).unwrap();
    bundle["schemaVersion"] = json!(7);
    bundle["engineCapability"] = json!("arena8-coop-v6");
    bundle["campaignRoutes"] = json!(routes);
    bundle
}

fn authored_profile(bundle: &Json, route: &str, opponent: &str, hp: u32) -> Json {
    let mut profile = bundle["bosses"][0].clone();
    profile["id"] = json!(route);
    profile["name"] = json!(opponent);
    profile["maxHp"] = json!(hp);
    profile["rewardPolicy"]["recruitmentPetIds"] = json!([opponent]);
    profile.as_object_mut().unwrap().remove("regular");
    profile
}

fn parse(bundle: &Json) -> Result<CoopConfig, ConfigError> {
    CoopConfig::parse(&serde_json::to_vec(bundle).unwrap())
}

#[test]
fn all_authored_campaign_routes_parse_but_dormant_routes_are_not_selectable() {
    let bundle = authored_routes();
    let known_digest = CoopConfig::parse(SHARED).unwrap().digest();
    let config = parse(&bundle).unwrap();
    assert_eq!(config.campaign_routes.as_ref().unwrap().len(), 48);
    assert_ne!(config.digest(), known_digest);
    assert!(matches!(
        CoopRules::from_config(config.clone(), COALWHISK.into()),
        Err(ConfigError::CampaignRoute)
    ));
    assert!(matches!(
        CoopRules::load_solo(&serde_json::to_vec(&bundle).unwrap(), COALWHISK.into()),
        Err(ConfigError::CampaignRoute)
    ));

    let legacy = CoopRules::from_config(config, "cinder-terraces-warden".into()).unwrap();
    assert_eq!(legacy.campaign_route_id(), None);
    let mut unsupported = bundle;
    unsupported["schemaVersion"] = json!(6);
    unsupported["engineCapability"] = json!("arena8-coop-v5");
    assert_eq!(parse(&unsupported), Err(ConfigError::Identity));
}

#[test]
fn distinct_enabled_profiles_bind_exactly_and_respect_authored_party_mode() {
    let mut bundle = authored_routes();
    let entry = authored_profile(&bundle, COALWHISK, "fire-coalwhisk", 150);
    let further = authored_profile(&bundle, EMBERLOOM, "fire-emberloom", 250);
    bundle["campaignRoutes"][0]["enabled"] = json!(true);
    bundle["campaignRoutes"][0]["profile"] = entry;
    bundle["campaignRoutes"][1]["enabled"] = json!(true);
    bundle["campaignRoutes"][1]["profile"] = further;
    bundle["campaignRoutes"][1]["mode"] = json!("either");
    let bytes = serde_json::to_vec(&bundle).unwrap();
    let first = CoopRules::load_solo(&bytes, COALWHISK.into()).unwrap();
    assert_eq!(first.campaign_route_id(), Some(COALWHISK));
    assert_eq!(first.selected_boss().max_hp, 150);
    assert_eq!(first.ruleset().version, SHARED_RNG_SOLO_RULESET_VERSION);
    assert!(matches!(
        CoopRules::load(&bytes, COALWHISK.into()),
        Err(ConfigError::CampaignRoute)
    ));
    let second = CoopRules::load_solo(&bytes, EMBERLOOM.into()).unwrap();
    let coop = CoopRules::load(&bytes, EMBERLOOM.into()).unwrap();
    assert_eq!(coop.ruleset().version, SHARED_RNG_RULESET_VERSION);
    assert_eq!(coop.selected_boss(), second.selected_boss());
    assert_eq!(second.campaign_route_id(), Some(EMBERLOOM));
    assert_eq!(second.selected_boss().max_hp, 250);
    assert_eq!(
        second
            .allocate_solo(
                seats()[0].clone(),
                &ArtifactLoadout {
                    digest: ArtifactLoadout::digest(second.digest(), &seats()[0], &[]),
                    entries: Vec::new(),
                }
            )
            .unwrap()
            .boss_id
            .as_deref(),
        Some(EMBERLOOM)
    );
}

#[test]
fn validation_rejects_unbacked_profiles_wrong_rewards_and_invalid_route_graphs() {
    let base = authored_routes();
    for (path, value) in [
        ("/campaignRoutes/0/enabled", json!(true)),
        (
            "/campaignRoutes/0/opponentPetId",
            json!("pet-s-fire-vulcaryn"),
        ),
        (
            "/campaignRoutes/0/prerequisiteEncounterId",
            json!(EMBERLOOM),
        ),
        (
            "/campaignRoutes/0/prerequisiteEncounterId",
            json!("recruit-water-dewskip"),
        ),
        (
            "/campaignRoutes/0/prerequisiteEncounterId",
            json!("recruit-missing"),
        ),
        ("/campaignRoutes/1/id", json!(COALWHISK)),
    ] {
        let mut input = base.clone();
        *input.pointer_mut(path).unwrap() = value;
        assert_eq!(parse(&input), Err(ConfigError::CampaignRoute), "{path}");
    }
    let mut cheats = base;
    let mut different_species = authored_profile(&cheats, COALWHISK, "fire-coalwhisk", 150);
    different_species["rewardPolicy"]["recruitmentPetIds"] = json!(["fire-emberloom"]);
    cheats["campaignRoutes"][0]["profile"] = different_species;
    assert_eq!(parse(&cheats), Err(ConfigError::CampaignRoute));
}
