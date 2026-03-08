#!/usr/bin/env node
// Standalone PDF text extractor - runs with plain node (not tsx)
// Usage: node pdf-extract.cjs <path-to-pdf>
const { PDFParse } = require("pdf-parse");
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write("Usage: node pdf-extract.cjs <pdf-path>\n");
  process.exit(1);
}

const absPath = path.resolve(filePath);
const buf = new Uint8Array(fs.readFileSync(absPath));
const p = new PDFParse(buf, {});

p.load().then(async (doc) => {
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) {
        text += item.str + (item.hasEOL ? "\n" : " ");
      }
    }
    text += "\n\n";
  }
  process.stdout.write(text);
  process.exit(0);
}).catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});

setTimeout(() => process.exit(1), 30000);
