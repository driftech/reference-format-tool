import "server-only";

import type { MetadataCandidate } from "../referenceTypes";
import {
  mapCrossrefWorkToCandidate,
  mapOpenAlexWorkToCandidate,
  type CrossrefWork,
  type OpenAlexWork,
} from "./metadataMapping";

export type SearchMetadataByTitleQuery = {
  title: string;
  authors?: string[];
  year?: string;
};

const CROSSREF_WORKS_ENDPOINT = "https://api.crossref.org/works";
const OPENALEX_WORKS_ENDPOINT = "https://api.openalex.org/works";
const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_ROWS = 5;

type CrossrefSearchResponse = {
  message?: {
    items?: CrossrefWork[];
  };
};

type OpenAlexSearchResponse = {
  results?: OpenAlexWork[];
};

export async function searchMetadataByTitle(
  query: SearchMetadataByTitleQuery,
): Promise<MetadataCandidate[]> {
  const title = query.title.trim();

  if (!title) {
    return [];
  }

  const [crossrefCandidates, openAlexCandidates] = await Promise.all([
    searchCrossrefByTitle(query),
    searchOpenAlexByTitle(query),
  ]);

  return dedupeCandidates([...crossrefCandidates, ...openAlexCandidates]);
}

async function searchCrossrefByTitle(
  query: SearchMetadataByTitleQuery,
): Promise<MetadataCandidate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const url = new URL(CROSSREF_WORKS_ENDPOINT);
    url.searchParams.set("query.bibliographic", buildCrossrefBibliographicQuery(query));
    url.searchParams.set("rows", String(SEARCH_ROWS));

    if (query.authors?.[0]) {
      url.searchParams.set("query.author", query.authors[0]);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "reference-format-tool/0.1 (mailto:anonymous@example.com)",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as CrossrefSearchResponse;
    return (payload.message?.items ?? [])
      .map((work) => mapCrossrefWorkToCandidate(work, `title:${query.title}`))
      .map((candidate) => markTitleCandidate(candidate, 0.65));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchOpenAlexByTitle(
  query: SearchMetadataByTitleQuery,
): Promise<MetadataCandidate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const url = new URL(OPENALEX_WORKS_ENDPOINT);
    url.searchParams.set("search", query.title);
    url.searchParams.set("per-page", String(SEARCH_ROWS));

    const apiKey = process.env.OPENALEX_API_KEY;
    if (apiKey) {
      url.searchParams.set("api_key", apiKey);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as OpenAlexSearchResponse;
    return (payload.results ?? [])
      .map((work) => mapOpenAlexWorkToCandidate(work, `title:${query.title}`))
      .map((candidate) => markTitleCandidate(candidate, 0.6));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildCrossrefBibliographicQuery(
  query: SearchMetadataByTitleQuery,
): string {
  return [query.title, query.authors?.[0], query.year].filter(Boolean).join(" ");
}

function markTitleCandidate(
  candidate: MetadataCandidate,
  initialConfidence: number,
): MetadataCandidate {
  const item = {
    ...candidate.item,
    confidence: initialConfidence,
    matchedBy: "title" as const,
    needsReview: true,
  };

  return {
    ...candidate,
    confidence: initialConfidence,
    matchedBy: "title",
    item,
  };
}

function dedupeCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  const seen = new Set<string>();
  const result: MetadataCandidate[] = [];

  for (const candidate of candidates) {
    const key =
      candidate.item.doi?.toLowerCase() ??
      `${candidate.source}:${normalizeKey(candidate.item.title ?? "")}:${candidate.item.year ?? ""}`;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}
