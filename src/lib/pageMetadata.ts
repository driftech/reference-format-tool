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

export function normalizePages(
  value: unknown,
  options: { allowSinglePage?: boolean } = {},
): string | null {
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

  if (options.allowSinglePage && /^(?:[A-Za-z]?\d{1,6})$/i.test(withoutLabel)) {
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
  const record = asRecord(raw);
  const biblio = asRecord(record?.biblio);
  const container = asRecord(record?.container);
  const attributes = asRecord(record?.attributes);
  const attributesContainer = asRecord(attributes?.container);
  const sources = [record, biblio, container, attributes, attributesContainer].filter(
    (source): source is Record<string, unknown> => Boolean(source),
  );
  const firstPage = firstDirectString(sources, pageStartKeys);
  const lastPage = firstDirectString(sources, pageEndKeys);
  const directPages = firstDirectString(sources, pageKeys);
  const directArticleNumber = firstDirectString(sources, articleNumberKeys);
  const joinedPages = joinPages(firstPage, lastPage);
  const firstPageArticleNumber = !lastPage ? normalizeArticleNumber(firstPage) : null;
  const normalizedJoinedPages = joinedPages && !firstPageArticleNumber
    ? normalizePages(joinedPages, { allowSinglePage: Boolean(firstPage && !lastPage) })
    : null;
  const normalizedDirectPages = normalizePages(directPages, { allowSinglePage: true });
  const normalizedPages = normalizedJoinedPages ?? (!firstPageArticleNumber ? normalizedDirectPages : null);
  const normalizedArticle =
    normalizeArticleNumber(directArticleNumber) ??
    firstPageArticleNumber ??
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
    pages: normalizePages(reference.pages, { allowSinglePage: true }) ?? metadata.pages,
    articleNumber:
      normalizeArticleNumber(reference.articleNumber) ??
      metadata.articleNumber ??
      (!normalizePages(reference.pages, { allowSinglePage: true }) ? normalizeArticleNumber(reference.pages) : null),
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

function firstDirectString(
  records: Array<Record<string, unknown>>,
  keys: string[],
): string | null {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (keySet.has(key.toLowerCase())) {
        const normalized = normalizeString(value);
        if (normalized) return normalized;
      }
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
