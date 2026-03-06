import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("pdf-parse");
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
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function ingest(): Promise<void> {
  console.log(`[Knowledge Ingest] Scanning ${PDF_DIR} for PDFs...`);

  if (!fs.existsSync(PDF_DIR)) {
    console.log(`[Knowledge Ingest] PDF directory not found: ${PDF_DIR}`);
    console.log("[Knowledge Ingest] Create it and add PDFs, then run again.");
    return;
  }

  const files = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`[Knowledge Ingest] Found ${files.length} PDF file(s)`);

  if (files.length === 0) {
    console.log("[Knowledge Ingest] No PDFs found. Add PDFs to the knowledge/pdfs directory.");
    return;
  }

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const relativePath = `knowledge/pdfs/${file}`;

    // Check if already ingested
    const existing = await prisma.document.findUnique({
      where: { path: relativePath },
    });

    if (existing) {
      console.log(`[Knowledge Ingest] Skipping ${file} (already ingested)`);
      continue;
    }

    console.log(`[Knowledge Ingest] Processing: ${file}`);

    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      const text = pdfData.text;

      if (!text || text.trim().length === 0) {
        console.log(`[Knowledge Ingest] Warning: ${file} has no extractable text, skipping`);
        continue;
      }

      const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
      console.log(`[Knowledge Ingest]   -> ${chunks.length} chunks (${text.length} chars)`);

      // Create document and chunks in a transaction
      await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            title: file.replace(/\.pdf$/i, ""),
            path: relativePath,
            source: "pdf",
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
  const status = await prisma.document.count();
  const chunkCount = await prisma.chunk.count();
  console.log(`[Knowledge Ingest] Total: ${status} documents, ${chunkCount} chunks`);
}

ingest()
  .catch((err) => {
    console.error("[Knowledge Ingest] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
