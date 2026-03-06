import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchWorkflow, fetchWorkflowRun } from "../api/workflows";
import type { WorkflowRunLogEntry } from "../api/workflows";

interface StepState {
  stepId: string;
  stepTitle: string;
  order: number;
  status: "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "skipped";
  output: string;
  chunks: string;
}

const STATUS_ICONS: Record<string, string> = {
  pending: "&#9679;",
  running: "&#9881;",
  waiting_approval: "&#9888;",
  succeeded: "&#10003;",
  failed: "&#10007;",
  skipped: "&#8722;",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-dark-500",
  running: "text-accent-light",
  waiting_approval: "text-warning",
  succeeded: "text-success",
  failed: "text-danger",
  skipped: "text-dark-400",
};

export default function WorkflowRunConsole() {
  const { id: workflowId, runId } = useParams();
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [stepStates, setStepStates] = useState<Map<string, StepState>>(new Map());
  const [runStatus, setRunStatus] = useState<string>("queued");
  const [totalUsage, setTotalUsage] = useState<{ tokensIn: number; tokensOut: number } | null>(null);
  const [editText, setEditText] = useState("");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => fetchWorkflow(workflowId!),
    enabled: Boolean(workflowId),
  });

  // Load existing run data
  const { data: existingRun } = useQuery({
    queryKey: ["workflowRun", runId],
    queryFn: () => fetchWorkflowRun(runId!),
    enabled: Boolean(runId),
  });

  useEffect(() => {
    if (existingRun) {
      setRunStatus(existingRun.status);
      if (existingRun.usage) setTotalUsage(existingRun.usage);
      if (existingRun.log && existingRun.log.length > 0) {
        const newMap = new Map<string, StepState>();
        existingRun.log.forEach((entry: WorkflowRunLogEntry) => {
          newMap.set(entry.stepId, {
            stepId: entry.stepId,
            stepTitle: entry.stepTitle,
            order: entry.order,
            status: entry.status,
            output: entry.output,
            chunks: "",
          });
        });
        setStepStates(newMap);
      }
    }
  }, [existingRun]);

  const scrollToBottom = useCallback(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [stepStates, scrollToBottom]);

  // WebSocket connection
  useEffect(() => {
    if (!runId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/workflow?runId=${runId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    startTimeRef.current = Date.now();

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "connected":
          break;

        case "run_started":
          setRunStatus("running");
          break;

        case "step_started":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            newMap.set(data.stepId, {
              stepId: data.stepId,
              stepTitle: data.stepTitle,
              order: data.order,
              status: "running",
              output: "",
              chunks: "",
            });
            return newMap;
          });
          break;

        case "step_executing":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, status: "running" });
            }
            return newMap;
          });
          break;

        case "approval_required":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, status: "waiting_approval", output: data.draftMessage });
            } else {
              newMap.set(data.stepId, {
                stepId: data.stepId,
                stepTitle: data.stepTitle || "",
                order: 0,
                status: "waiting_approval",
                output: data.draftMessage,
                chunks: "",
              });
            }
            return newMap;
          });
          break;

        case "chunk":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, chunks: existing.chunks + (data.text || "") });
            }
            return newMap;
          });
          break;

        case "step_completed":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, status: "succeeded", output: data.output || existing.chunks, chunks: "" });
            }
            return newMap;
          });
          break;

        case "step_failed":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, status: "failed", output: `Error: ${data.error}` });
            }
            return newMap;
          });
          break;

        case "step_skipped":
          setStepStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(data.stepId);
            if (existing) {
              newMap.set(data.stepId, { ...existing, status: "skipped", output: `Skipped: ${data.reason}` });
            }
            return newMap;
          });
          break;

        case "completed":
          setRunStatus("succeeded");
          if (data.usage) setTotalUsage(data.usage);
          toast.success("Workflow completed!");
          break;

        case "failed":
          setRunStatus("failed");
          if (data.usage) setTotalUsage(data.usage);
          toast.error("Workflow failed");
          break;

        case "error":
          toast.error(data.text);
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      toast.error("WebSocket connection failed");
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [runId]);

  const sendApproval = (stepId: string, approved: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "approval",
        stepId,
        approved,
        editedText: editingStepId === stepId ? editText : undefined,
      }));
      setStepStates((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(stepId);
        if (existing) {
          newMap.set(stepId, { ...existing, status: approved ? "running" : "skipped", output: approved ? "Approved - executing..." : "Rejected by user" });
        }
        return newMap;
      });
      setEditingStepId(null);
      setEditText("");
    }
  };

  const sendCancel = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }));
      setRunStatus("cancelled");
    }
  };

  const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
  const sortedSteps = Array.from(stepStates.values()).sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-screen">
      {/* Left Panel - Workflow Summary */}
      <div className="w-80 bg-dark-900 border-r border-dark-700 p-6 overflow-y-auto shrink-0">
        <button
          onClick={() => navigate(`/workflows/${workflowId}`)}
          className="text-sm text-dark-400 hover:text-dark-200 mb-4 flex items-center gap-1"
        >
          &larr; Back to Editor
        </button>

        <h2 className="text-lg font-bold text-dark-100 mb-2">
          {workflow?.name || "Loading..."}
        </h2>
        {workflow?.description && (
          <p className="text-sm text-dark-400 mb-4">{workflow.description}</p>
        )}

        {/* Run Status */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Run Status</label>
            <p className={`text-sm mt-1 font-medium ${
              runStatus === "succeeded" ? "text-success" :
              runStatus === "failed" ? "text-danger" :
              runStatus === "running" ? "text-accent-light" :
              "text-dark-300"
            }`}>
              {runStatus.charAt(0).toUpperCase() + runStatus.slice(1)}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Duration</label>
            <p className="text-sm text-dark-200 mt-1">{duration}s</p>
          </div>

          {/* Steps progress */}
          <div>
            <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Steps</label>
            <div className="mt-2 space-y-1.5">
              {workflow?.steps.map((step, i) => {
                const state = stepStates.get(step.id || "");
                const status = state?.status || "pending";
                return (
                  <div key={step.id || i} className="flex items-center gap-2 text-xs">
                    <span className={STATUS_COLORS[status]} dangerouslySetInnerHTML={{ __html: STATUS_ICONS[status] }} />
                    <span className={`${status === "running" ? "text-dark-100" : "text-dark-400"}`}>
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Usage */}
          {totalUsage && (
            <div>
              <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Token Usage</label>
              <div className="text-xs text-dark-300 mt-1 space-y-1">
                <div>Tokens In: {totalUsage.tokensIn}</div>
                <div>Tokens Out: {totalUsage.tokensOut}</div>
              </div>
            </div>
          )}

          <hr className="border-dark-700" />

          {/* Cancel button */}
          {runStatus === "running" && (
            <button onClick={sendCancel} className="btn-danger w-full text-sm">
              Cancel Run
            </button>
          )}
        </div>
      </div>

      {/* Right Panel - Streaming Log */}
      <div className="flex-1 flex flex-col">
        {/* Connection Status Bar */}
        <div className="bg-dark-900 border-b border-dark-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-danger"}`} />
            <span className="text-sm text-dark-300">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          {runStatus === "running" && (
            <div className="flex items-center gap-2 text-sm text-accent-light">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              Running...
            </div>
          )}
        </div>

        {/* Log Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {sortedSteps.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-4">&#9881;</div>
                <h3 className="text-lg font-medium text-dark-300 mb-2">
                  {runStatus === "queued" ? "Waiting to start..." : "Workflow run starting..."}
                </h3>
                <p className="text-sm text-dark-500">
                  Steps will appear here as they execute
                </p>
              </div>
            </div>
          )}

          {sortedSteps.map((step) => (
            <div key={step.stepId} className="card">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`text-lg ${STATUS_COLORS[step.status]}`}
                  dangerouslySetInnerHTML={{ __html: STATUS_ICONS[step.status] }}
                />
                <h3 className="text-sm font-semibold text-dark-100">
                  Step {step.order + 1}: {step.stepTitle}
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  step.status === "succeeded" ? "bg-success/10 text-success" :
                  step.status === "failed" ? "bg-danger/10 text-danger" :
                  step.status === "running" ? "bg-accent/10 text-accent-light" :
                  step.status === "waiting_approval" ? "bg-warning/10 text-warning" :
                  step.status === "skipped" ? "bg-dark-700 text-dark-400" :
                  "bg-dark-700 text-dark-400"
                }`}>
                  {step.status.replace("_", " ")}
                </span>
              </div>

              {/* Streaming chunks */}
              {step.chunks && (
                <div className="bg-dark-700/50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-dark-200 whitespace-pre-wrap">{step.chunks}</p>
                  <span className="inline-block w-2 h-4 bg-accent-light animate-pulse ml-1" />
                </div>
              )}

              {/* Output */}
              {step.output && !step.chunks && (
                <div className="bg-dark-700/50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-dark-200 whitespace-pre-wrap">{step.output}</p>
                </div>
              )}

              {/* Approval UI */}
              {step.status === "waiting_approval" && (
                <div className="border border-warning/30 rounded-lg p-4 bg-warning/5">
                  <p className="text-sm text-warning font-medium mb-3">
                    This step requires your approval before proceeding
                  </p>

                  {editingStepId === step.stepId ? (
                    <div className="mb-3">
                      <label className="block text-xs text-dark-300 mb-1">Edit message (optional)</label>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="input-field text-sm resize-y"
                        rows={3}
                      />
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <button
                      onClick={() => sendApproval(step.stepId, true)}
                      className="text-sm bg-success/20 text-success px-4 py-1.5 rounded-lg hover:bg-success/30"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => sendApproval(step.stepId, false)}
                      className="text-sm bg-danger/20 text-danger px-4 py-1.5 rounded-lg hover:bg-danger/30"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        if (editingStepId === step.stepId) {
                          setEditingStepId(null);
                          setEditText("");
                        } else {
                          setEditingStepId(step.stepId);
                          setEditText("");
                        }
                      }}
                      className="text-sm bg-dark-700 text-dark-300 px-4 py-1.5 rounded-lg hover:bg-dark-600"
                    >
                      {editingStepId === step.stepId ? "Cancel Edit" : "Edit Message"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Run Complete Summary */}
          {(runStatus === "succeeded" || runStatus === "failed") && sortedSteps.length > 0 && (
            <div className={`card border ${runStatus === "succeeded" ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
              <h3 className={`text-lg font-semibold ${runStatus === "succeeded" ? "text-success" : "text-danger"}`}>
                Workflow {runStatus === "succeeded" ? "Completed" : "Failed"}
              </h3>
              <div className="text-sm text-dark-300 mt-2">
                <p>Duration: {duration}s</p>
                {totalUsage && (
                  <p>Tokens: {totalUsage.tokensIn} in / {totalUsage.tokensOut} out</p>
                )}
                <p>Steps: {sortedSteps.filter((s) => s.status === "succeeded").length}/{sortedSteps.length} succeeded</p>
              </div>
            </div>
          )}

          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
