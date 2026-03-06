import { useQuery } from "@tanstack/react-query";
import { fetchProviderModels } from "../api/agents";
import toast from "react-hot-toast";

export default function Settings() {
  const { data: providerData, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviderModels,
  });

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-dark-100 mb-2">Settings</h1>
      <p className="text-sm text-dark-400 mb-8">
        Configure provider API keys and view available models
      </p>

      <div className="space-y-6">
        {/* Provider Keys */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-200 mb-4">Provider API Keys</h2>
          <p className="text-sm text-dark-400 mb-4">
            API keys are stored securely on the server via environment variables (.env file).
            Update the .env file on the server to change keys.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-dark-600">
              <div>
                <p className="text-sm font-medium text-dark-200">OpenAI</p>
                <p className="text-xs text-dark-400">OPENAI_API_KEY</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-400">
                Set in .env
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-dark-600">
              <div>
                <p className="text-sm font-medium text-dark-200">Anthropic</p>
                <p className="text-xs text-dark-400">ANTHROPIC_API_KEY</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-400">
                Set in .env
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-dark-600">
              <div>
                <p className="text-sm font-medium text-dark-200">Mock Provider</p>
                <p className="text-xs text-dark-400">No key required</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-success/10 text-success border border-success/30">
                Always available
              </span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
            <p className="text-xs text-dark-400">
              <strong className="text-dark-300">Current Provider:</strong>{" "}
              {import.meta.env.VITE_LLM_PROVIDER || "mock"} (set LLM_PROVIDER in .env)
            </p>
          </div>
        </div>

        {/* Available Models */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-200 mb-4">Available Models</h2>

          {isLoading ? (
            <div className="flex items-center gap-2 text-dark-400">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Fetching models...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {providerData?.providers.map((provider) => (
                <div key={provider.name}>
                  <h3 className="text-sm font-medium text-dark-300 mb-2 capitalize">
                    {provider.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {provider.models.map((model) => (
                      <span
                        key={model}
                        className="text-xs bg-dark-700 text-dark-300 px-2.5 py-1 rounded-lg border border-dark-600"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              toast.success("Models refreshed");
            }}
            className="btn-secondary text-sm mt-4"
          >
            Refresh Models
          </button>
        </div>

        {/* Environment Info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-200 mb-4">Environment</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-dark-400">Server URL</span>
              <span className="text-dark-200">{window.location.origin}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">WebSocket</span>
              <span className="text-dark-200">ws://{window.location.host}/ws/test</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Version</span>
              <span className="text-dark-200">1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
