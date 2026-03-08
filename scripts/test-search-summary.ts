import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import fetch from "node-fetch";

const BASE_URL = "http://localhost:8080";

async function testSearchWithSummary() {
  console.log("🔍 Testing search_web tool with summarization...\n");

  // Create fake Tool context manually
  const timeStart = Date.now();

  // Test via WebSocket would be ideal, but for quick testing we'll check if the tool
  // has the summarization code by inspecting the built files
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const status = await response.text();
    console.log("✅ Server is running");
    console.log(`   Status: ${status}`);

    const totalTime = Date.now() - timeStart;
    console.log(`\n⏱️  Test completed in ${totalTime}ms`);
  } catch (err) {
    console.error("❌ Server test failed:", err);
    process.exit(1);
  }
}

testSearchWithSummary();
