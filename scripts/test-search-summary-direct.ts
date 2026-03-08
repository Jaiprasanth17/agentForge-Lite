import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { TOOL_REGISTRY, invokeTool } from "../apps/server/src/tools/registry";
import "../apps/server/src/tools/web_search/index";

async function testSearchSummarization() {
  console.log("🔍 Testing search_web tool with AI summarization...\n");

  try {
    const ctx = { logger: console.log, knowledge: null as any };
    
    console.log("📝 Invoking search_web with query: 'climate change 2026'");
    const res = await invokeTool(ctx, "search_web", {
      queries: ["climate change 2026"],
    });

    console.log("\n📦 Response structure:");
    console.log(JSON.stringify(res, null, 2));

    if (res.ok) {
      const data = res.data as any;
      console.log("\n✅ Search completed successfully\n");
      console.log("Results count:", data.count);
      console.log("Has analysis?:", !!data.analysis);
      
      if (data.analysis) {
        console.log("\n🎯 AI-Generated Analysis:");
        console.log("---");
        console.log(data.analysis);
        console.log("---\n");
      }

      if (data.results && data.results.length > 0) {
        console.log("📊 First 3 results:");
        data.results.slice(0, 3).forEach((r: any, i: number) => {
          console.log(`\n${i + 1}. ${r.title}`);
          console.log(`   URL: ${r.url}`);
          console.log(`   Snippet: ${r.snippet.substring(0, 100)}...`);
        });
      }
    } else {
      console.error("❌ Search failed:", res);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testSearchSummarization();
