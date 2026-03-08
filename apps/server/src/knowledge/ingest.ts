import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.resolve(__dirname, "../../knowledge");
const PDF_DIR = path.join(KNOWLEDGE_DIR, "pdfs");
const CHUNK_SIZE = 3000; // ~800 tokens
const CHUNK_OVERLAP = 300; // small overlap for context continuity

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    // If we reached the end of the text, stop
    if (end >= text.length) break;
    // Advance start; ensure it always moves forward to avoid infinite loop
    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : start + chunkSize;
  }
  return chunks;
}

/**
 * Extract text from a PDF by spawning a standalone Node subprocess.
 * Uses pdf-extract.cjs helper to avoid tsx module resolution issues with pdf-parse.
 */
function extractPdfText(filePath: string): string {
  const absPath = path.resolve(filePath);
  const extractScript = path.resolve(__dirname, "pdf-extract.cjs");
  const serverRoot = path.resolve(__dirname, "../..");
  const result = execSync(
    `node --max-old-space-size=256 ${JSON.stringify(extractScript)} ${JSON.stringify(absPath)}`,
    {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: serverRoot,
    }
  );
  return result.toString("utf-8");
}

async function ingest(): Promise<void> {
  console.log(`[Knowledge Ingest] Scanning ${PDF_DIR} for documents...`);

  if (!fs.existsSync(PDF_DIR)) {
    console.log(`[Knowledge Ingest] Directory not found: ${PDF_DIR}`);
    console.log("[Knowledge Ingest] Create it and add PDFs/TXT files, then run again.");
    return;
  }

  // Sort: .txt files first (reliable), then .pdf files (may need pdf-parse subprocess)
  const files = fs.readdirSync(PDF_DIR)
    .filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith(".pdf") || lower.endsWith(".txt");
    })
    .sort((a, b) => {
      const aIsTxt = a.toLowerCase().endsWith(".txt") ? 0 : 1;
      const bIsTxt = b.toLowerCase().endsWith(".txt") ? 0 : 1;
      return aIsTxt - bIsTxt;
    });
  console.log(`[Knowledge Ingest] Found ${files.length} file(s)`);

  if (files.length === 0) {
    console.log("[Knowledge Ingest] No files found. Add PDFs or TXT files to the knowledge/pdfs directory.");
    return;
  }

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const relativePath = `knowledge/pdfs/${file}`;

    const existing = await prisma.document.findUnique({
      where: { path: relativePath },
    });

    if (existing) {
      console.log(`[Knowledge Ingest] Skipping ${file} (already ingested)`);
      continue;
    }

    console.log(`[Knowledge Ingest] Processing: ${file}`);

    try {
      let text: string;

      if (file.toLowerCase().endsWith(".txt")) {
        text = fs.readFileSync(filePath, "utf-8");
      } else {
        text = extractPdfText(filePath);
      }

      if (!text || text.trim().length === 0) {
        console.log(`[Knowledge Ingest] Warning: ${file} has no extractable text, skipping`);
        continue;
      }

      const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
      console.log(`[Knowledge Ingest]   -> ${chunks.length} chunks (${text.length} chars)`);

      await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            title: file.replace(/\.(pdf|txt)$/i, ""),
            path: relativePath,
            source: file.toLowerCase().endsWith(".pdf") ? "pdf" : "txt",
          },
        });

        for (let i = 0; i < chunks.length; i++) {
          await tx.chunk.create({
            data: {
              documentId: doc.id,
              index: i,
              text: chunks[i],
            },
          });
        }
      });

      totalChunks += chunks.length;
    } catch (err) {
      console.error(`[Knowledge Ingest] Error processing ${file}:`, err);
    }
  }

  console.log(`[Knowledge Ingest] Done. Ingested ${totalChunks} new chunks.`);
  const docCount = await prisma.document.count();
  const chunkCount = await prisma.chunk.count();
  console.log(`[Knowledge Ingest] Total: ${docCount} documents, ${chunkCount} chunks`);
}

ingest()
  .catch((err) => {
    console.error("[Knowledge Ingest] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
