const API_BASE = "/api";

export interface WorkflowStep {
  id?: string;
  order: number;
  title: string;
  instruction: string;
  agentId: string | null;
  requireApproval: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger: "manual" | "schedule" | "webhook" | "event";
  scheduleCron: string | null;
  status: "draft" | "active" | "archived";
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  _count?: { runs: number };
}

export interface WorkflowRunLogEntry {
  stepId: string;
  stepTitle: string;
  order: number;
  status: "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "skipped";
  output: string;
  startedAt?: string;
  finishedAt?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  log: WorkflowRunLogEntry[];
  usage: { tokensIn: number; tokensOut: number } | null;
  workflow?: Workflow;
}

export async function fetchWorkflows(search?: string): Promise<{ workflows: Workflow[]; total: number }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(`${API_BASE}/workflows?${params}`);
  if (!res.ok) throw new Error("Failed to fetch workflows");
  return res.json();
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/workflows/${id}`);
  if (!res.ok) throw new Error("Failed to fetch workflow");
  return res.json();
}

export async function createWorkflow(data: Partial<Workflow> & { steps: WorkflowStep[] }): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ? JSON.stringify(err.error) : "Failed to create workflow");
  }
  return res.json();
}

export async function updateWorkflow(id: string, data: Partial<Workflow> & { steps: WorkflowStep[] }): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update workflow");
  return res.json();
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete workflow");
}

export async function executeWorkflow(id: string): Promise<WorkflowRun> {
  const res = await fetch(`${API_BASE}/workflows/${id}/execute`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to execute workflow");
  return res.json();
}

export async function fetchWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  const res = await fetch(`${API_BASE}/workflows/${workflowId}/runs`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  return res.json();
}

export async function fetchWorkflowRun(runId: string): Promise<WorkflowRun> {
  const res = await fetch(`${API_BASE}/workflows/runs/${runId}`);
  if (!res.ok) throw new Error("Failed to fetch run");
  return res.json();
}
