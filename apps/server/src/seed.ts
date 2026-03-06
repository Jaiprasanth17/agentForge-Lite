import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import prisma from "./db/prismaClient";

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.workflowRun.deleteMany();
  await prisma.workflowStep.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.agent.deleteMany();

  // Agent 1: General Assistant
  const agent1 = await prisma.agent.create({
    data: {
      name: "Atlas",
      model: "mock-advanced",
      role: "General AI Assistant",
      system:
        "You are Atlas, a helpful and knowledgeable AI assistant. You provide clear, concise, and accurate answers. You can search the web for current information and execute code when needed. Always be friendly and professional.",
      tools: JSON.stringify({
        webSearch: true,
        codeInterpreter: true,
        memory: true,
        advancedReasoning: false,
      }),
      parameters: JSON.stringify({
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        toolChoice: "auto",
        contextBudget: 16000,
      }),
      status: "active",
    },
  });

  // Agent 2: Code Reviewer
  const agent2 = await prisma.agent.create({
    data: {
      name: "Sentinel",
      model: "mock-reasoning",
      role: "Senior Code Reviewer",
      system:
        "You are Sentinel, an expert code reviewer with deep knowledge of software engineering best practices. You analyze code for bugs, security vulnerabilities, performance issues, and adherence to best practices. You provide constructive feedback with specific suggestions for improvement.",
      tools: JSON.stringify({
        webSearch: false,
        codeInterpreter: true,
        memory: true,
        advancedReasoning: true,
      }),
      parameters: JSON.stringify({
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
        toolChoice: "auto",
        contextBudget: 32000,
      }),
      status: "active",
    },
  });

  console.log(`Created agent: ${agent1.name} (${agent1.id})`);
  console.log(`Created agent: ${agent2.name} (${agent2.id})`);

  // Workflow 1: Support Triage Flow (3 steps, requires approval on step 2)
  const workflow1 = await prisma.workflow.create({
    data: {
      name: "Support Triage Flow",
      description: "Automatically triage incoming support tickets: classify severity, draft a response, and route to the appropriate team.",
      trigger: "manual",
      status: "active",
      steps: {
        create: [
          {
            order: 0,
            title: "Classify Ticket",
            instruction: "Analyze the incoming support ticket. Classify its severity (low/medium/high/critical) and category (billing, technical, feature request, bug report). Output a structured assessment.",
            agentId: agent1.id,
            requireApproval: false,
          },
          {
            order: 1,
            title: "Draft Response",
            instruction: "Based on the classification from the previous step, draft an appropriate customer response. Be empathetic and professional. Include relevant next steps.",
            agentId: agent1.id,
            requireApproval: true,
          },
          {
            order: 2,
            title: "Route & Log",
            instruction: "Based on the classification and approved response, determine the appropriate team to handle this ticket (engineering, billing, product) and create a summary log entry.",
            agentId: null,
            requireApproval: false,
          },
        ],
      },
    },
    include: { steps: true },
  });

  // Workflow 2: Research & Summarize (2 steps, auto)
  const workflow2 = await prisma.workflow.create({
    data: {
      name: "Research & Summarize",
      description: "Research a topic using available tools and produce a concise executive summary with key findings and recommendations.",
      trigger: "manual",
      status: "active",
      steps: {
        create: [
          {
            order: 0,
            title: "Deep Research",
            instruction: "Conduct thorough research on the given topic. Use web search and available tools to gather comprehensive information from multiple sources. Organize findings by theme.",
            agentId: agent1.id,
            requireApproval: false,
          },
          {
            order: 1,
            title: "Executive Summary",
            instruction: "Synthesize all research findings into a concise executive summary. Include: key findings, data points, recommendations, and suggested next steps. Format for stakeholder presentation.",
            agentId: agent2.id,
            requireApproval: false,
          },
        ],
      },
    },
    include: { steps: true },
  });

  console.log(`Created workflow: ${workflow1.name} (${workflow1.id}) with ${workflow1.steps.length} steps`);
  console.log(`Created workflow: ${workflow2.name} (${workflow2.id}) with ${workflow2.steps.length} steps`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
