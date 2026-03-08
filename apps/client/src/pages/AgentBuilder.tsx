import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAgentStore } from "../store/agentStore";
import { fetchAgent, createAgent, updateAgent, fetchProviderModels } from "../api/agents";
import type { AgentTools } from "../api/agents";

const TOOL_OPTIONS: { key: keyof AgentTools; label: string; description: string; icon: string }[] = [
  { key: "webSearch", label: "Web Search", description: "Search the web for real-time information", icon: "🔍" },
  { key: "codeInterpreter", label: "Code Interpreter", description: "Execute code in a sandboxed environment", icon: "💻" },
  { key: "memory", label: "Memory", description: "Embedding + vector lookup for context recall", icon: "🧠" },
  { key: "advancedReasoning", label: "Advanced Reasoning", description: "Enhanced reasoning capabilities", icon: "⚡" },
  { key: "knowledge", label: "Knowledge", description: "Search PDF knowledge base with RAG citations", icon: "📚" },
];

export default function AgentBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const { form, errors, setField, setTool, setParameter, loadAgent, resetForm, validate } = useAgentStore();
  const [saving, setSaving] = useState(false);

  // Fetch existing agent if editing
  const { data: existingAgent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => fetchAgent(id!),
    enabled: isEditing,
  });

  // Fetch available models
  const { data: providerData } = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviderModels,
  });

  const allModels = providerData?.providers.flatMap((p) =>
    p.models.map((m) => ({ provider: p.name, model: m }))
  ) ?? [];

  useEffect(() => {
    if (existingAgent) {
      loadAgent(existingAgent);
    } else if (!isEditing) {
      resetForm();
    }
  }, [existingAgent, isEditing, loadAgent, resetForm]);

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent created successfully!");
      navigate(`/agents/${agent.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateAgent>[1]) => updateAgent(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      toast.success("Agent updated successfully!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = async (status: "draft" | "active") => {
    if (!validate()) {
      toast.error("Please fix the validation errors");
      return;
    }
    setSaving(true);
    const data = {
      name: form.name,
      model: form.model,
      role: form.role || null,
      system: form.system || null,
      tools: form.tools,
      parameters: form.parameters,
      status,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync(data);
      } else {
        await createMutation.mutateAsync(data);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">
            {isEditing ? "Edit Agent" : "Create New Agent"}
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            Configure your AI agent's identity, capabilities, and parameters
          </p>
        </div>
        {isEditing && (
          <button
            onClick={() => navigate(`/agents/${id}/test`)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            Test Agent
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Identity Card */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-dark-200">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Agent Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g., Atlas, Sentinel..."
                className={`input-field ${errors.name ? "border-danger focus:ring-danger/50" : ""}`}
              />
              {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
              <p className="text-xs text-dark-500 mt-1">A unique name for your agent</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Model <span className="text-danger">*</span>
              </label>
              <select
                value={form.model}
                onChange={(e) => setField("model", e.target.value)}
                className={`input-field ${errors.model ? "border-danger focus:ring-danger/50" : ""}`}
              >
                <option value="">Select a model...</option>
                {allModels.map((m) => (
                  <option key={`${m.provider}-${m.model}`} value={m.model}>
                    {m.model} ({m.provider})
                  </option>
                ))}
              </select>
              {errors.model && <p className="text-xs text-danger mt-1">{errors.model}</p>}
              <p className="text-xs text-dark-500 mt-1">The LLM model powering this agent</p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              Role / Persona
            </label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => setField("role", e.target.value)}
              placeholder="e.g., Senior Code Reviewer, Research Assistant..."
              className="input-field"
            />
            <p className="text-xs text-dark-500 mt-1">Short description of the agent's role</p>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              System Instructions
            </label>
            <textarea
              value={form.system}
              onChange={(e) => setField("system", e.target.value)}
              placeholder="You are a helpful AI assistant that..."
              rows={4}
              className="input-field resize-y"
            />
            <p className="text-xs text-dark-500 mt-1">
              Detailed instructions that define how the agent behaves
            </p>
          </div>
        </div>

        {/* Capabilities & Tools Card */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-dark-200">Capabilities & Tools</h2>
          <p className="text-sm text-dark-400 mb-4">
            Toggle the tools and capabilities available to this agent
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TOOL_OPTIONS.map((tool) => (
              <button
                key={tool.key}
                onClick={() => setTool(tool.key, !form.tools[tool.key])}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 text-left ${
                  form.tools[tool.key]
                    ? "bg-accent/10 border-accent/30 shadow-sm shadow-accent/10"
                    : "bg-dark-800/30 border-dark-600 hover:border-dark-500"
                }`}
              >
                <span className="text-2xl">{tool.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${form.tools[tool.key] ? "text-accent-light" : "text-dark-300"}`}>
                      {tool.label}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${form.tools[tool.key] ? "bg-success" : "bg-dark-600"}`}
                    />
                  </div>
                  <p className="text-xs text-dark-400 mt-0.5">{tool.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Parameters Card */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-dark-200">Parameters</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Temperature: {form.parameters.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={form.parameters.temperature}
                onChange={(e) => setParameter("temperature", parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-dark-500">
                <span>Precise (0)</span>
                <span>Creative (2)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Max Tokens
              </label>
              <input
                type="number"
                value={form.parameters.maxTokens}
                onChange={(e) => setParameter("maxTokens", parseInt(e.target.value) || 1)}
                min="1"
                max="128000"
                className="input-field"
              />
              {errors.maxTokens && <p className="text-xs text-danger mt-1">{errors.maxTokens}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Top-p: {form.parameters.topP}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={form.parameters.topP}
                onChange={(e) => setParameter("topP", parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-dark-500">
                <span>Focused (0)</span>
                <span>Diverse (1)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Tool Choice
              </label>
              <select
                value={form.parameters.toolChoice}
                onChange={(e) => setParameter("toolChoice", e.target.value as "auto" | "none")}
                className="input-field"
              >
                <option value="auto">Auto</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Context Window Budget: {form.parameters.contextBudget.toLocaleString()} tokens
              </label>
              <input
                type="range"
                min="1000"
                max="200000"
                step="1000"
                value={form.parameters.contextBudget}
                onChange={(e) => setParameter("contextBudget", parseInt(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-dark-500">
                <span>1K</span>
                <span>200K</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={() => navigate("/agents")}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={() => handleSave("active")}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
}
