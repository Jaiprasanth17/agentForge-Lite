import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchAgents, deleteAgent } from "../api/agents";
import type { Agent } from "../api/agents";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success border-success/30",
  draft: "bg-warning/10 text-warning border-warning/30",
  archived: "bg-dark-600/10 text-dark-400 border-dark-600/30",
};

export default function AgentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
    },
    onError: () => toast.error("Failed to delete agent"),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-dark-400">Loading agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card border-danger/30 bg-danger/5 text-center py-12">
          <p className="text-danger mb-2">Failed to load agents</p>
          <p className="text-sm text-dark-400">Make sure the server is running on port 8080</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Agents</h1>
          <p className="text-sm text-dark-400 mt-1">
            {agents?.length ?? 0} agent{agents?.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <button onClick={() => navigate("/agents/new")} className="btn-primary">
          + New Agent
        </button>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-medium text-dark-200 mb-2">No agents yet</h3>
          <p className="text-sm text-dark-400 mb-6">
            Create your first AI agent to get started
          </p>
          <button onClick={() => navigate("/agents/new")} className="btn-primary">
            Create Agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent: Agent) => (
            <div
              key={agent.id}
              className="card hover:border-dark-600 transition-all duration-200 cursor-pointer group"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-dark-100 group-hover:text-accent-light transition-colors">
                      {agent.name}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[agent.status] || STATUS_COLORS.draft}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.role && (
                    <p className="text-sm text-dark-300 mb-2">{agent.role}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-dark-400">
                    <span className="bg-dark-700 px-2 py-0.5 rounded">{agent.model}</span>
                    <span>
                      {Object.entries(agent.tools)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ") || "No tools"}
                    </span>
                    <span>Temp: {agent.parameters.temperature}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/agents/${agent.id}/test`)}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this agent?")) {
                        deleteMutation.mutate(agent.id);
                      }
                    }}
                    className="btn-danger text-xs py-1.5 px-3"
                  >
                    Delete
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
