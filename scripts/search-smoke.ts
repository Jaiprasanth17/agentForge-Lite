/**
 * Web Search Smoke Test Script
 *
 * Quick health check for the production-grade web search tool.
 * Runs the exact prompt specified in the task requirements and
 * reports answer text, citations, timings, and cost estimate.
 *
 * Usage:
 *   npx tsx scripts/search-smoke.ts
 *
 * Requires:
 *   OPENAI_API_KEY or AZURE_OPENAI_API_KEY in .env
 *   (Falls back to DuckDuckGo if no API keys are set)
 */

import dotenv from "dotenv";
import path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { search, loadConfig, onMetric, resetConfig } from "../apps/server/src/tools/webSearchTool";

async function main() {
  console.log("=== Web Search Smoke Test ===");
  console.log("");

  // Reset and load config
  resetConfig();
  const config = loadConfig();
  console.log("Config loaded:");
  console.log("  Provider:", config.provider);
  console.log("  Mode:", config.mode);
  console.log("  Timeout:", config.timeoutMs + "ms");
  console.log("  Max cost:", "$" + config.maxCostUSD);
  console.log("  Allowed domains:", config.allowedDomains.join(", ") || "(all)");
  console.log("  Retries:", config.retries.max);
  console.log("  Circuit breaker threshold:", config.circuitBreaker.consecutiveFailures);
  console.log("");

  // Register metric listener
  const events: Array<Record<string, unknown>> = [];
  const unsub = onMetric((event) => {
    events.push({ ...event });
  });

  // The exact prompt from the task requirements
  const prompt = "Latest RBI circular on AI/ML risk (last 60 days) \u2014 3 citations.";
  console.log("Prompt:", prompt);
  console.log("");

  const startTime = Date.now();

  try {
    const result = await search({ query: prompt });
    const elapsed = Date.now() - startTime;

    console.log("=== RESULTS ===");
    console.log("");
    console.log("Answer:");
    console.log(result.answer);
    console.log("");

    console.log("Citations (" + result.citations.length + "):");
    for (const c of result.citations) {
      console.log("  - " + (c.title || "(no title)") + ": " + c.url);
    }
    console.log("");

    console.log("Sources (" + result.sources.length + "):");
    for (const s of result.sources) {
      console.log("  - [" + s.action + "] " + s.url + " (id: " + s.id + ")");
    }
    console.log("");

    console.log("Debug:");
    console.log("  Tool calls:", result.debug.toolCalls.length);
    console.log("  Latency:", result.debug.latencyMs + "ms");
    console.log("  Cost: $" + result.debug.cost.toolCallsUSD.toFixed(4));
    console.log("");

    console.log("Timing:");
    console.log("  Total elapsed:", elapsed + "ms");
    console.log("");

    console.log("Metric events (" + events.length + "):");
    for (const e of events) {
      console.log("  " + JSON.stringify(e));
    }
    console.log("");

    // Validation
    const pass = result.citations.length > 0 && result.answer.length > 0;
    console.log("=== " + (pass ? "PASS" : "FAIL") + " ===");
    console.log("  Answer present:", result.answer.length > 0 ? "YES" : "NO");
    console.log("  Citations present:", result.citations.length > 0 ? "YES (" + result.citations.length + ")" : "NO");
    console.log("  Cost within cap:", result.debug.cost.toolCallsUSD <= config.maxCostUSD ? "YES" : "NO");

    process.exit(pass ? 0 : 1);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error("=== ERROR ===");
    console.error("  Message:", err instanceof Error ? err.message : String(err));
    console.error("  Elapsed:", elapsed + "ms");
    console.error("");
    console.error("Metric events (" + events.length + "):");
    for (const e of events) {
      console.error("  " + JSON.stringify(e));
    }
    process.exit(1);
  } finally {
    unsub();
  }
}

main();
