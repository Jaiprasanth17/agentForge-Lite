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

## How to Add a New Tool

1. Create a new file in `apps/server/src/tools/`:

```typescript
// apps/server/src/tools/myTool.ts
export async function myTool(input: string): Promise<string> {
  // Implement tool logic
  return `Result for: ${input}`;
}
```

2. Register the tool in `apps/server/src/ws.ts`:
   - Add it to the `availableTools` array with an OpenAI-compatible function schema
   - Add a handler in the tool execution switch statement

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
