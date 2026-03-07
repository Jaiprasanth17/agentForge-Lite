import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchAgent } from "../api/agents";

interface KnowledgeCitation {
  text: string;
  title: string;
  path: string;
  score: number;
  documentId: string;
  index: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  pending?: boolean;
  toolOk?: boolean;
  toolError?: string;
  toolCode?: string;
  toolMs?: number;
  citations?: KnowledgeCitation[];
}

interface UsageStats {
  tokensIn: number;
  tokensOut: number;
  latency: number;
}

export default function TestConsole() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [runWithTools, setRunWithTools] = useState(true);
  const [humanInTheLoop, setHumanInTheLoop] = useState(false);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [currentChunks, setCurrentChunks] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => fetchAgent(id!),
    enabled: Boolean(id),
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentChunks, scrollToBottom]);

  // WebSocket connection
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/test?agentId=${id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "connected":
          toast.success(`Connected to ${data.agentName}`);
          break;

        case "chunk":
          setCurrentChunks((prev) => prev + (data.text || ""));
          break;

        case "done":
          setCurrentChunks((prev) => {
            if (prev) {
              setMessages((msgs) => [
                ...msgs,
                {
                  id: `msg_${Date.now()}`,
                  role: "assistant",
                  content: prev,
                  timestamp: Date.now(),
                },
              ]);
            }
            return "";
          });
          setUsage(data.usage ? { ...data.usage, latency: data.latency } : null);
          setIsStreaming(false);
          break;

        case "tool_call":
          setMessages((msgs) => [
            ...msgs,
            {
              id: data.toolCallId,
              role: "tool",
              content: `Calling ${data.name}(${data.arguments})`,
              timestamp: Date.now(),
              toolName: data.name,
              toolCallId: data.toolCallId,
            },
          ]);
          break;

        case "tool_pending":
          setMessages((msgs) => [
            ...msgs,
            {
              id: `pending_${data.toolCallId}`,
              role: "system",
              content: `Tool "${data.name}" is pending approval`,
              timestamp: Date.now(),
              toolName: data.name,
              toolCallId: data.toolCallId,
              pending: true,
            },
          ]);
          break;

        case "tool_call_result": {
          // New structured tool result event
          const citations: KnowledgeCitation[] = [];
          if (data.ok && data.name === "knowledgeSearch" && data.data?.chunks) {
            for (const c of data.data.chunks) {
              citations.push({
                text: c.text,
                title: c.title,
                path: c.path,
                score: c.score,
                documentId: c.documentId,
                index: c.index,
              });
            }
          }
          setMessages((msgs) => [
            ...msgs,
            {
              id: `tcr_${data.toolCallId || Date.now()}`,
              role: "tool",
              content: data.ok
                ? (data.name === "knowledgeSearch"
                  ? `Found ${citations.length} citation(s)`
                  : (typeof data.data === "string" ? data.data : JSON.stringify(data.data, null, 2)))
                : `Tool failed: ${data.error}${data.code ? ` [${data.code}]` : ""}`,
              timestamp: Date.now(),
              toolName: data.name,
              toolCallId: data.toolCallId,
              toolOk: data.ok,
              toolError: data.ok ? undefined : data.error,
              toolCode: data.ok ? undefined : data.code,
              toolMs: data.ms,
              citations: citations.length > 0 ? citations : undefined,
            },
          ]);
          break;
        }

        case "tool_result":
          // Legacy tool_result - skip if already handled by tool_call_result
          setMessages((msgs) => {
            const alreadyHandled = msgs.some((m) => m.id === `tcr_${data.toolCallId}`);
            if (alreadyHandled) return msgs;
            return [
              ...msgs,
              {
                id: `result_${data.toolCallId || Date.now()}`,
                role: "tool",
                content: data.result,
                timestamp: Date.now(),
                toolName: data.tool,
              },
            ];
          });
          break;

        case "tool_call_started":
          // Visual indicator that a tool is starting
          break;

        case "token_budget":
          // Token budget was applied to prevent context_length_exceeded
          setMessages((msgs) => [
            ...msgs,
            {
              id: `budget_${Date.now()}`,
              role: "system",
              content: data.briefMode
                ? `⚡ Brief mode: context compressed (${data.estimatedBefore}→${data.estimatedAfter} tokens, max_tokens=${data.effectiveMaxTokens})`
                : `📊 Token budget applied: ${data.action} (${data.estimatedBefore}→${data.estimatedAfter} tokens)`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "tool_rejected":
          setMessages((msgs) => [
            ...msgs,
            {
              id: `rejected_${data.toolCallId}`,
              role: "system",
              content: `Tool call rejected by user`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "error":
          toast.error(data.text);
          setIsStreaming(false);
          break;

        case "cleared":
          setMessages([]);
          setCurrentChunks("");
          toast.success("Conversation cleared");
          break;
      }
    };

    ws.onclose = () => {
      if (cancelled) return;
      setIsConnected(false);
    };

    ws.onerror = () => {
      if (cancelled) return;
      toast.error("WebSocket connection failed");
      setIsConnected(false);
    };

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [id]);

  // Send settings when toggles change
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "settings", runWithTools, humanInTheLoop }));
    }
  }, [runWithTools, humanInTheLoop]);

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || isStreaming) return;

    if (input.trim() === "/clear") {
      wsRef.current.send(JSON.stringify({ type: "clear" }));
      setInput("");
      return;
    }

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setCurrentChunks("");
    wsRef.current.send(JSON.stringify({ type: "user_message", text: input.trim() }));
    setInput("");
    inputRef.current?.focus();
  };

  const handleToolApproval = (toolCallId: string, approved: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "tool_approval", toolApproval: { toolCallId, approved } })
      );
      setMessages((msgs) =>
        msgs.map((m) =>
          m.toolCallId === toolCallId && m.pending ? { ...m, pending: false, content: approved ? "Approved" : "Rejected" } : m
        )
      );
    }
  };

  const generateCurl = () => {
    if (!agent || messages.length === 0) return "";
    const userMessages = messages.filter((m) => m.role === "user");
    const lastMsg = userMessages[userMessages.length - 1];
    return `curl -X POST ${window.location.origin}/api/agents/${id} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ message: lastMsg?.content || "" })}'`;
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel - Agent Config Summary */}
      <div className="w-80 bg-dark-900 border-r border-dark-700 p-6 overflow-y-auto shrink-0">
        <button
          onClick={() => navigate(`/agents/${id}`)}
          className="text-sm text-dark-400 hover:text-dark-200 mb-4 flex items-center gap-1"
        >
          &larr; Back to Editor
        </button>

        <h2 className="text-lg font-bold text-dark-100 mb-4">
          {agent?.name || "Loading..."}
        </h2>

        {agent && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Model</label>
              <p className="text-sm text-dark-200 mt-1">{agent.model}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Role</label>
              <p className="text-sm text-dark-200 mt-1">{agent.role || "Not set"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Tools</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(agent.tools)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <span key={k} className="chip chip-active text-xs">
                      {k}
                    </span>
                  ))}
                {Object.values(agent.tools).every((v) => !v) && (
                  <span className="text-xs text-dark-500">None</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Parameters</label>
              <div className="text-xs text-dark-300 mt-1 space-y-1">
                <div>Temperature: {agent.parameters.temperature}</div>
                <div>Max Tokens: {agent.parameters.maxTokens}</div>
                <div>Top-p: {agent.parameters.topP}</div>
              </div>
            </div>

            <hr className="border-dark-700" />

            {/* Controls */}
            <div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-dark-300">Run with Tools</span>
                <div
                  className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
                    runWithTools ? "bg-accent" : "bg-dark-600"
                  }`}
                  onClick={() => setRunWithTools(!runWithTools)}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ${
                      runWithTools ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>

            <div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-dark-300">Human-in-the-Loop</span>
                <div
                  className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
                    humanInTheLoop ? "bg-accent" : "bg-dark-600"
                  }`}
                  onClick={() => setHumanInTheLoop(!humanInTheLoop)}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ${
                      humanInTheLoop ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>

            <hr className="border-dark-700" />

            {/* Usage Stats */}
            {usage && (
              <div>
                <label className="text-xs font-medium text-dark-400 uppercase tracking-wider">Last Run</label>
                <div className="text-xs text-dark-300 mt-1 space-y-1">
                  <div>Tokens In: {usage.tokensIn}</div>
                  <div>Tokens Out: {usage.tokensOut}</div>
                  <div>Latency: {usage.latency}ms</div>
                </div>
              </div>
            )}

            {/* Curl Snippet */}
            {messages.length > 0 && (
              <div>
                <label className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-1 block">
                  Reproduce this run
                </label>
                <div className="bg-dark-800 rounded-lg p-3 relative group">
                  <pre className="text-xs text-dark-300 overflow-x-auto whitespace-pre-wrap break-all">
                    {generateCurl()}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateCurl());
                      toast.success("Copied to clipboard");
                    }}
                    className="absolute top-2 right-2 text-xs text-dark-400 hover:text-dark-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col">
        {/* Connection Status Bar */}
        <div className="bg-dark-900 border-b border-dark-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-danger"}`} />
            <span className="text-sm text-dark-300">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-accent-light">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              Streaming...
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !currentChunks && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-lg font-medium text-dark-300 mb-2">Start a conversation</h3>
                <p className="text-sm text-dark-500">
                  Type a message below to test your agent. Use /clear to reset.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-br-md"
                    : msg.role === "tool"
                    ? "bg-dark-700 border border-dark-600 text-dark-200 rounded-bl-md"
                    : msg.role === "system"
                    ? "bg-warning/10 border border-warning/30 text-warning rounded-bl-md"
                    : "bg-dark-800 text-dark-100 rounded-bl-md"
                }`}
              >
                {msg.role === "tool" && (
                  <div className="flex items-center gap-2 text-xs mb-1 font-medium">
                    <span className={msg.toolOk === false ? "text-danger" : "text-accent-light"}>
                      🔧 {msg.toolName || "Tool"}
                    </span>
                    {msg.toolMs !== undefined && (
                      <span className="text-dark-500">{msg.toolMs}ms</span>
                    )}
                    {msg.toolOk === false && msg.toolCode && (
                      <span className="text-danger/70 bg-danger/10 px-1.5 py-0.5 rounded text-[10px]">
                        {msg.toolCode}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2 space-y-2 border-t border-dark-600 pt-2">
                    <div className="text-xs text-accent-light font-medium">📚 Citations:</div>
                    {msg.citations.map((cite, i) => (
                      <div key={i} className="bg-dark-800 rounded-lg p-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <a
                            href={`/static/knowledge/${cite.path.split("/").pop()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline font-medium"
                          >
                            {cite.title}
                          </a>
                          <span className="text-dark-500">
                            Score: {(cite.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-dark-300 line-clamp-3">{cite.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                {msg.pending && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleToolApproval(msg.toolCallId!, true)}
                      className="text-xs bg-success/20 text-success px-3 py-1 rounded-lg hover:bg-success/30"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleToolApproval(msg.toolCallId!, false)}
                      className="text-xs bg-danger/20 text-danger px-3 py-1 rounded-lg hover:bg-danger/30"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming chunk */}
          {currentChunks && (
            <div className="flex justify-start">
              <div className="max-w-[70%] bg-dark-800 text-dark-100 rounded-2xl rounded-bl-md px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{currentChunks}</p>
                <span className="inline-block w-2 h-4 bg-accent-light animate-pulse ml-1" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-dark-900 border-t border-dark-700 p-4">
          <div className="flex gap-3 max-w-3xl mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={isConnected ? 'Type a message... (or "/clear")' : "Connecting..."}
              disabled={!isConnected}
              className="input-field flex-1"
            />
            <button
              onClick={sendMessage}
              disabled={!isConnected || isStreaming || !input.trim()}
              className="btn-primary px-6"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
