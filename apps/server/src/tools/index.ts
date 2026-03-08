// Import all tool modules to trigger registration via registerTool()
import "./web_search"; // Registers search_web and click tools
import "./codeInterpreter";
import "./memory";
import "./knowledgeSearch";
import "./advancedReasoning";

// Re-export registry functions
export { TOOL_REGISTRY, invokeTool, registerTool } from "./registry";
export type { ToolContext, ToolResult, ToolDefinition, KnowledgeService } from "./types";
