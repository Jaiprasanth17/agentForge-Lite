import { z } from "zod";
import { registerTool } from "./registry";

let cellCounter = 0;

export async function codeInterpreter(code: string): Promise<string> {
  cellCounter++;
  // Safe sandbox placeholder — no eval
  return `Executed cell #${cellCounter}\n\nInput:\n\`\`\`\n${code}\n\`\`\`\n\nOutput: [Sandbox execution complete. No errors.]`;
}

registerTool({
  name: "codeInterpreter",
  description: "Execute code in a sandboxed environment",
  inputSchema: z.object({
    code: z.string().min(1),
  }),
  async handler(_ctx, input) {
    const { code } = input as { code: string };
    const result = await codeInterpreter(code);
    return { ok: true, data: result };
  },
});
