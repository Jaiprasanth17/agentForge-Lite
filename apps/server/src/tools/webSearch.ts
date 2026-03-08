/**
 * Web Search Tools
 *
 * This module now delegates to the web_search/ module which provides:
 * - search_web: Real web search via DuckDuckGo with result ranking
 * - click: Fetch and extract webpage content
 *
 * The old mock webSearch tool has been replaced.
 * Import "./web_search" to register the new tools.
 */

// Re-export from the new web_search module for backward compatibility
export { searchWeb, clickUrl, compressSources, formatWithCitations } from "./web_search";
