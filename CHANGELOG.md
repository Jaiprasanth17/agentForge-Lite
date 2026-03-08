# Changelog

## [Unreleased]

### Added
- **Production-grade Web Search tool** with OpenAI Responses API and Azure OpenAI fallback
  - Three depth modes: lookup (60s, gpt-4o-mini), agentic (120s, gpt-4o), deep (240s, gpt-4o)
  - Automatic mode inference from query patterns (research, verification, simple lookup)
  - Domain allow-list and block-list filtering (default: BIS, IMF, RBI, BoE, SEC, EU)
  - Inline citations extracted from API message annotations
  - Domain authority scoring and result reranking
  - Circuit breaker: auto-downgrade to lookup after 3 consecutive timeouts in 5 minutes
  - Cost cap enforcement with mid-run synthesis fallback
  - Retry with exponential backoff (configurable: max, baseDelayMs, exponent)
  - Observability hooks with structured metric events (start/done/error)
  - Graceful fallback to legacy DuckDuckGo search when no API keys configured
  - Configuration via `config/web-search.json` with environment variable overrides
  - 20 golden-set precision tests for banking/AI/regulatory queries
  - Smoke test script: `scripts/search-smoke.ts`
  - Developer documentation: `docs/web-search.md`
