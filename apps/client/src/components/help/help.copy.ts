/** Centralized copy for the Help page. Edit here to update all text. */

export const helpCopy = {
  title: "Help & Onboarding",
  tagline:
    "Learn how to build Agents and automate Workflows with human-in-the-loop control.",

  explainer: {
    title: "Agentic Automation in Minutes",
    alt: "Animated overview: build agent, test, create workflow, run with approval.",
  },

  steps: [
    {
      number: 1,
      title: "Create an Agent",
      description:
        "Define a name, choose a model (OpenAI, Anthropic, or Mock), write system instructions, toggle tools, and tune parameters like temperature and max tokens.",
      icon: "agent",
      link: "/agents/new",
      linkLabel: "Open Agent Builder",
    },
    {
      number: 2,
      title: "Test the Agent",
      description:
        "Open the Test Console to stream live responses via WebSocket. Enable \"Run with Tools\" to see search, code, and memory calls. Toggle \"Human-in-the-Loop\" to approve or reject tool calls before they execute.",
      icon: "test",
      link: "/agents",
      linkLabel: "View Agents",
    },
    {
      number: 3,
      title: "Create a Workflow",
      description:
        "Add ordered steps, attach an existing Agent to each step, write step-level instructions, and mark steps that require human approval before proceeding.",
      icon: "workflow",
      link: "/workflows/new",
      linkLabel: "Open Workflow Builder",
    },
    {
      number: 4,
      title: "Set Triggers",
      description:
        "Run workflows manually, on a cron schedule, via webhook, or on custom events. Scheduled workflows are registered automatically when the server starts.",
      icon: "trigger",
    },
    {
      number: 5,
      title: "Monitor Runs",
      description:
        "Watch streaming logs in the Run Console. Each step shows real-time status, approval gates, tool calls, and final token usage and duration stats.",
      icon: "monitor",
      link: "/workflows",
      linkLabel: "View Workflows",
    },
    {
      number: 6,
      title: "Iterate & Improve",
      description:
        "Update agent instructions, swap models, adjust parameters, add or remove tools, then re-test and re-deploy. Your changes take effect immediately.",
      icon: "iterate",
    },
  ],

  faq: [
    {
      question: "What models can I use?",
      answer:
        "Go to Settings \u2192 Providers & Models to see available models. Out of the box you get OpenAI (gpt-4o-mini, gpt-4o, o3-mini), Anthropic (claude-3-haiku, claude-3-sonnet, claude-3.5-sonnet), and three Mock models for offline testing.",
    },
    {
      question: "How do approvals work?",
      answer:
        "When \"Human-in-the-Loop\" is enabled (in Agent Test Console) or \"Require Approval\" is checked on a Workflow step, the system pauses execution and shows an Approve / Reject / Edit gate. The run only continues after you act.",
    },
    {
      question: "What is the Mock provider?",
      answer:
        "The Mock provider returns canned streamed responses with simulated tool calls. It requires no external API keys, making it perfect for local development and demos.",
    },
    {
      question: "How are workflow steps executed?",
      answer:
        "Steps run in linear order (v1). For each step the orchestrator composes a system message from the workflow context plus the step instruction, selects the assigned Agent\u2019s model and provider, then streams the response. If no Agent is assigned, the default provider acts as an orchestrator.",
    },
    {
      question: "Where is data stored?",
      answer:
        "All data is stored in a local SQLite database managed by Prisma. The database file lives at apps/server/prisma/dev.db. For production deployments, swap to PostgreSQL or MySQL by updating the Prisma datasource in schema.prisma. See the README for guidance.",
    },
  ],

  cta: {
    createAgent: { label: "Create Agent", to: "/agents/new" },
    createWorkflow: { label: "Create Workflow", to: "/workflows/new" },
    docs: {
      label: "Open Docs",
      href: "https://github.com/Jaiprasanth17/agentForge-Lite#readme",
    },
  },
};
