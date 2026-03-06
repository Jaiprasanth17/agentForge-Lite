const API_BASE = "/api";

export interface AgentTools {
  webSearch: boolean;
  codeInterpreter: boolean;
  memory: boolean;
  advancedReasoning: boolean;
}

export interface AgentParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  toolChoice: "auto" | "none";
  contextBudget: number;
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  role: string | null;
  system: string | null;
  tools: AgentTools;
  parameters: AgentParameters;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInfo {
  name: string;
  models: string[];
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${id}`);
  if (!res.ok) throw new Error("Failed to fetch agent");
  return res.json();
}

export async function createAgent(data: Partial<Agent>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ? JSON.stringify(err.error) : "Failed to create agent");
  }
  return res.json();
}

export async function updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update agent");
  return res.json();
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete agent");
}

export async function fetchProviderModels(): Promise<{ providers: ProviderInfo[] }> {
  const res = await fetch(`${API_BASE}/providers/models`);
  if (!res.ok) throw new Error("Failed to fetch models");
  return res.json();
}
