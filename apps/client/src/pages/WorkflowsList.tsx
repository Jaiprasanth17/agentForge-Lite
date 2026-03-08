import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchWorkflows, deleteWorkflow, executeWorkflow } from "../api/workflows";
import type { Workflow } from "../api/workflows";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/30",
  draft: "bg-warning/10 text-warning border-warning/30",
  archived: "bg-dark-600/10 text-dark-400 border-dark-600/30",
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  schedule: "Scheduled",
  webhook: "Webhook",
  event: "Event",
};

export default function WorkflowsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows", search],
    queryFn: () => fetchWorkflows(search || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow archived");
    },
    onError: () => toast.error("Failed to archive workflow"),
  });

  const executeMutation = useMutation({
    mutationFn: executeWorkflow,
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow started!");
      navigate(`/workflows/${run.workflowId}/run/${run.id}`);
    },
    onError: () => toast.error("Failed to start workflow"),
  });

  const handleDuplicate = async (workflow: Workflow) => {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          trigger: workflow.trigger,
          scheduleCron: workflow.scheduleCron,
          status: "draft",
          steps: workflow.steps.map((s) => ({
            order: s.order,
            title: s.title,
            instruction: s.instruction,
            agentId: s.agentId,
            requireApproval: s.requireApproval,
          })),
        }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
        toast.success("Workflow duplicated");
      }
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-dark-400">Loading workflows...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-danger/30 bg-danger/5 text-center py-12">
          <p className="text-danger mb-2">Failed to load workflows</p>
          <p className="text-sm text-dark-400">Make sure the server is running on port 8080</p>
        </div>
      </div>
    );
  }

  const workflows = data?.workflows ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Workflows</h1>
          <p className="text-sm text-dark-400 mt-1">
            {data?.total ?? 0} workflow{data?.total !== 1 ? "s" : ""} configured
          </p>
        </div>
        <button onClick={() => navigate("/workflows/new")} className="btn-primary">
          + New Workflow
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workflows..."
          className="input-field max-w-sm"
        />
      </div>

      {workflows.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4">&#9881;</div>
          <h3 className="text-lg font-medium text-dark-200 mb-2">No workflows yet</h3>
          <p className="text-sm text-dark-400 mb-6">
            Create your first agentic workflow to automate multi-step processes
          </p>
          <button onClick={() => navigate("/workflows/new")} className="btn-primary">
            Create Workflow
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflows.map((wf: Workflow) => (
            <div
              key={wf.id}
              className="card hover:border-dark-600 transition-all duration-200 cursor-pointer group"
              onClick={() => navigate(`/workflows/${wf.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-dark-100 group-hover:text-accent-light transition-colors">
                      {wf.name}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[wf.status] || STATUS_COLORS.draft}`}>
                      {wf.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-300">
                      {TRIGGER_LABELS[wf.trigger] || wf.trigger}
                    </span>
                  </div>
                  {wf.description && (
                    <p className="text-sm text-dark-300 mb-2 line-clamp-2">{wf.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-dark-400">
                    <span>{wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}</span>
                    {wf._count && <span>{wf._count.runs} run{wf._count.runs !== 1 ? "s" : ""}</span>}
                    <span>Updated {new Date(wf.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => executeMutation.mutate(wf.id)}
                    className="btn-primary text-xs py-1.5 px-3"
                    disabled={executeMutation.isPending}
                  >
                    Run
                  </button>
                  <button
                    onClick={() => navigate(`/workflows/${wf.id}`)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(wf)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Archive this workflow?")) {
                        deleteMutation.mutate(wf.id);
                      }
                    }}
                    className="btn-danger text-xs py-1.5 px-3"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
