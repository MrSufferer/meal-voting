// Copyright (c) Kyler
// SPDX-License-Identifier: Apache-2.0

use async_graphql::SimpleObject;
use linera_sdk::{
    linera_base_types::ChainId,
    views::{linera_views, MapView, RegisterView, RootView, ViewStorageContext},
};
use serde::{Deserialize, Serialize};

/// A single nomination (e.g., "Pizza Place").
#[derive(Clone, Debug, Deserialize, Serialize, SimpleObject)]
pub struct Nomination {
    pub user_id: String,
    pub text: String,
}

/// A nomination entry with its ID (for API responses).
#[derive(Clone, Debug, Deserialize, Serialize, SimpleObject)]
pub struct NominationEntry {
    pub nomination_id: String,
    pub user_id: String,
    pub text: String,
}

/// A participant entry (for API responses)
#[derive(Clone, Debug, Deserialize, Serialize, SimpleObject)]
pub struct ParticipantEntry {
    pub user_id: String,
    pub name: String,
}

/// A computed result entry.
#[derive(Clone, Debug, Deserialize, Serialize, SimpleObject)]
pub struct ResultEntry {
    pub nomination_id: String,
    pub nomination_text: String,
    pub score: u64,
}

/// The application state.
#[derive(RootView, SimpleObject)]
#[view(context = ViewStorageContext)]
pub struct PollState {
    /// The poll topic/question.
    pub topic: RegisterView<String>,
    /// Number of votes each participant can cast.
    pub votes_per_voter: RegisterView<u32>,
    /// The admin's user ID (chain owner).
    pub admin_id: RegisterView<String>,
    /// Whether voting has started.
    pub has_started: RegisterView<bool>,
    /// Whether the poll is closed.
    pub is_closed: RegisterView<bool>,
    /// Participants: user_id -> name.
    pub participants: MapView<String, String>,
    /// Nominations: nomination_id -> Nomination.
    pub nominations: MapView<String, Nomination>,
    /// Rankings: user_id -> ordered list of nomination_ids.
    pub rankings: MapView<String, Vec<String>>,
    /// Computed results after closing.
    pub results: RegisterView<Vec<ResultEntry>>,
    /// Factory: user_id -> list of created ChainIds.
    pub created_polls: MapView<String, Vec<ChainId>>,
}

/// A ranking entry (user -> list of nomination IDs).
#[derive(Clone, Debug, Deserialize, Serialize, SimpleObject)]
pub struct RankingEntry {
    pub user_id: String,
    pub nomination_ids: Vec<String>,
}
