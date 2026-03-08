#!/usr/bin/env node
// Lightweight knowledge ingestion script using sqlite3 CLI
// Avoids Prisma/pdf-parse memory issues by using subprocess isolation
// Usage: node src/knowledge/ingest.cjs
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const crypto = require("crypto");

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.resolve(__dirname, "../../knowledge");
const PDF_DIR = path.join(KNOWLEDGE_DIR, "pdfs");
const DB_PATH = path.resolve(__dirname, "../../prisma/dev.db");
const CHUNK_SIZE = 3000;
const CHUNK_OVERLAP = 300;

function cuid() {
  return "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
}

function sqlEscape(str) {
  return str.replace(/'/g, "''");
}

function runSql(sql) {
  // Use stdin to pass SQL to avoid shell escaping issues with special characters
  return execSync(`sqlite3 "${DB_PATH}"`, { input: sql, encoding: "utf-8" }).trim();
}

function chunkText(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

function extractPdfText(filePath) {
  // Delegate PDF parsing to a separate Node subprocess with strict timeout.
  // pdf-parse v2 can hang/OOM in some environments; timeout prevents blocking.
  const extractScript = path.resolve(__dirname, "pdf-extract.cjs");
  const absPath = path.resolve(filePath);
  const result = execFileSync("node", ["--max-old-space-size=256", extractScript, absPath], {
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.toString("utf-8");
}

function ingest() {
  console.log(`[Knowledge Ingest] Scanning ${PDF_DIR} for documents...`);

  if (!fs.existsSync(DB_PATH)) {
    console.log(`[Knowledge Ingest] Database not found at ${DB_PATH}`);
    console.log("[Knowledge Ingest] Run 'npm run db:push' first.");
    return;
  }

  if (!fs.existsSync(PDF_DIR)) {
    console.log(`[Knowledge Ingest] Directory not found: ${PDF_DIR}`);
    console.log("[Knowledge Ingest] Create it and add PDFs/TXT files, then run again.");
    return;
  }

  // Sort: .txt files first (reliable), then .pdf files (may need pdf-parse)
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

    // Check if already ingested
    const existingCount = runSql(
      `SELECT COUNT(*) FROM Document WHERE path='${sqlEscape(relativePath)}';`
    );
    if (parseInt(existingCount, 10) > 0) {
      console.log(`[Knowledge Ingest] Skipping ${file} (already ingested)`);
      continue;
    }

    console.log(`[Knowledge Ingest] Processing: ${file}`);

    try {
      let text;

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

      const docId = cuid();
      const title = file.replace(/\.(pdf|txt)$/i, "");
      const source = file.toLowerCase().endsWith(".pdf") ? "pdf" : "txt";
      const now = new Date().toISOString();

      // Insert document
      runSql(
        `INSERT INTO Document (id, title, path, source, createdAt) VALUES ('${docId}', '${sqlEscape(title)}', '${sqlEscape(relativePath)}', '${source}', '${now}');`
      );

      // Insert chunks using a single SQL transaction for speed
      const chunkSqlParts = chunks.map((chunk, i) => {
        const chunkId = cuid();
        return `INSERT INTO Chunk (id, documentId, 'index', text) VALUES ('${chunkId}', '${docId}', ${i}, '${sqlEscape(chunk)}');`;
      });
      // Execute in batches via stdin to avoid command line length limits
      const batchSql = "BEGIN TRANSACTION;\n" + chunkSqlParts.join("\n") + "\nCOMMIT;";
      execSync(`sqlite3 "${DB_PATH}"`, {
        input: batchSql,
        encoding: "utf-8",
      });

      totalChunks += chunks.length;
    } catch (err) {
      console.error(`[Knowledge Ingest] Error processing ${file}:`, err.message || err);
    }
  }

  console.log(`[Knowledge Ingest] Done. Ingested ${totalChunks} new chunks.`);
  const docCount = runSql("SELECT COUNT(*) FROM Document;");
  const chunkCount = runSql("SELECT COUNT(*) FROM Chunk;");
  console.log(`[Knowledge Ingest] Total: ${docCount} documents, ${chunkCount} chunks`);
}

ingest();
