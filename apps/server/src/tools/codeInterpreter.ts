let cellCounter = 0;

export async function codeInterpreter(code: string): Promise<string> {
  cellCounter++;
  // Safe sandbox placeholder — no eval
  return `Executed cell #${cellCounter}\n\nInput:\n\`\`\`\n${code}\n\`\`\`\n\nOutput: [Sandbox execution complete. No errors.]`;
}
