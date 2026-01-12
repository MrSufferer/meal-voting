// Copyright (c) Kyler
// SPDX-License-Identifier: Apache-2.0

/*! ABI of the Meal Voting Application */

use async_graphql::{Request, Response};
use linera_sdk::linera_base_types::{ContractAbi, ServiceAbi};
use serde::{Deserialize, Serialize};

pub struct MealVotingAbi;

/// Operations that can be executed on the contract.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum Operation {
    /// Initialize a new poll with a topic and votes per voter.
    CreatePoll { topic: String, votes_per_voter: u32, owner: String },
    /// Join the poll as a participant.
    Join { name: String, owner: String },
    /// Add a nomination to the poll (local chain only).
    Nominate { text: String, owner: String },
    /// Submit rankings for the nominations (local chain only).
    Vote { rankings: Vec<String>, owner: String },
    /// Start the voting phase (admin only).
    StartVote { owner: String },
    /// Close the poll and compute results (admin only).
    ClosePoll { owner: String },
}

/// Cross-chain messages for remote poll participation.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum Message {
    /// Initialize a new poll (sent to new chain).
    InitializePoll { topic: String, votes_per_voter: u32, admin_id: String },
    /// Nominate on a poll from another chain.
    Nominate { user_id: String, text: String },
    /// Vote on a poll from another chain.
    Vote { user_id: String, rankings: Vec<String> },
    /// Start voting phase (cross-chain, admin only).
    StartVote { user_id: String },
    /// Close poll (cross-chain, admin only).
    ClosePoll { user_id: String },
}

impl ContractAbi for MealVotingAbi {
    type Operation = Operation;
    type Response = ();
}

impl ServiceAbi for MealVotingAbi {
    type Query = Request;
    type QueryResponse = Response;
}
