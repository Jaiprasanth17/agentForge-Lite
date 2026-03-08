import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fetchWorkflow, createWorkflow, updateWorkflow, executeWorkflow } from "../api/workflows";
import { fetchAgents } from "../api/agents";
import type { WorkflowStep } from "../api/workflows";
import type { Agent } from "../api/agents";

interface StepFormData extends WorkflowStep {
  _key: string;
}

function generateKey(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function SortableStep({
  step,
  index,
  agents,
  onUpdate,
  onRemove,
}: {
  step: StepFormData;
  index: number;
  agents: Agent[];
  onUpdate: (key: string, field: keyof StepFormData, value: string | boolean | null) => void;
  onRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step._key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="card mb-3 relative">
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-dark-500 hover:text-dark-300 cursor-grab active:cursor-grabbing p-1"
          title="Drag to reorder"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-accent-light bg-accent/10 px-2 py-0.5 rounded">
              Step {index + 1}
            </span>
            <input
              type="text"
              value={step.title}
              onChange={(e) => onUpdate(step._key, "title", e.target.value)}
              placeholder="Step title..."
              className="input-field flex-1 text-sm"
            />
          </div>

          <textarea
            value={step.instruction}
            onChange={(e) => onUpdate(step._key, "instruction", e.target.value)}
            placeholder="What should this step do? Describe the instruction..."
            rows={3}
            className="input-field text-sm resize-y"
          />

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-dark-400 mb-1">Agent (optional)</label>
              <select
                value={step.agentId || ""}
                onChange={(e) => onUpdate(step._key, "agentId", e.target.value || null)}
                className="input-field text-sm"
              >
                <option value="">Orchestrator (default provider)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-dark-300">Require Approval</span>
                <div
                  className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
                    step.requireApproval ? "bg-accent" : "bg-dark-600"
                  }`}
                  onClick={() => onUpdate(step._key, "requireApproval", !step.requireApproval)}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ${
                      step.requireApproval ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={() => onRemove(step._key)}
          className="text-dark-500 hover:text-danger mt-1 p-1"
          title="Remove step"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function WorkflowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<"manual" | "schedule" | "webhook" | "event">("manual");
  const [scheduleCron, setScheduleCron] = useState("");
  const [steps, setSteps] = useState<StepFormData[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch existing workflow if editing
  const { data: existingWorkflow } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => fetchWorkflow(id!),
    enabled: isEditing,
  });

  // Fetch agents for dropdown
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
  });

  useEffect(() => {
    if (existingWorkflow) {
      setName(existingWorkflow.name);
      setDescription(existingWorkflow.description || "");
      setTrigger(existingWorkflow.trigger);
      setScheduleCron(existingWorkflow.scheduleCron || "");
      setSteps(
        existingWorkflow.steps.map((s) => ({
          ...s,
          _key: s.id || generateKey(),
        }))
      );
    }
  }, [existingWorkflow]);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        _key: generateKey(),
        order: prev.length,
        title: "",
        instruction: "",
        agentId: null,
        requireApproval: false,
      },
    ]);
  }, []);

  const updateStep = useCallback((key: string, field: keyof StepFormData, value: string | boolean | null) => {
    setSteps((prev) =>
      prev.map((s) => (s._key === key ? { ...s, [field]: value } : s))
    );
  }, []);

  const removeStep = useCallback((key: string) => {
    setSteps((prev) => prev.filter((s) => s._key !== key));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSteps((prev) => {
        const oldIndex = prev.findIndex((s) => s._key === active.id);
        const newIndex = prev.findIndex((s) => s._key === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Workflow name is required";
    if (steps.length === 0) errs.steps = "At least one step is required";
    steps.forEach((s, i) => {
      if (!s.title.trim()) errs[`step_${i}_title`] = `Step ${i + 1} title is required`;
      if (!s.instruction.trim()) errs[`step_${i}_instruction`] = `Step ${i + 1} instruction is required`;
    });
    if (trigger === "schedule" && !scheduleCron.trim()) {
      errs.scheduleCron = "Cron expression is required for scheduled triggers";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (status: "draft" | "active") => {
    if (!validate()) {
      toast.error("Please fix the validation errors");
      return;
    }
    setSaving(true);
    const data = {
      name,
      description: description || null,
      trigger,
      scheduleCron: trigger === "schedule" ? scheduleCron : null,
      status,
      steps: steps.map((s, i) => ({
        order: i,
        title: s.title,
        instruction: s.instruction,
        agentId: s.agentId || null,
        requireApproval: s.requireApproval,
      })),
    };

    try {
      if (isEditing) {
        await updateWorkflow(id!, data);
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
        queryClient.invalidateQueries({ queryKey: ["workflow", id] });
        toast.success("Workflow updated!");
      } else {
        const wf = await createWorkflow(data);
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
        toast.success("Workflow created!");
        navigate(`/workflows/${wf.id}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!id) {
      toast.error("Save the workflow first");
      return;
    }
    try {
      const run = await executeWorkflow(id);
      navigate(`/workflows/${id}/run/${run.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">
            {isEditing ? "Edit Workflow" : "Create New Workflow"}
          </h1>
          <p className="text-sm text-dark-400 mt-1">
            Design an agentic workflow with ordered steps
          </p>
        </div>
        {isEditing && (
          <button onClick={handleRunTest} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            Run Test
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Workflow Identity Card */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-dark-200">Workflow Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Workflow Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: "" })); }}
                placeholder="e.g., Support Triage Flow"
                className={`input-field ${errors.name ? "border-danger focus:ring-danger/50" : ""}`}
              />
              {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this workflow does..."
                rows={3}
                className="input-field resize-y"
              />
            </div>
          </div>
        </div>

        {/* Trigger Card */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-dark-200">Trigger</h2>
          <p className="text-sm text-dark-400 mb-4">
            How should this workflow be triggered?
          </p>
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as typeof trigger)}
            className="input-field max-w-xs"
          >
            <option value="manual">Manual - Run on demand</option>
            <option value="schedule">Schedule - Run on a cron schedule</option>
            <option value="webhook">Webhook - Trigger via HTTP POST</option>
            <option value="event">Event - Trigger on system event</option>
          </select>

          {trigger === "schedule" && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Cron Expression <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={scheduleCron}
                onChange={(e) => { setScheduleCron(e.target.value); setErrors((prev) => ({ ...prev, scheduleCron: "" })); }}
                placeholder="*/5 * * * *"
                className={`input-field max-w-xs ${errors.scheduleCron ? "border-danger" : ""}`}
              />
              {errors.scheduleCron && <p className="text-xs text-danger mt-1">{errors.scheduleCron}</p>}
              <p className="text-xs text-dark-500 mt-1">
                Format: minute hour day-of-month month day-of-week (e.g., &quot;0 9 * * 1-5&quot; = weekdays at 9am)
              </p>
            </div>
          )}

          {trigger === "webhook" && isEditing && (
            <div className="mt-4 bg-dark-700/50 rounded-lg p-3">
              <label className="block text-xs font-medium text-dark-400 mb-1">Webhook URL</label>
              <div className="flex items-center gap-2">
                <code className="text-sm text-accent-light break-all">
                  {window.location.origin}/api/workflows/{id}/webhook
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/workflows/${id}/webhook`);
                    toast.success("Copied!");
                  }}
                  className="text-xs text-dark-400 hover:text-dark-200 shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Steps Card */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-dark-200">Agentic Instructions</h2>
              <p className="text-sm text-dark-400 mt-1">
                Define the ordered steps for this workflow. Drag to reorder.
              </p>
            </div>
            <button onClick={addStep} className="btn-secondary text-sm">
              + Add Step
            </button>
          </div>

          {errors.steps && <p className="text-xs text-danger mb-3">{errors.steps}</p>}

          {steps.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-dark-600 rounded-xl">
              <p className="text-dark-400 mb-3">No steps yet</p>
              <button onClick={addStep} className="btn-primary text-sm">
                Add First Step
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={steps.map((s) => s._key)} strategy={verticalListSortingStrategy}>
                {steps.map((step, index) => (
                  <SortableStep
                    key={step._key}
                    step={step}
                    index={index}
                    agents={agents ?? []}
                    onUpdate={updateStep}
                    onRemove={removeStep}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={() => navigate("/workflows")} className="btn-secondary">
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
