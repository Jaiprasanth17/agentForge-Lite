import { describe, it, expect } from "vitest";
import { SearchCache } from "../tools/web_search/cache";
import {
  removeStopWords,
  constructQuery,
  estimateTokens,
  broadenQuery,
  generateAlternativeQueries,
} from "../tools/web_search/utils";
import { scoreResult, rankResults, filterTopResults } from "../tools/web_search/scorer";
import {
  extractTextFromHtml,
  extractMainContent,
  extractTitle,
} from "../tools/web_search/extract";
import { compressText, compressSources, formatWithCitations } from "../tools/web_search/compress";
import { rewriteQuery, shouldSearch } from "../tools/web_search/queryRewrite";
import type { SerpResult } from "../tools/web_search/cache";

// ---------------------------------------------------------------------------
// Cache tests
// ---------------------------------------------------------------------------
describe("SearchCache", () => {
  it("stores and retrieves values", () => {
    const cache = new SearchCache<string>(10, 60000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = new SearchCache<string>(10, 60000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest entry when at capacity", () => {
    const cache = new SearchCache<string>(2, 60000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3"); // should evict 'a'
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
  });

  it("expires entries after TTL", async () => {
    const cache = new SearchCache<string>(10, 50); // 50ms TTL
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get("key")).toBeUndefined();
  });

  it("has() returns false for expired entries", async () => {
    const cache = new SearchCache<string>(10, 50);
    cache.set("key", "value");
    expect(cache.has("key")).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.has("key")).toBe(false);
  });

  it("clear() removes all entries", () => {
    const cache = new SearchCache<string>(10, 60000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Utils tests
// ---------------------------------------------------------------------------
describe("Utils", () => {
  describe("removeStopWords", () => {
    it("removes common stop words", () => {
      expect(removeStopWords("what is the latest news about AI")).toBe("latest news AI");
    });

    it("preserves query if all words are stop words", () => {
      expect(removeStopWords("the is a")).toBe("the is a");
    });

    it("handles empty string", () => {
      expect(removeStopWords("")).toBe("");
    });
  });

  describe("constructQuery", () => {
    it("removes stop words and preserves quoted phrases", () => {
      const result = constructQuery('what is the "OpenAI API" for building agents');
      expect(result).toContain('"OpenAI API"');
      expect(result).not.toContain("what");
    });

    it("preserves site: filters", () => {
      const result = constructQuery("AI agents site:github.com");
      expect(result).toContain("site:github.com");
    });

    it("preserves after: date filters", () => {
      const result = constructQuery("AI news after:2025-01-01");
      expect(result).toContain("after:2025-01-01");
    });
  });

  describe("estimateTokens", () => {
    it("estimates tokens for a string", () => {
      const tokens = estimateTokens("Hello world this is a test");
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("broadenQuery", () => {
    it("removes site: filters", () => {
      expect(broadenQuery("AI agents site:github.com")).toBe("AI agents");
    });

    it("unquotes phrases", () => {
      expect(broadenQuery('"exact phrase" search')).toBe("exact phrase search");
    });

    it("removes date filters", () => {
      expect(broadenQuery("AI news after:2025-01-01")).toBe("AI news");
    });
  });

  describe("generateAlternativeQueries", () => {
    it("generates broader alternatives", () => {
      const alts = generateAlternativeQueries('"AI agents" site:github.com');
      expect(alts.length).toBeGreaterThan(0);
    });

    it("adds 'what is' prefix for short queries", () => {
      const alts = generateAlternativeQueries("quantum computing");
      expect(alts.some((q) => q.includes("what is"))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Scorer tests
// ---------------------------------------------------------------------------
describe("Scorer", () => {
  const mockResults: SerpResult[] = [
    { id: "1", title: "Gov Report", url: "https://example.gov/report", snippet: "A government report on AI policy with comprehensive analysis" },
    { id: "2", title: "Blog Post", url: "https://random-blog.blogspot.com/ai", snippet: "My thoughts on AI" },
    { id: "3", title: "Wikipedia", url: "https://en.wikipedia.org/wiki/AI", snippet: "Artificial intelligence overview with detailed history and applications" },
    { id: "4", title: "GitHub Docs", url: "https://docs.github.com/api", snippet: "GitHub API documentation for developers" },
    { id: "5", title: "Pinterest", url: "https://www.pinterest.com/ai-images", snippet: "AI images" },
  ];

  describe("scoreResult", () => {
    it("gives high scores to .gov domains", () => {
      const score = scoreResult(mockResults[0]);
      expect(score).toBeGreaterThan(8);
    });

    it("penalizes low-credibility domains", () => {
      const blogScore = scoreResult(mockResults[1]);
      const govScore = scoreResult(mockResults[0]);
      expect(blogScore).toBeLessThan(govScore);
    });
  });

  describe("rankResults", () => {
    it("ranks results by credibility score", () => {
      const ranked = rankResults(mockResults);
      expect(ranked[0].url).toContain("gov");
    });
  });

  describe("filterTopResults", () => {
    it("filters to maxResults and removes low credibility", () => {
      const filtered = filterTopResults(mockResults, 3);
      expect(filtered.length).toBeLessThanOrEqual(3);
      // Should not include pinterest
      expect(filtered.some((r) => r.url.includes("pinterest"))).toBe(false);
    });

    it("removes duplicate domains", () => {
      const dupes: SerpResult[] = [
        { id: "1", title: "Page 1", url: "https://example.com/page1", snippet: "First page" },
        { id: "2", title: "Page 2", url: "https://example.com/page2", snippet: "Second page" },
      ];
      const filtered = filterTopResults(dupes, 5);
      expect(filtered.length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Extract tests
// ---------------------------------------------------------------------------
describe("Extract", () => {
  describe("extractTextFromHtml", () => {
    it("strips HTML tags", () => {
      const result = extractTextFromHtml("<p>Hello <b>world</b></p>");
      expect(result).toBe("Hello world");
    });

    it("removes script tags and content", () => {
      const result = extractTextFromHtml("<p>Text</p><script>alert('xss')</script><p>More</p>");
      expect(result).not.toContain("alert");
      expect(result).toContain("Text");
      expect(result).toContain("More");
    });

    it("removes style tags and content", () => {
      const result = extractTextFromHtml("<style>.foo{color:red}</style><p>Content</p>");
      expect(result).not.toContain("color:red");
      expect(result).toContain("Content");
    });

    it("removes nav and footer elements", () => {
      const result = extractTextFromHtml("<nav>Nav stuff</nav><main>Main content</main><footer>Footer</footer>");
      expect(result).not.toContain("Nav stuff");
      expect(result).not.toContain("Footer");
      expect(result).toContain("Main content");
    });

    it("decodes HTML entities", () => {
      const result = extractTextFromHtml("<p>Hello &amp; world &lt;test&gt;</p>");
      expect(result).toContain("Hello & world <test>");
    });

    it("handles large pages by normalizing whitespace", () => {
      const bigHtml = "<p>" + "word ".repeat(10000) + "</p>";
      const result = extractTextFromHtml(bigHtml);
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain("  "); // No double spaces
    });
  });

  describe("extractMainContent", () => {
    it("extracts article content when available", () => {
      const html = "<nav>Nav</nav><article>Article content here</article><footer>Footer</footer>";
      const result = extractMainContent(html);
      expect(result).toContain("Article content");
      expect(result).not.toContain("Nav");
    });

    it("extracts main content when available", () => {
      const html = "<header>Header</header><main>Main content here</main><aside>Sidebar</aside>";
      const result = extractMainContent(html);
      expect(result).toContain("Main content");
    });

    it("falls back to full HTML extraction", () => {
      const html = "<div>Just a simple page with content</div>";
      const result = extractMainContent(html);
      expect(result).toContain("simple page");
    });
  });

  describe("extractTitle", () => {
    it("extracts title from title tag", () => {
      const html = "<title>My Page Title</title><body>Content</body>";
      expect(extractTitle(html)).toBe("My Page Title");
    });

    it("extracts title from og:title", () => {
      const html = '<meta property="og:title" content="OG Title">';
      expect(extractTitle(html)).toBe("OG Title");
    });

    it("falls back to h1", () => {
      const html = "<h1>Heading Title</h1><p>Content</p>";
      expect(extractTitle(html)).toBe("Heading Title");
    });

    it("returns empty string if no title found", () => {
      const html = "<p>No title here</p>";
      expect(extractTitle(html)).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// Compression tests
// ---------------------------------------------------------------------------
describe("Compression", () => {
  describe("compressText", () => {
    it("returns text unchanged if under budget", () => {
      const short = "This is a short text.";
      expect(compressText(short, 200)).toBe(short);
    });

    it("truncates long text to fit token budget", () => {
      const long = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence. Ninth sentence. Tenth sentence.";
      const compressed = compressText(long, 20);
      expect(estimateTokens(compressed)).toBeLessThanOrEqual(25); // Allow small overshoot
      expect(compressed.length).toBeLessThan(long.length);
    });

    it("returns empty string for empty input", () => {
      expect(compressText("", 200)).toBe("");
    });

    it("handles text with no sentence boundaries", () => {
      const noSentences = "a ".repeat(500);
      const compressed = compressText(noSentences, 10);
      expect(compressed.length).toBeLessThan(noSentences.length);
    });
  });

  describe("compressSources", () => {
    it("compresses multiple sources within total budget", () => {
      const sources = [
        { text: "A".repeat(1000), url: "https://a.com", title: "Source A" },
        { text: "B".repeat(1000), url: "https://b.com", title: "Source B" },
        { text: "C".repeat(1000), url: "https://c.com", title: "Source C" },
      ];
      const compressed = compressSources(sources, 600);
      const totalTokens = compressed.reduce((sum, s) => sum + s.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(600);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("limits per-source tokens to 200", () => {
      const sources = [
        { text: "X".repeat(2000), url: "https://x.com", title: "Source X" },
      ];
      const compressed = compressSources(sources, 600);
      expect(compressed[0].tokens).toBeLessThanOrEqual(210); // Allow small overshoot
    });

    it("stops when total budget is exhausted", () => {
      const sources = Array.from({ length: 10 }, (_, i) => ({
        text: `Source ${i} content. `.repeat(100),
        url: `https://source${i}.com`,
        title: `Source ${i}`,
      }));
      const compressed = compressSources(sources, 600);
      const totalTokens = compressed.reduce((sum, s) => sum + s.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(600);
    });
  });

  describe("formatWithCitations", () => {
    it("formats sources with inline citations", () => {
      const sources = [
        { text: "AI is transforming industries.", url: "https://example.com", title: "AI Report" },
        { text: "Machine learning is a subset of AI.", url: "https://ml.org", title: "ML Guide" },
      ];
      const { citedText, sourcesList } = formatWithCitations(sources);
      expect(citedText).toContain("According to AI Report (https://example.com)");
      expect(citedText).toContain("According to ML Guide (https://ml.org)");
      expect(sourcesList).toContain("- AI Report (https://example.com)");
      expect(sourcesList).toContain("- ML Guide (https://ml.org)");
    });

    it("returns empty strings for empty sources", () => {
      const { citedText, sourcesList } = formatWithCitations([]);
      expect(citedText).toBe("");
      expect(sourcesList).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// Query Rewrite tests
// ---------------------------------------------------------------------------
describe("QueryRewrite", () => {
  describe("rewriteQuery", () => {
    it("generates three query variants", () => {
      const result = rewriteQuery("What are the latest AI developments?");
      expect(result.focused).toBeTruthy();
      expect(result.supporting).toBeTruthy();
      expect(result.filtered).toBeTruthy();
    });

    it("adds year for recent event queries", () => {
      const result = rewriteQuery("latest AI news");
      const year = new Date().getFullYear().toString();
      expect(result.focused).toContain(year);
    });

    it("adds site filter for tech queries", () => {
      const result = rewriteQuery("React API documentation");
      expect(result.filtered).toContain("site:");
    });
  });

  describe("shouldSearch", () => {
    it("returns true for current events queries", () => {
      expect(shouldSearch("What is the latest news about AI in 2025?")).toBe(true);
    });

    it("returns true for factual verification", () => {
      expect(shouldSearch("Is it true that Python 4 was released?")).toBe(true);
    });

    it("returns true for API/library queries", () => {
      expect(shouldSearch("What version of React is the latest?")).toBe(true);
    });

    it("returns false for pure coding tasks", () => {
      expect(shouldSearch("write a function to sort an array")).toBe(false);
    });

    it("returns false for conceptual explanations", () => {
      expect(shouldSearch("explain recursion")).toBe(false);
    });
  });
});
