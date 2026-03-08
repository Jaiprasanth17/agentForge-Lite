import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "../store/agentStore";

describe("Agent Form Validation", () => {
  beforeEach(() => {
    useAgentStore.getState().resetForm();
  });

  it("should fail validation when name is empty", () => {
    const store = useAgentStore.getState();
    store.setField("name", "");
    store.setField("model", "mock-basic");
    const isValid = store.validate();
    expect(isValid).toBe(false);
    expect(useAgentStore.getState().errors.name).toBe("Agent name is required");
  });

  it("should fail validation when model is empty", () => {
    const store = useAgentStore.getState();
    store.setField("name", "Test Agent");
    store.setField("model", "");
    const isValid = store.validate();
    expect(isValid).toBe(false);
    expect(useAgentStore.getState().errors.model).toBe("Model selection is required");
  });

  it("should pass validation with valid data", () => {
    const store = useAgentStore.getState();
    store.setField("name", "Test Agent");
    store.setField("model", "mock-basic");
    const isValid = store.validate();
    expect(isValid).toBe(true);
    expect(Object.keys(useAgentStore.getState().errors).filter((k) => useAgentStore.getState().errors[k])).toHaveLength(0);
  });

  it("should set and clear tool toggles", () => {
    const store = useAgentStore.getState();
    store.setTool("webSearch", true);
    expect(useAgentStore.getState().form.tools.webSearch).toBe(true);
    store.setTool("webSearch", false);
    expect(useAgentStore.getState().form.tools.webSearch).toBe(false);
  });

  it("should set parameters correctly", () => {
    const store = useAgentStore.getState();
    store.setParameter("temperature", 0.5);
    expect(useAgentStore.getState().form.parameters.temperature).toBe(0.5);
    store.setParameter("maxTokens", 4096);
    expect(useAgentStore.getState().form.parameters.maxTokens).toBe(4096);
  });

  it("should load agent data correctly", () => {
    const store = useAgentStore.getState();
    store.loadAgent({
      id: "test-id",
      name: "Loaded Agent",
      model: "gpt-4o-mini",
      role: "Assistant",
      system: "You are helpful.",
      tools: { webSearch: true, codeInterpreter: false, memory: true, advancedReasoning: false, knowledge: false },
      parameters: { temperature: 0.8, maxTokens: 2048, topP: 0.9, toolChoice: "auto", contextBudget: 16000 },
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const state = useAgentStore.getState();
    expect(state.form.name).toBe("Loaded Agent");
    expect(state.form.model).toBe("gpt-4o-mini");
    expect(state.form.tools.webSearch).toBe(true);
    expect(state.form.tools.memory).toBe(true);
    expect(state.form.parameters.temperature).toBe(0.8);
    expect(state.form.status).toBe("active");
  });

  it("should reset form to defaults", () => {
    const store = useAgentStore.getState();
    store.setField("name", "Some Agent");
    store.setTool("webSearch", true);
    store.resetForm();
    const state = useAgentStore.getState();
    expect(state.form.name).toBe("");
    expect(state.form.tools.webSearch).toBe(false);
  });
});
