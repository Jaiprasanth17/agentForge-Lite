import { create } from "zustand";
import type { Agent, AgentTools, AgentParameters } from "../api/agents";

interface AgentFormState {
  name: string;
  model: string;
  role: string;
  system: string;
  tools: AgentTools;
  parameters: AgentParameters;
  status: "draft" | "active" | "archived";
}

interface AgentStore {
  form: AgentFormState;
  errors: Record<string, string>;
  setField: <K extends keyof AgentFormState>(key: K, value: AgentFormState[K]) => void;
  setTool: (tool: keyof AgentTools, value: boolean) => void;
  setParameter: <K extends keyof AgentParameters>(key: K, value: AgentParameters[K]) => void;
  setError: (field: string, message: string) => void;
  clearErrors: () => void;
  resetForm: () => void;
  loadAgent: (agent: Agent) => void;
  validate: () => boolean;
}

const defaultForm: AgentFormState = {
  name: "",
  model: "mock-advanced",
  role: "",
  system: "",
  tools: {
    webSearch: false,
    codeInterpreter: false,
    memory: false,
    advancedReasoning: false,
  },
  parameters: {
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1,
    toolChoice: "auto",
    contextBudget: 16000,
  },
  status: "draft",
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  form: { ...defaultForm },
  errors: {},

  setField: (key, value) =>
    set((state) => ({
      form: { ...state.form, [key]: value },
      errors: { ...state.errors, [key]: "" },
    })),

  setTool: (tool, value) =>
    set((state) => ({
      form: {
        ...state.form,
        tools: { ...state.form.tools, [tool]: value },
      },
    })),

  setParameter: (key, value) =>
    set((state) => ({
      form: {
        ...state.form,
        parameters: { ...state.form.parameters, [key]: value },
      },
    })),

  setError: (field, message) =>
    set((state) => ({
      errors: { ...state.errors, [field]: message },
    })),

  clearErrors: () => set({ errors: {} }),

  resetForm: () => set({ form: { ...defaultForm }, errors: {} }),

  loadAgent: (agent) =>
    set({
      form: {
        name: agent.name,
        model: agent.model,
        role: agent.role || "",
        system: agent.system || "",
        tools: agent.tools,
        parameters: agent.parameters,
        status: agent.status,
      },
      errors: {},
    }),

  validate: () => {
    const { form } = get();
    const errors: Record<string, string> = {};

    if (!form.name.trim()) errors.name = "Agent name is required";
    if (!form.model) errors.model = "Model selection is required";
    if (form.parameters.temperature < 0 || form.parameters.temperature > 2)
      errors.temperature = "Temperature must be between 0 and 2";
    if (form.parameters.maxTokens < 1)
      errors.maxTokens = "Max tokens must be at least 1";

    set({ errors });
    return Object.keys(errors).length === 0;
  },
}));
