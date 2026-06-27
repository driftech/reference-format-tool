import type { ReferenceItem } from "./referenceTypes";

export type PageMetadata = {
  pages: string | null;
  articleNumber: string | null;
};

const pageKeys = [
  "pages",
  "page",
  "pageRange",
  "page_range",
  "page-range",
  "pagination",
];

const pageStartKeys = [
  "pageStart",
  "page_start",
  "firstPage",
  "first_page",
  "first-page",
];

const pageEndKeys = [
  "pageEnd",
  "page_end",
  "lastPage",
  "last_page",
  "last-page",
];

const articleNumberKeys = [
  "articleNumber",
  "article_number",
  "article-number",
  "elocationId",
  "eLocationId",
  "eLocationID",
  "elocation_id",
  "e-location-id",
];

export function normalizePages(value: unknown): string | null {
  const cleaned = normalizeString(value);
  if (!cleaned) return null;

  const withoutLabel = cleaned
    .replace(/^pp?\.\s*/i, "")
    .replace(/^pages?\s*/i, "")
    .replace(/^:\s*/, "")
    .trim();
  const rangeMatch = withoutLabel.match(/[A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6}/);

  if (rangeMatch?.[0]) {
    return rangeMatch[0].replace(/\s*[-\u2013\u2014?]\s*/g, "-");
  }

  if (/^(?:[A-Za-z]?\d{1,6}|e\d{3,})$/i.test(withoutLabel)) {
    return withoutLabel;
  }

  return null;
}

export function normalizeArticleNumber(value: unknown): string | null {
  const cleaned = normalizeString(value);
  if (!cleaned || isPageRange(cleaned)) return null;

  const withoutLabel = cleaned
    .replace(/^article\s*(?:number|no\.?)?\s*/i, "")
    .replace(/^art\.\s*no\.\s*/i, "")
    .trim();

  return /^(?:[A-Za-z]?\d{3,}|e\d{3,})$/i.test(withoutLabel) ? withoutLabel : null;
}

export function extractPagesFromMetadata(raw: unknown): PageMetadata {
  const firstPage = firstNestedString(raw, pageStartKeys);
  const lastPage = firstNestedString(raw, pageEndKeys);
  const directPages = firstNestedString(raw, pageKeys);
  const directArticleNumber = firstNestedString(raw, articleNumberKeys);
  const joinedPages = joinPages(firstPage, lastPage);
  const normalizedPages = normalizePages(joinedPages ?? directPages);
  const normalizedArticle =
    normalizeArticleNumber(directArticleNumber) ??
    (!normalizedPages && directPages ? normalizeArticleNumber(directPages) : null);

  return {
    pages: normalizedPages,
    articleNumber: normalizedArticle,
  };
}

export function extractPagesFromText(text: string): PageMetadata {
  const cleaned = stripDoiAndUrls(text).slice(0, 12000);
  const explicitPageRange =
    cleaned.match(/(?:pp?\.?|pages?)\s*([A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6})/i)?.[1] ??
    cleaned.match(/\b\d{1,4}\s*\(\s*\d{1,3}\s*\)\s*[,;:]?\s*(?:pp?\.?\s*)?([A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6})/i)?.[1] ??
    cleaned.match(/\b(?:19|20)\d{2}\s*;\s*\d{1,4}(?:\s*\(\s*\d{1,3}\s*\))?\s*:\s*([A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6})/i)?.[1] ??
    cleaned.match(/[,;:]\s*([A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6})\b/)?.[1];
  const pages = normalizePages(explicitPageRange);

  if (pages && isPageRange(pages)) {
    return { pages, articleNumber: null };
  }

  const articleNumber =
    cleaned.match(/\b(?:19|20)\d{2}\s*;\s*\d{1,4}(?:\s*\(\s*\d{1,3}\s*\))?\s*:\s*([A-Za-z]?\d{5,}|e\d{3,})\b/i)?.[1] ??
    cleaned.match(/\b\d{1,4}\s*\(\s*\d{1,3}\s*\)\s*[,;:]\s*([A-Za-z]?\d{5,}|e\d{3,})\b/i)?.[1];

  return {
    pages,
    articleNumber: normalizeArticleNumber(articleNumber),
  };
}

export function getPagesOrArticleNumber(reference: ReferenceItem): PageMetadata {
  const metadata = extractPagesFromMetadata(reference.rawMetadata);

  return {
    pages: normalizePages(reference.pages) ?? metadata.pages,
    articleNumber:
      normalizeArticleNumber(reference.articleNumber) ??
      metadata.articleNumber ??
      (!normalizePages(reference.pages) ? normalizeArticleNumber(reference.pages) : null),
  };
}

export function mergePageMetadataIntoReference(
  item: ReferenceItem,
  fallback: PageMetadata,
): ReferenceItem {
  const current = getPagesOrArticleNumber(item);
  const pages = current.pages ?? fallback.pages;
  const articleNumber = current.articleNumber ?? (!pages ? fallback.articleNumber : item.articleNumber ?? null);

  if (pages === item.pages && articleNumber === (item.articleNumber ?? null)) {
    return item;
  }

  return {
    ...item,
    pages,
    articleNumber,
  };
}

export function isPageRange(value: string): boolean {
  return /[A-Za-z]?\d{1,6}\s*[-\u2013\u2014?]\s*[A-Za-z]?\d{1,6}/.test(value);
}

function joinPages(firstPage: string | null, lastPage: string | null): string | null {
  if (firstPage && lastPage) {
    return firstPage === lastPage ? firstPage : `${firstPage}-${lastPage}`;
  }

  return firstPage ?? lastPage;
}

function firstNestedString(raw: unknown, keys: string[]): string | null {
  if (!raw || typeof raw !== "object") return null;

  const stack: unknown[] = [raw];
  const seen = new Set<unknown>();
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (keySet.has(key.toLowerCase())) {
        const normalized = normalizeString(value);
        if (normalized) return normalized;
      }

      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function stripDoiAndUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bdoi\s*:?\s*10\.\d{4,9}\/\S+/gi, " ")
    .replace(/\b10\.\d{4,9}\/\S+/gi, " ");
}
