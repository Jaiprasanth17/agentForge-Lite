#!/usr/bin/env tsx
/**
 * Precision Run Script
 *
 * Executes a golden-set of 20 curated prompts against the production web search
 * module and logs precision metrics:
 *
 * - precision@k (citations that match allowed domains / total citations)
 * - avg citations per answer
 * - p95 latency
 * - avg cost/call
 *
 * Usage:
 *   npx tsx scripts/precision-run.ts
 *
 * Requirements:
 *   - OPENAI_API_KEY or AZURE_OPENAI_API_KEY set in environment
 *   - Run from repo root: npx tsx scripts/precision-run.ts
 *
 * Output: JSON summary to stdout + detailed CSV to scripts/precision-results.csv
 */

import { resolve } from "path";
import { writeFileSync } from "fs";
import { config as dotenvConfig } from "dotenv";

// Load .env from project root
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Import the search module
import { search, loadConfig } from "../apps/server/src/tools/webSearchTool";
import type { SearchResponse } from "../apps/server/src/tools/webSearchTool";

// ---------------------------------------------------------------------------
// Golden prompts
// ---------------------------------------------------------------------------

const PROMPTS = [
  "Summarize RBI's latest circular on gen-AI risk controls (last 60 days). Include 3 citations.",
  "Capital adequacy updates from BIS in the past quarter; bullet list with links.",
  "What is the current Basel III endgame timeline for US banks?",
  "Compare RBI and Bank of England approaches to AI governance in banking.",
  "Verify whether IMF published new guidelines on crypto regulation this month.",
  "SEC enforcement actions on AI-related securities fraud 2025.",
  "Comprehensive review of EU AI Act implications for financial services. Include quotes with links.",
  "Latest RBI monetary policy rate decision.",
  "Find the exact text of BIS principle 7 on operational resilience.",
  "How are central banks using machine learning for fraud detection? Summarize with 5 citations.",
  "Bank of England stress testing framework updates last 3 months.",
  "Pros and cons of using LLMs for regulatory compliance automation.",
  "What did the FSB say about AI systemic risk in their latest report?",
  "Step-by-step walk me through how DORA regulation affects Indian banks.",
  "In-depth analysis of how generative AI is transforming KYC processes globally.",
  "Current LIBOR to SOFR transition status.",
  "Fact-check: Did RBI mandate AI model validation for all scheduled banks?",
  "Summarize BIS's most recent paper on foundation models in banking. Include quotes with links.",
  "Europa.eu digital finance package latest amendments.",
  "Thorough synthesis of how AI hallucination risks are addressed in banking regulation across G20 nations.",
];

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface PromptResult {
  promptIndex: number;
  query: string;
  citationCount: number;
  domainMatchCount: number;
  precisionAtK: number;
  latencyMs: number;
  costUSD: number;
  provider: string;
  mode: string;
  answerLength: number;
  error?: string;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const allowedDomains = config.allowedDomains;

  console.log("=== Web Search Precision Run ===");
  console.log(`Allowed domains: ${allowedDomains.join(", ")}`);
  console.log(`Total prompts: ${PROMPTS.length}`);
  console.log(`Provider: ${process.env.AZURE_OPENAI_ENABLED === "true" ? "Azure" : "OpenAI"}`);
  console.log(`API Key present: ${!!(process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY)}`);
  console.log("");

  const results: PromptResult[] = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const query = PROMPTS[i];
    console.log(`[${i + 1}/${PROMPTS.length}] ${query.slice(0, 80)}...`);

    try {
      const startTime = Date.now();
      const response: SearchResponse = await search({ query });
      const latencyMs = Date.now() - startTime;

      // Calculate precision@k: how many citations come from allowed domains
      let domainMatchCount = 0;
      for (const citation of response.citations) {
        try {
          const hostname = new URL(citation.url).hostname.replace(/^www\./, "");
          const matches = allowedDomains.some(
            (d) => hostname === d || hostname.endsWith(`.${d}`)
          );
          if (matches) domainMatchCount++;
        } catch {
          // Invalid URL
        }
      }

      const precisionAtK =
        response.citations.length > 0
          ? domainMatchCount / response.citations.length
          : 0;

      const result: PromptResult = {
        promptIndex: i + 1,
        query,
        citationCount: response.citations.length,
        domainMatchCount,
        precisionAtK,
        latencyMs: response.debug.latencyMs || latencyMs,
        costUSD: response.debug.costUSD,
        provider: response.debug.provider,
        mode: response.debug.mode,
        answerLength: response.answer.length,
      };

      results.push(result);
      console.log(
        `  -> citations: ${result.citationCount}, ` +
        `precision@k: ${(result.precisionAtK * 100).toFixed(1)}%, ` +
        `latency: ${result.latencyMs}ms, ` +
        `cost: $${result.costUSD.toFixed(4)}, ` +
        `provider: ${result.provider}`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  -> ERROR: ${errorMsg}`);
      results.push({
        promptIndex: i + 1,
        query,
        citationCount: 0,
        domainMatchCount: 0,
        precisionAtK: 0,
        latencyMs: 0,
        costUSD: 0,
        provider: "error",
        mode: "error",
        answerLength: 0,
        error: errorMsg,
      });
    }

    // Small delay between requests to avoid rate limiting
    if (i < PROMPTS.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ---------------------------------------------------------------------------
  // Summary statistics
  // ---------------------------------------------------------------------------

  const successful = results.filter((r) => !r.error);
  const latencies = successful.map((r) => r.latencyMs);
  const costs = successful.map((r) => r.costUSD);
  const citationCounts = successful.map((r) => r.citationCount);
  const precisions = successful.map((r) => r.precisionAtK);

  const summary = {
    totalPrompts: PROMPTS.length,
    successfulRuns: successful.length,
    failedRuns: results.filter((r) => r.error).length,
    avgCitationsPerAnswer:
      citationCounts.length > 0
        ? citationCounts.reduce((a, b) => a + b, 0) / citationCounts.length
        : 0,
    avgPrecisionAtK:
      precisions.length > 0
        ? precisions.reduce((a, b) => a + b, 0) / precisions.length
        : 0,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    avgCostPerCall:
      costs.length > 0
        ? costs.reduce((a, b) => a + b, 0) / costs.length
        : 0,
    totalCost: costs.reduce((a, b) => a + b, 0),
  };

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));

  // ---------------------------------------------------------------------------
  // Write CSV
  // ---------------------------------------------------------------------------

  const csvHeader =
    "prompt_index,query,citation_count,domain_match_count,precision_at_k,latency_ms,cost_usd,provider,mode,answer_length,error";
  const csvRows = results.map(
    (r) =>
      `${r.promptIndex},"${r.query.replace(/"/g, '""')}",${r.citationCount},${r.domainMatchCount},${r.precisionAtK.toFixed(3)},${r.latencyMs},${r.costUSD.toFixed(6)},${r.provider},${r.mode},${r.answerLength},${r.error || ""}`
  );

  const csvContent = [csvHeader, ...csvRows].join("\n");
  const csvPath = resolve(__dirname, "precision-results.csv");
  writeFileSync(csvPath, csvContent, "utf-8");
  console.log(`\nDetailed results written to: ${csvPath}`);

  // Write JSON summary
  const jsonPath = resolve(__dirname, "precision-summary.json");
  writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2), "utf-8");
  console.log(`JSON summary written to: ${jsonPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
