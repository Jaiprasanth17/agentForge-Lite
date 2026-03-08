# Web Search Tool - Developer Documentation

## Overview

The Web Search tool provides production-grade web search capabilities for Agentic Nexus agents and workflows. It uses OpenAI's Responses API with automatic Azure OpenAI fallback, supporting three depth modes, domain allow-listing, inline citations, circuit-breaker reliability, and cost tracking.

## Architecture

```
apps/server/src/tools/webSearchTool/
  index.ts          - Unified entry point (search, config, circuit breaker, observability)
  schemas.ts        - Zod schemas for all types
  planner.ts        - Query planning, mode inference, domain filtering
  provider.openai.ts - OpenAI Responses API integration
  provider.azure.ts  - Azure OpenAI web_search_preview integration
  reranker.ts       - Result dedup, domain scoring, top-k ranking
  __tests__/        - Unit tests and golden-set precision tests
```

## Depth Modes

| Mode     | Timeout | Model       | Description                              |
|----------|---------|-------------|------------------------------------------|
| lookup   | 60s     | gpt-4o-mini | Single search pass, no page opens        |
| agentic  | 120s    | gpt-4o      | Reasoning + open_page + find_in_page     |
| deep     | 240s    | gpt-4o      | Thorough multi-pass research             |

Mode is auto-inferred from query patterns:
- **deep**: "summarize", "comprehensive", "compare and contrast", "with N citations", "in-depth"
- **agentic**: "verify", "fact-check", "find the exact", "step-by-step"
- **lookup**: short queries, simple facts

## Configuration

### Config File: `apps/server/config/web-search.json`

```json
{
  "enabled": true,
  "provider": "openai",
  "mode": "lookup",
  "timeoutMs": 90000,
  "allowedDomains": [
    "bis.org", "imf.org", "rbi.org.in",
    "bankofengland.co.uk", "sec.gov", "europa.eu"
  ],
  "blocklistDomains": [],
  "maxPages": 5,
  "maxCostUSD": 0.25,
  "locale": "en-IN",
  "retries": {
    "max": 3,
    "baseDelayMs": 1500,
    "exponent": 2.0
  },
  "circuitBreaker": {
    "consecutiveFailures": 3,
    "windowMs": 300000,
    "downgradeMode": "lookup"
  }
}
```

### Environment Variable Overrides

| Variable                      | Description                                  | Example            |
|-------------------------------|----------------------------------------------|--------------------|
| `WEB_SEARCH_ENABLED`         | Enable/disable web search                    | `true`             |
| `WEB_SEARCH_MODE`            | Default depth mode                           | `lookup`           |
| `WEB_SEARCH_ALLOWED_DOMAINS` | Comma-separated domain allow-list            | `bis.org,imf.org`  |
| `WEB_SEARCH_TIMEOUT_MS`      | Global timeout override in ms                | `90000`            |
| `WEB_SEARCH_MAX_COST_USD`    | Cost cap per search call                     | `0.25`             |
| `OPENAI_WEB_SEARCH_MODEL`    | Override model for web search                | `gpt-4o`           |
| `AZURE_OPENAI_ENABLED`       | Auto-switch to Azure OpenAI provider         | `true`             |

## SearchResponse Schema

```typescript
interface SearchResponse {
  answer: string;                    // Final answer with inline Markdown citation links
  citations: Citation[];             // Extracted from API message annotations
  sources: Source[];                 // Tool-call action records
  debug: {
    toolCalls: any[];                // Raw tool-call items
    latencyMs: number;               // End-to-end latency
    cost: { toolCallsUSD: number };  // Estimated cost
  };
}

interface Citation { url: string; title?: string; }
interface Source { url: string; action: "search" | "open_page" | "find_in_page"; id: string; }
```

## Reliability

### Retry with Exponential Backoff

Configured via `retries` in config:
- `max`: Maximum retry attempts (default: 3)
- `baseDelayMs`: Base delay between retries (default: 1500ms)
- `exponent`: Backoff multiplier (default: 2.0)

Delay formula: `baseDelayMs * (exponent ^ attemptIndex)`

### Circuit Breaker

If **3 consecutive timeouts** occur within a **5-minute window**, the system auto-downgrades to `lookup` mode until a successful call resets the circuit.

Configuration:
- `consecutiveFailures`: Threshold (default: 3)
- `windowMs`: Sliding window (default: 300000ms = 5 min)
- `downgradeMode`: Fallback mode (default: "lookup")

### Cost Cap Enforcement

If `maxCostUSD` is exceeded mid-run, the system logs a warning and stops further actions, synthesizing with current evidence.

### Fallback

When `failOpenToFallback` is true (default) and no API keys are configured, the system falls back to legacy DuckDuckGo HTML search.

## Observability

### Metric Events

Subscribe to events:

```typescript
import { onMetric } from "./tools/webSearchTool";

const unsub = onMetric((event) => {
  // event.type: "tool.web_search.start" | "tool.web_search.done" | "tool.web_search.error"
  // event.callId, event.mode, event.provider
  // event.latencyMs, event.costUSD, event.citationCount (on done)
  // event.error, event.errorCode (on error)
  console.log(event);
});

// Unsubscribe when done
unsub();
```

### Structured Logging

All logs use the `[WebSearch:tag]` prefix with key=value format:
```
[WebSearch:start] callId=ws_123 mode=lookup provider=openai
[WebSearch:done] callId=ws_123 mode=lookup provider=openai latency=2340ms cost=$0.0300 citations=3
```

API keys are never logged.

## Azure OpenAI

When `AZURE_OPENAI_ENABLED=true`, the tool automatically switches to Azure OpenAI:
- Tool type: `web_search_preview` (NOT `web_search`)
- Requires: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`
- Same public interface and response schema

## Domain Allow-List

Default domains (banking/regulatory focus):
- `bis.org` - Bank for International Settlements
- `imf.org` - International Monetary Fund
- `rbi.org.in` - Reserve Bank of India
- `bankofengland.co.uk` - Bank of England
- `sec.gov` - US Securities and Exchange Commission
- `europa.eu` - European Union

When the allow-list is empty, a WARNING is logged and all domains are permitted.

## Testing

### Unit Tests

```bash
cd apps/server
npx vitest run src/tools/webSearchTool/__tests__/webSearchTool.test.ts
```

### Golden-Set Precision Tests

20 curated prompts covering banking/AI/regulatory queries:

```bash
npx vitest run src/tools/webSearchTool/__tests__/precision.test.ts
```

### Smoke Test

```bash
npx tsx scripts/search-smoke.ts
```

Prompt: "Latest RBI circular on AI/ML risk (last 60 days) - 3 citations."

Reports: answer text, citations, timings, cost estimate.

## SRE Runbook

### p95 Latency Targets

| Mode    | Target  |
|---------|---------|
| lookup  | <= 6s   |
| agentic | <= 20s  |
| deep    | <= 4min |

### Alerts

- Circuit breaker activation: Watch for `[WebSearch:CircuitBreaker] WARN` logs
- Cost overrun: Watch for `Cost exceeds cap` warnings
- Fallback activation: Watch for `Falling back to legacy` warnings

### Recovery

1. If circuit breaker is active, it auto-resets after a successful call
2. If costs are too high, reduce `maxCostUSD` or switch to `lookup` mode
3. If provider is down, set `failOpenToFallback: true` for DuckDuckGo fallback
