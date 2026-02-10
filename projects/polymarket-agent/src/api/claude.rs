use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::config::ClaudeConfig;
use crate::types::{ExternalData, FairValueEstimate, Market};

pub struct ClaudeClient {
    client: reqwest::Client,
    config: ClaudeConfig,
    /// Running tally of API cost this session
    pub total_cost: f64,
}

#[derive(Debug, Serialize)]
struct MessageRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
    system: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct MessageResponse {
    content: Vec<ContentBlock>,
    usage: Usage,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Usage {
    input_tokens: u32,
    output_tokens: u32,
}

const SYSTEM_PROMPT: &str = r#"You are an expert prediction market analyst. Your job is to estimate fair probabilities for prediction market outcomes.

You must respond with ONLY valid JSON in this exact format:
{
  "probability": <float between 0.0 and 1.0>,
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "<brief explanation>",
  "data_points": ["<key fact 1>", "<key fact 2>", ...]
}

Rules:
- probability: Your estimated TRUE probability of the YES outcome
- confidence: How confident you are in your estimate (0.0 = pure guess, 1.0 = certain)
- Be calibrated. If you're uncertain, reflect that in both probability and confidence.
- Use the external data provided to form your estimate.
- Consider base rates, recent trends, and any relevant domain knowledge.
- Be especially attentive to temporal factors (when does the market resolve?)
- Look for information asymmetry: what do you know that the market might not have priced in?"#;

impl ClaudeClient {
    pub fn new(config: &ClaudeConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            config: config.clone(),
            total_cost: 0.0,
        }
    }

    /// Estimate fair value for a market using Claude reasoning
    pub async fn estimate_fair_value(
        &mut self,
        market: &Market,
        external_data: &[ExternalData],
    ) -> Result<FairValueEstimate> {
        let user_prompt = build_analysis_prompt(market, external_data);

        debug!("Analyzing market: {}", market.question);

        let request = MessageRequest {
            model: self.config.model.clone(),
            max_tokens: self.config.max_tokens,
            messages: vec![Message {
                role: "user".to_string(),
                content: user_prompt,
            }],
            system: SYSTEM_PROMPT.to_string(),
        };

        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to call Claude API")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Claude API error {}: {}", status, body);
        }

        let msg: MessageResponse = resp.json().await.context("Failed to parse Claude response")?;

        // Track cost (approximate pricing: $3/MTok input, $15/MTok output for Sonnet)
        let input_cost = msg.usage.input_tokens as f64 * 3.0 / 1_000_000.0;
        let output_cost = msg.usage.output_tokens as f64 * 15.0 / 1_000_000.0;
        let call_cost = input_cost + output_cost;
        self.total_cost += call_cost;

        info!(
            "Claude analysis cost: ${:.4} (total: ${:.4}) | tokens: {}in/{}out",
            call_cost, self.total_cost, msg.usage.input_tokens, msg.usage.output_tokens
        );

        let text = msg
            .content
            .first()
            .and_then(|c| c.text.as_ref())
            .context("No text in Claude response")?;

        parse_fair_value_response(text)
    }

    /// Get the cost of the last API session
    pub fn session_cost(&self) -> f64 {
        self.total_cost
    }

    /// Reset cost tracking (e.g., after billing)
    pub fn reset_cost(&mut self) {
        self.total_cost = 0.0;
    }
}

fn build_analysis_prompt(market: &Market, external_data: &[ExternalData]) -> String {
    let mut prompt = format!(
        "Analyze this prediction market and estimate the true probability of YES:\n\n\
         **Market Question:** {}\n\
         **Description:** {}\n\
         **Current Market Prices:** YES={:.1}¢, NO={:.1}¢\n\
         **Volume:** ${:.0}\n\
         **Liquidity:** ${:.0}\n\
         **Category:** {:?}\n",
        market.question,
        market.description,
        market.outcome_prices.first().copied().unwrap_or(0.0) * 100.0,
        market.outcome_prices.get(1).copied().unwrap_or(0.0) * 100.0,
        market.volume,
        market.liquidity,
        market.category,
    );

    if let Some(end) = &market.end_date {
        prompt.push_str(&format!("**Resolution Date:** {}\n", end));
    }

    if !external_data.is_empty() {
        prompt.push_str("\n**External Data:**\n");
        for data in external_data {
            prompt.push_str(&format!("\n[{}] {}\n", data.source, data.summary));
            for point in &data.data_points {
                prompt.push_str(&format!("  - {}: {}\n", point.label, point.value));
            }
        }
    }

    prompt.push_str(
        "\nProvide your probability estimate as JSON. \
         Remember: the current market price is NOT necessarily correct. \
         Use the external data and your knowledge to form an independent estimate.",
    );

    prompt
}

fn parse_fair_value_response(text: &str) -> Result<FairValueEstimate> {
    // Try to extract JSON from the response (handle markdown code blocks)
    let json_str = if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            &text[start..=end]
        } else {
            text
        }
    } else {
        text
    };

    let parsed: serde_json::Value =
        serde_json::from_str(json_str).context("Failed to parse Claude JSON response")?;

    let probability = parsed["probability"]
        .as_f64()
        .context("Missing probability field")?
        .clamp(0.01, 0.99);

    let confidence = parsed["confidence"]
        .as_f64()
        .unwrap_or(0.5)
        .clamp(0.0, 1.0);

    let reasoning = parsed["reasoning"]
        .as_str()
        .unwrap_or("No reasoning provided")
        .to_string();

    let data_points = parsed["data_points"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(FairValueEstimate {
        probability,
        confidence,
        reasoning,
        data_points,
    })
}
