import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { fetchProviderModels } from "../api/agents";
import toast from "react-hot-toast";

interface KnowledgeStatus {
  documentCount: number;
  chunkCount: number;
  provider: string;
}

async function fetchKnowledgeStatus(): Promise<KnowledgeStatus> {
  const res = await fetch("/api/knowledge/status");
  if (!res.ok) throw new Error("Failed to fetch knowledge status");
  return res.json();
}

export default function Settings() {
  const { data: providerData, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviderModels,
  });

  const { data: knowledgeStatus, refetch: refetchKnowledge } = useQuery({
    queryKey: ["knowledge-status"],
    queryFn: fetchKnowledgeStatus,
  });

  const [reindexing, setReindexing] = useState(false);
  const [brandingImage, setBrandingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("branding_image");
    if (saved) setBrandingImage(saved);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, SVG, etc.)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem("branding_image", dataUrl);
      setBrandingImage(dataUrl);
      window.dispatchEvent(new Event("branding_updated"));
      toast.success("Branding image updated");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBranding = () => {
    localStorage.removeItem("branding_image");
    setBrandingImage(null);
    window.dispatchEvent(new Event("branding_updated"));
    toast.success("Branding image removed");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-dark-100 mb-2">Settings</h1>
      <p className="text-sm text-dark-400 mb-8">
        Configure branding, provider API keys, and view available models
      </p>

      <div className="space-y-6">
        {/* Branding Image Upload */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-200 mb-2">Branding</h2>
          <p className="text-sm text-dark-400 mb-4">
            Upload a logo or branding image. It will appear above the app name in the sidebar.
          </p>

          <div className="flex items-start gap-6">
            {/* Preview */}
            <div className="w-40 h-24 rounded-lg border-2 border-dashed border-dark-600 flex items-center justify-center bg-dark-800 shrink-0 overflow-hidden">
              {brandingImage ? (
                <img
                  src={brandingImage}
                  alt="Branding preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-dark-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                  <span className="text-xs text-dark-500">No image</span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex-1 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-primary text-sm px-4 py-2"
                >
                  {brandingImage ? "Change Image" : "Upload Image"}
                </button>
                {brandingImage && (
                  <button
                    onClick={handleRemoveBranding}
                    className="btn-secondary text-sm px-4 py-2 text-red-400 border-red-400/30 hover:bg-red-400/10"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-500">
                Supported: PNG, JPG, SVG. Max 2MB. Recommended: 200x60px or similar aspect ratio.
              </p>
            </div>
          </div>
        </div>

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

        {/* Knowledge Base */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-200 mb-2">Knowledge Base</h2>
          <p className="text-sm text-dark-400 mb-4">
            PDF knowledge base for Retrieval-Augmented Generation (RAG). Drop PDFs into{" "}
            <code className="text-accent-light bg-dark-800 px-1 rounded">apps/server/knowledge/pdfs/</code>{" "}
            and reindex.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-dark-600">
              <div>
                <p className="text-sm font-medium text-dark-200">Provider</p>
                <p className="text-xs text-dark-400">{knowledgeStatus?.provider || "bm25"}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-400">
                {knowledgeStatus?.provider === "openai" ? "Embeddings" : "BM25 (local)"}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-dark-600">
              <div>
                <p className="text-sm font-medium text-dark-200">Documents</p>
                <p className="text-xs text-dark-400">{knowledgeStatus?.documentCount ?? 0} documents</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-400">
                {knowledgeStatus?.chunkCount ?? 0} chunks
              </span>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={async () => {
                setReindexing(true);
                try {
                  const res = await fetch("/api/knowledge/reindex", { method: "POST" });
                  if (res.ok) {
                    toast.success("Knowledge base reindexed");
                    refetchKnowledge();
                  } else {
                    toast.error("Reindex failed");
                  }
                } catch {
                  toast.error("Reindex failed");
                } finally {
                  setReindexing(false);
                }
              }}
              disabled={reindexing}
              className="btn-primary text-sm"
            >
              {reindexing ? "Reindexing..." : "Reindex"}
            </button>
            <a
              href="https://github.com/Jaiprasanth17/agentForge-Lite#knowledge-base"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              Docs
            </a>
          </div>
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
