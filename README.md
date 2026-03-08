# Agentic Nexus

A full-stack application for designing, configuring, and testing AI agents with an intuitive visual builder.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agentic Nexus                         │
├─────────────────────┬───────────────────────────────────┤
│   Client (React)    │         Server (Express)          │
│                     │                                   │
│  ┌───────────────┐  │  ┌─────────────┐  ┌───────────┐  │
│  │  React Router  │  │  │  REST API   │  │ WebSocket │  │
│  │  ┌──────────┐ │  │  │  /api/agents│  │ /ws/test  │  │
│  │  │  Home    │ │  │  │  /api/prov. │  │           │  │
│  │  │  Builder │ │  │  └──────┬──────┘  └─────┬─────┘  │
│  │  │  List   │ │  │         │                │        │
│  │  │  Test   │ │  │  ┌──────┴────────────────┴─────┐  │
│  │  │  Settings│ │  │  │     LLM Provider Layer      │  │
│  │  └──────────┘ │  │  │  ┌────────┐ ┌──────────┐   │  │
│  └───────────────┘  │  │  │ OpenAI │ │ Anthropic│   │  │
│                     │  │  ├────────┤ ├──────────┤   │  │
│  ┌───────────────┐  │  │  │  Mock  │ │ (Add New)│   │  │
│  │   Zustand     │  │  │  └────────┘ └──────────┘   │  │
│  │ React Query   │  │  └────────────────────────────┘  │
│  └───────────────┘  │                                   │
│                     │  ┌────────────────────────────┐   │
│  ┌───────────────┐  │  │     Simulated Tools        │   │
│  │  Lottie Anim  │  │  │  Web Search │ Code Interp  │   │
│  │  TailwindCSS  │  │  │  Memory (Vector Store)     │   │
│  └───────────────┘  │  └────────────────────────────┘   │
│                     │                                   │
│                     │  ┌────────────────────────────┐   │
│                     │  │  SQLite (Prisma ORM)       │   │
│                     │  │  Agent │ Conversation       │   │
│                     │  └────────────────────────────┘   │
└─────────────────────┴───────────────────────────────────┘
```

## Tech Stack

| Layer            | Technology                              |
|------------------|-----------------------------------------|
| Frontend         | React 18 + Vite + TypeScript + Tailwind |
| Animation        | Lottie (lottie-react)                   |
| State            | Zustand + React Query                   |
| Backend          | Node.js + Express + TypeScript          |
| Realtime         | WebSocket (ws)                          |
| Database         | SQLite via Prisma                       |
| LLM Providers    | OpenAI, Anthropic, Mock                 |
| Vector Store     | In-memory cosine similarity             |

## Setup

### Prerequisites

- Node.js 20+
- npm 9+

### Quick Start

```bash
# 1. Clone and install
cd agentforge-lite
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env to add API keys (optional - Mock provider works by default)

# 3. Initialize database
npm run db:push

# 4. Seed sample agents
npm run seed

# 5. Start development
npm run dev
```

The app will be available at:
- **Client**: http://localhost:5173
- **Server**: http://localhost:8080
- **WebSocket**: ws://localhost:8080/ws/test

### Environment Variables

```bash
PORT=5173              # Client dev server port
SERVER_PORT=8080       # API server port
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:8080

LLM_PROVIDER=mock      # Default provider: openai | anthropic | mock
OPENAI_API_KEY=         # Required for OpenAI provider
ANTHROPIC_API_KEY=      # Required for Anthropic provider
JWT_SECRET=dev-secret   # JWT signing secret (auth scaffold)
```

### Available Scripts

| Command          | Description                        |
|------------------|------------------------------------|
| `npm run dev`    | Start client & server concurrently |
| `npm run build`  | Build both client and server       |
| `npm run db:push`| Push Prisma schema to SQLite       |
| `npm run seed`   | Seed two sample agents             |
| `npm run lint`   | Run TypeScript checks              |
| `npm run test`   | Run all tests                      |
| `npm run ingest:knowledge` | Ingest PDFs into knowledge base |

## Features

### Home Page
- Full-screen hero with dark gradient background
- Lottie animated AI character (idle loop with blink)
- Click character for interactive tooltip
- CTA buttons: "Create Agent" and "Open a Saved Agent"

### Agent Builder
- **Identity**: Name, model selection, role/persona, system instructions
- **Capabilities**: Toggle chips for Web Search, Code Interpreter, Memory, Advanced Reasoning
- **Parameters**: Temperature, Max Tokens, Top-p, Tool Choice, Context Window Budget
- **Actions**: Save Draft, Deploy (active), Test Agent

### Test Console
- Split view: agent config summary (left) + chat window (right)
- Real-time streaming via WebSocket
- Token usage ticker and latency display
- "Run with Tools" toggle
- Human-in-the-loop: Approve/Reject gates for tool calls
- Copyable curl snippet to reproduce runs
- `/clear` command to reset conversation

### Settings
- Provider API key configuration (via .env)
- Dynamic model picker from each provider adapter
- Environment information display
- Knowledge Base status panel with document/chunk counts and reindex button

### Help & Onboarding Page
- Animated explainer with Lottie (JSON vector animation) showing the end-to-end workflow
- MP4 fallback support for browsers without Lottie
- 6-step "How It Works" guide with icons, descriptions, and action links
- FAQ accordion (5 items) with expand/collapse
- CTA buttons: Create Agent, Create Workflow, Open Docs
- Accessibility: reduced motion support, VTT captions, keyboard controls
- Analytics event tracking (console in dev, abstractable for production)
- All copy centralized in `help.copy.ts` for easy editing and i18n

**To customize the animation:** Replace `apps/client/src/assets/help/agentic_explainer.json` with your brand-approved Lottie JSON file (800×400px recommended, <1.2 MB).

**To edit FAQ/steps:** Update `apps/client/src/components/help/help.copy.ts`.

### Knowledge Base (PDF RAG)

Agentic Nexus includes a built-in PDF knowledge base with retrieval-augmented generation (RAG).

**How it works:**
1. Drop PDF files into `apps/server/knowledge/pdfs/`
2. Run `npm run ingest:knowledge` to parse, chunk, and index them
3. Enable the "Knowledge" tool on any agent in the Agent Builder
4. The agent can now search and cite your PDFs when answering questions

**Providers:**
- `bm25` (default): Works offline with no API keys. Uses BM25 term-frequency scoring.
- `openai`: When `OPENAI_API_KEY` is set, uses `text-embedding-3-small` for semantic embeddings (higher relevance).

Set `KNOWLEDGE_PROVIDER=bm25` or `KNOWLEDGE_PROVIDER=openai` in `.env`.

**Endpoints:**
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/knowledge/status` | Document/chunk counts and provider info |
| GET | `/api/knowledge/search?q=...&topK=5` | Direct search (for debugging) |
| POST | `/api/knowledge/reindex` | Re-run ingestion |

**Static PDF access:** PDFs are served read-only at `/static/knowledge/<filename>.pdf`.

**Sample PDF:** A quickstart guide is included at `apps/server/knowledge/pdfs/agentic-nexus-quickstart.pdf` for demo purposes.

## Web Search (Production-Grade)

Agentic Nexus includes a production-grade web search module powered by OpenAI's Responses API with automatic Azure OpenAI fallback.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  search(request) → SearchResponse                        │
├──────────────────────────────────────────────────────────┤
│  planner.ts  → depth mode, domain filters, time window   │
│  provider.openai.ts → Responses API (web_search tool)    │
│  provider.azure.ts  → Azure (web_search_preview)         │
│  reranker.ts → dedup, domain emphasis, top-k scoring     │
│  schemas.ts  → Zod-validated SearchRequest/Response       │
│  Fallback    → Legacy DuckDuckGo (no API key needed)     │
└──────────────────────────────────────────────────────────┘
```

### Depth Modes

| Mode | Description | SLO (p95) |
|------|-------------|-----------|
| `lookup` | Single search pass, low latency | ≤ 6s |
| `agentic` | Reasoning model with evidence gathering (open_page/find_in_page) | ≤ 20s |
| `deep` | Background thorough synthesis with multiple passes | ≤ 2-4 min |

### Configuration

Edit `apps/server/config/web-search.json`:

```json
{
  "mode": "lookup",
  "allowedDomains": ["bis.org", "imf.org", "rbi.org.in", "bankofengland.co.uk", "sec.gov", "europa.eu"],
  "maxPages": 6,
  "searchContextSize": "medium",
  "defaultLocale": "en-IN",
  "timeoutMs": { "lookup": 6000, "agentic": 20000, "deep": 240000 },
  "maxCostUSD": 0.25
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `WEB_SEARCH_ENABLED` | Enable/disable web search (`true`/`false`, default: `true`) |
| `WEB_SEARCH_MODE` | Override depth mode (`lookup`/`agentic`/`deep`) |
| `ALLOWED_DOMAINS` | Comma-separated domain allow-list override |
| `AZURE_OPENAI_ENABLED` | Auto-switch to Azure (`true`/`false`) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT` | Azure deployment name |
| `WEB_SEARCH_MODEL` | OpenAI model for search (default: `gpt-4o-mini`) |

### Observability

The module emits structured metric events:
- `tool.web_search.start` — search initiated
- `tool.web_search.done` — search completed (includes latency, cost, citation count)
- `tool.web_search.error` — search failed

Subscribe with: `onMetric((event) => { ... })` from `webSearchTool/index.ts`.

### Precision Testing

Run the 20-prompt golden-set evaluation:

```bash
npx tsx scripts/precision-run.ts
```

Outputs: `scripts/precision-results.csv` and `scripts/precision-summary.json` with precision@k, avg citations/answer, p95 latency, and avg cost/call.

### SRE Runbook

| Symptom | Check | Fix |
|---------|-------|-----|
| "OPENAI_API_KEY not configured" | Verify `.env` has `OPENAI_API_KEY` | Add key, restart server |
| High latency (>6s lookup) | Check `WEB_SEARCH_MODE` | Ensure mode is `lookup` for fast queries |
| Cost overrun | Check `maxCostUSD` in config | Lower cap or switch to `lookup` mode |
| Azure compliance banner | Expected when `AZURE_OPENAI_ENABLED=true` | No action needed |
| Fallback to DuckDuckGo | No API keys configured | Add `OPENAI_API_KEY` for production search |
| Citations missing | Check API response annotations | Verify model supports web_search tool |

## Tools Registry

All tools use a typed registry with zod validation. Unknown tool names return `{ok: false, code: 'TOOL_NOT_FOUND'}` without crashing. Invalid inputs return `{ok: false, code: 'TOOL_VALIDATION'}` with readable error messages.

**Registered tools:** `webSearch`, `codeInterpreter`, `memory`, `knowledgeSearch`

**Adding a new tool:**

```typescript
// apps/server/src/tools/myTool.ts
import { z } from "zod";
import { registerTool } from "./registry";

registerTool({
  name: "myTool",
  description: "What this tool does",
  inputSchema: z.object({
    query: z.string().min(1),
  }),
  async handler(ctx, input) {
    const { query } = input as { query: string };
    // ... implement tool logic
    return { ok: true, data: result };
  },
});
```

Then import it in `apps/server/src/tools/index.ts` and add a toggle in the Agent Builder frontend.

**Test endpoint:** `POST /api/tools/invoke { name, input }` to test any tool directly.

## Data Model

```prisma
model Agent {
  id          String   @id @default(cuid())
  name        String
  model       String
  role        String?
  system      String?
  tools       Json     // { webSearch, codeInterpreter, memory, advancedReasoning }
  parameters  Json     // { temperature, maxTokens, topP, toolChoice, contextBudget }
  status      String   @default("draft")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Conversation {
  id        String   @id @default(cuid())
  agentId   String
  messages  Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  agent     Agent    @relation(...)
}
```

## API Endpoints

| Method | Endpoint                | Description              |
|--------|------------------------|--------------------------|
| GET    | `/api/providers/models` | List all provider models |
| GET    | `/api/agents`           | List all agents          |
| GET    | `/api/agents/:id`       | Get agent by ID          |
| POST   | `/api/agents`           | Create new agent         |
| PUT    | `/api/agents/:id`       | Update agent             |
| DELETE | `/api/agents/:id`       | Delete agent             |
| WS     | `/ws/test?agentId=...`  | Test console streaming   |
| POST   | `/api/tools/invoke`     | Test tool invocation     |
| GET    | `/api/tools`            | List registered tools    |
| GET    | `/api/knowledge/status` | Knowledge base status    |
| GET    | `/api/knowledge/search` | Search knowledge base    |
| POST   | `/api/knowledge/reindex`| Re-run PDF ingestion     |

## How to Add a New Tool

1. Create a new file in `apps/server/src/tools/myTool.ts` using `registerTool()` (see Tools Registry section above)
2. Import it in `apps/server/src/tools/index.ts`
3. Add a toggle in the frontend:
   - Update the `AgentTools` type in `apps/client/src/api/agents.ts`
   - Add the tool to `TOOL_OPTIONS` in `apps/client/src/pages/AgentBuilder.tsx`
   - Update the Prisma seed if needed

## How to Add a New Provider

1. Create a new adapter in `apps/server/src/providers/`:

```typescript
// apps/server/src/providers/myProvider.ts
import { LLMProvider, ProviderResponseChunk } from "./types";

export class MyProvider implements LLMProvider {
  name = "myprovider";

  async listModels(): Promise<string[]> {
    return ["my-model-1", "my-model-2"];
  }

  async generate(opts: { ... }): Promise<void> {
    // Implement streaming generation
    // Call opts.onChunk() for each token
    // Call opts.onChunk({ done: true, usage: {...} }) when complete
  }
}
```

2. Register in `apps/server/src/providers/index.ts`:

```typescript
import { MyProvider } from "./myProvider";
const providers = {
  // ...existing
  myprovider: new MyProvider(),
};
```

3. Set `LLM_PROVIDER=myprovider` in `.env` or use per-agent model override.

## License

MIT
