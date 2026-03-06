import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import prisma from "./db/prismaClient";

async function main() {
  console.log("Seeding database...");

  // Clear existing agents
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
