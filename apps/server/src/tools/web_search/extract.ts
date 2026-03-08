/**
 * HTML to text extraction.
 * Strips navigation, ads, scripts, styles, and extracts only relevant content.
 */

/**
 * Remove HTML tags and extract clean text content.
 * Strips: scripts, styles, nav bars, ads, footers, headers, forms.
 */
export function extractTextFromHtml(html: string): string {
  let text = html;

  // Remove script tags and content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");

  // Remove style tags and content
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // Remove SVG tags and content
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");

  // Remove common non-content elements (nav, header, footer, aside, form)
  const nonContentTags = ["nav", "header", "footer", "aside", "form", "iframe", "noscript"];
  for (const tag of nonContentTags) {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, "gi");
    text = text.replace(regex, " ");
  }

  // Remove elements with common ad/nav class names or IDs
  text = text.replace(/<[^>]+(class|id)\s*=\s*["'][^"']*(sidebar|navbar|nav-|menu|footer|header|cookie|banner|popup|modal|overlay|advertisement|ad-|ads-|advert|social|share|comment|related|recommended)[^"']*["'][^>]*>[\s\S]*?<\/\w+>/gi, " ");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Decode common HTML entities to their text equivalents.
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&ndash;": "-",
    "&mdash;": "--",
    "&laquo;": '"',
    "&raquo;": '"',
    "&bull;": "-",
    "&hellip;": "...",
    "&copy;": "(c)",
    "&reg;": "(R)",
    "&trade;": "(TM)",
  };

  let decoded = text;
  for (const [entity, replacement] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(replacement);
  }

  // Handle numeric entities (&#NNN; and &#xHHH;)
  decoded = decoded.replace(/&#(\d+);/g, (_match, code: string) => {
    const num = parseInt(code, 10);
    return num > 31 && num < 127 ? String.fromCharCode(num) : " ";
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => {
    const num = parseInt(code, 16);
    return num > 31 && num < 127 ? String.fromCharCode(num) : " ";
  });

  return decoded;
}

/**
 * Extract the main content area from HTML if possible.
 * Looks for <main>, <article>, or content divs.
 */
export function extractMainContent(html: string): string {
  // Try to find <article> content first
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    return extractTextFromHtml(articleMatch[1]);
  }

  // Try <main> content
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    return extractTextFromHtml(mainMatch[1]);
  }

  // Try content div patterns
  const contentPatterns = [
    /<div[^>]+(?:class|id)\s*=\s*["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+(?:class|id)\s*=\s*["'][^"']*article[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+(?:class|id)\s*=\s*["'][^"']*post[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+(?:class|id)\s*=\s*["'][^"']*body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1].length > 200) {
      return extractTextFromHtml(match[1]);
    }
  }

  // Fallback: extract from full HTML
  return extractTextFromHtml(html);
}

/**
 * Extract title from HTML.
 */
export function extractTitle(html: string): string {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1]).trim();
  }

  // Try og:title
  const ogMatch = html.match(/<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']+)["']/i);
  if (ogMatch) {
    return decodeHtmlEntities(ogMatch[1]).trim();
  }

  // Try first h1
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return extractTextFromHtml(h1Match[1]).slice(0, 200);
  }

  return "";
}
