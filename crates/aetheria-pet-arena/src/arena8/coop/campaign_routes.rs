//! Typed campaign routes use separately authored combat profiles.
//! Eligibility, participation and grants remain platform responsibilities.

use super::config::{BossConfig, ConfigError, CoopConfig, ElementProfile, stable_id};
use crate::arena8::binding::{RosterState, identity};
use crate::wave1_mvp::{FEATURED_LIMITED_ID, MAPS, STANDARD_POOL};
use aetheria_game_core::{Value, canonical::list};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROUTES: usize = 48;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignRoute {
    pub id: String,
    pub map_id: String,
    pub opponent_pet_id: String,
    pub tier: RouteTier,
    pub prerequisite_encounter_id: Option<String>,
    pub enabled: bool,
    pub mode: RouteMode,
    pub profile: Option<BossConfig>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum RouteTier {
    Entry,
    Advanced,
    Boss,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum RouteMode {
    Solo,
    Either,
}

impl CampaignRoute {
    pub(super) fn selectable_profile(&self, solo: bool) -> Option<&BossConfig> {
        if self.enabled && (solo || self.mode == RouteMode::Either) {
            self.profile.as_ref()
        } else {
            None
        }
    }

    pub(super) fn to_value(&self) -> Value {
        let label = |literal: &str| Value::Text(literal.into());
        list([
            label(&self.id),
            label(&self.map_id),
            label(&self.opponent_pet_id),
            label(match self.tier {
                RouteTier::Entry => "entry",
                RouteTier::Advanced => "advanced",
                RouteTier::Boss => "boss",
            }),
            self.prerequisite_encounter_id
                .as_deref()
                .map_or(Value::Null, label),
            Value::Bool(self.enabled),
            label(match self.mode {
                RouteMode::Solo => "solo",
                RouteMode::Either => "either",
            }),
            self.profile
                .as_ref()
                .map_or(Value::Null, BossConfig::to_value),
        ])
    }
}

pub(super) fn validate_routes(
    config: &CoopConfig,
    elements: [&ElementProfile; 6],
    legacy_ids: &BTreeSet<&str>,
) -> Result<(), ConfigError> {
    let Some(routes) = &config.campaign_routes else {
        return Ok(());
    };
    if routes.is_empty() || routes.len() > MAX_ROUTES {
        return Err(ConfigError::CampaignRoute);
    }
    let mut by_id = BTreeMap::new();
    let mut opponents = BTreeSet::new();
    for route in routes {
        let identity = identity(&route.opponent_pet_id).ok_or(ConfigError::CampaignRoute)?;
        let pet = config
            .pet(&route.opponent_pet_id)
            .ok_or(ConfigError::CampaignRoute)?;
        let map = MAPS
            .iter()
            .find(|map| map.id == route.map_id)
            .ok_or(ConfigError::CampaignRoute)?;
        if !stable_id(&route.id)
            || route.id.strip_prefix("recruit-") != Some(route.opponent_pet_id.as_str())
            || legacy_ids.contains(route.id.as_str())
            || !config
                .bosses()
                .iter()
                .any(|boss| boss.map_id.as_deref() == Some(map.id))
            || by_id.insert(route.id.as_str(), route).is_some()
            || !opponents.insert(identity.id)
            || identity.roster_state != RosterState::Active
            || identity.id == FEATURED_LIMITED_ID
            || STANDARD_POOL.contains(&identity.id)
            || identity.element.index() != map.element.index()
            || pet.element()? != identity.element
            || pet
                .catalog
                .as_ref()
                .and_then(|catalog| catalog.map_id.as_deref())
                != Some(map.id)
        {
            return Err(ConfigError::CampaignRoute);
        }
        let Some(profile) = &route.profile else {
            if route.enabled {
                return Err(ConfigError::CampaignRoute);
            }
            continue;
        };
        let rewards = profile.reward_policy.as_ref().ok_or(ConfigError::Rewards)?;
        if profile.id != route.id
            || profile.map_id.as_deref() != Some(map.id)
            || profile.element()? != identity.element
            || profile.solo.is_some()
            || profile.regular.is_some()
            || profile.required_map_clear.is_some()
            || rewards
                .recruitment_pet_ids
                .as_ref()
                .is_some_and(|ids| ids.len() != 1 || ids[0] != identity.id)
        {
            return Err(ConfigError::CampaignRoute);
        }
        profile.validate(elements)?;
    }

    for route in routes {
        let mut visited = BTreeSet::from([route.id.as_str()]);
        let mut current = route;
        while let Some(condition) = current.prerequisite_encounter_id.as_deref() {
            let previous = by_id.get(condition).ok_or(ConfigError::CampaignRoute)?;
            if previous.map_id != route.map_id
                || (current.enabled && !previous.enabled)
                || !visited.insert(condition)
            {
                return Err(ConfigError::CampaignRoute);
            }
            current = previous;
        }
    }
    Ok(())
}
