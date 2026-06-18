import { extractDoiCandidates, pickBestDoi } from "./doiUtils";
import type { ReferenceItem, ReferenceType } from "./referenceTypes";
import { normalizeChineseAcademicText, uniqueStrings } from "./zhTextUtils";

const markerTypeMap: Record<string, ReferenceType> = {
  J: "journal",
  M: "book",
  D: "thesis",
  C: "conference",
  EB: "web",
  "EB/OL": "web",
};

export function parseChineseCitationText(text: string): Partial<ReferenceItem> {
  const normalized = normalizeChineseAcademicText(text)
    .replace(/^\s*\[\d+]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return {};
  }

  const markerMatch = normalized.match(/\[([A-Za-z/]+)]/);
  const type = markerMatch ? markerToType(markerMatch[1]) : inferType(normalized);
  const doi = pickBestDoi(extractDoiCandidates(normalized), normalized) ?? null;

  return type === "book"
    ? parseBookLikeCitation(normalized, type, doi)
    : type === "thesis"
      ? parseBookLikeCitation(normalized, type, doi)
      : type === "conference"
        ? parseConferenceCitation(normalized, doi)
        : type === "web"
          ? parseWebCitation(normalized, doi)
          : parseJournalCitation(normalized, doi);
}

function parseJournalCitation(
  text: string,
  doi: string | null,
): Partial<ReferenceItem> {
  const match = text.match(
    /^(.+?)\.\s*(.+?)\[J]\.\s*(.+?),\s*((?:19|20)\d{2})(?:,\s*([^:：.]+?))?(?:[:：]\s*([A-Za-z]?\d{1,6}\s*[-–—~～]\s*[A-Za-z]?\d{1,6}))?\.?/i,
  );

  if (!match) {
    return parseFallbackCitation(text, doi);
  }

  const volumeIssue = parseVolumeIssue(match[5] ?? "");

  return compactPartial({
    rawText: text,
    type: "journal",
    authors: parseAuthors(match[1]),
    title: match[2],
    sourceTitle: match[3],
    year: match[4],
    volume: volumeIssue.volume,
    issue: volumeIssue.issue,
    pages: normalizePages(match[6] ?? null),
    doi,
    language: "zh",
  });
}

function parseBookLikeCitation(
  text: string,
  type: "book" | "thesis",
  doi: string | null,
): Partial<ReferenceItem> {
  const marker = type === "book" ? "M" : "D";
  const match = text.match(
    new RegExp(
      `^(.+?)\\.\\s*(.+?)\\[${marker}]\\.\\s*(?:(.+?)\\s*[:：]\\s*)?(.+?),\\s*((?:19|20)\\d{2})\\.?`,
      "i",
    ),
  );

  if (!match) {
    return parseFallbackCitation(text, doi);
  }

  return compactPartial({
    rawText: text,
    type,
    authors: parseAuthors(match[1]),
    title: match[2],
    place: match[3] ?? null,
    publisher: match[4],
    year: match[5],
    doi,
    language: "zh",
  });
}

function parseConferenceCitation(
  text: string,
  doi: string | null,
): Partial<ReferenceItem> {
  const match = text.match(
    /^(.+?)\.\s*(.+?)\[C](?:\/\/(.+?))?\.\s*(?:(.+?)\s*[:：]\s*)?(.+?),\s*((?:19|20)\d{2})(?:[:：]\s*([A-Za-z]?\d{1,6}\s*[-–—~～]\s*[A-Za-z]?\d{1,6}))?\.?/i,
  );

  if (!match) {
    return parseFallbackCitation(text, doi);
  }

  return compactPartial({
    rawText: text,
    type: "conference",
    authors: parseAuthors(match[1]),
    title: match[2],
    sourceTitle: match[3] ?? null,
    place: match[4] ?? null,
    publisher: match[5],
    year: match[6],
    pages: normalizePages(match[7] ?? null),
    doi,
    language: "zh",
  });
}

function parseWebCitation(
  text: string,
  doi: string | null,
): Partial<ReferenceItem> {
  const match = text.match(/^(.+?)\.\s*(.+?)\[EB\/OL]\.\s*(?:\(([^)]+)\))?(?:\[[^\]]+])?\.\s*(https?:\/\/\S+)?/i);

  if (!match) {
    return parseFallbackCitation(text, doi);
  }

  return compactPartial({
    rawText: text,
    type: "web",
    authors: parseAuthors(match[1]),
    title: match[2],
    year: match[3]?.match(/(?:19|20)\d{2}/)?.[0] ?? null,
    url: match[4] ?? null,
    doi,
    language: "zh",
  });
}

function parseFallbackCitation(
  text: string,
  doi: string | null,
): Partial<ReferenceItem> {
  const match = text.match(/^(.+?)\.\s*(.+?)(?:\[[A-Za-z/]+])?\.\s*(.*)$/);
  const year = text.match(/(?:19|20)\d{2}/)?.[0] ?? null;

  if (!match) {
    return compactPartial({
      rawText: text,
      doi,
      year,
      language: "zh",
    });
  }

  return compactPartial({
    rawText: text,
    type: inferType(text),
    authors: parseAuthors(match[1]),
    title: match[2],
    year,
    doi,
    language: "zh",
  });
}

function markerToType(marker: string): ReferenceType {
  const normalized = marker.toUpperCase();
  return markerTypeMap[normalized] ?? "unknown";
}

function inferType(text: string): ReferenceType {
  if (/\[M]/i.test(text)) return "book";
  if (/\[D]/i.test(text) || /学位论文|硕士|博士/.test(text)) return "thesis";
  if (/\[C]/i.test(text) || /会议|论文集/.test(text)) return "conference";
  if (/\[EB\/OL]/i.test(text) || /https?:\/\//.test(text)) return "web";
  if (/\[J]/i.test(text)) return "journal";
  return "unknown";
}

function parseAuthors(value: string): string[] {
  return uniqueStrings(
    value
      .replace(/^等\.\s*/, "")
      .split(/[，,、；;]/)
      .flatMap((part) => part.split(/\s+(?=[\u3400-\u9fff]{2,4}(?:\s|$))/))
      .map((author) => author.replace(/\bet\s+al\.?/gi, "").trim())
      .filter(Boolean),
  );
}

function parseVolumeIssue(value: string): {
  volume: string | null;
  issue: string | null;
} {
  const cleaned = value.trim();
  if (!cleaned) {
    return { volume: null, issue: null };
  }

  const volumeIssueMatch = cleaned.match(/^(\d+)\s*\(([^)]+)\)$/);
  if (volumeIssueMatch) {
    return {
      volume: volumeIssueMatch[1],
      issue: volumeIssueMatch[2],
    };
  }

  const issueOnly = cleaned.match(/^(?:第)?\s*(\d+)\s*期$/);
  if (issueOnly) {
    return { volume: null, issue: issueOnly[1] };
  }

  return { volume: cleaned, issue: null };
}

function normalizePages(value: string | null): string | null {
  return value?.replace(/[–—~～]/g, "-").replace(/\s+/g, "") ?? null;
}

function compactPartial(value: Partial<ReferenceItem>): Partial<ReferenceItem> {
  const result: Partial<ReferenceItem> = {};

  for (const [key, fieldValue] of Object.entries(value) as Array<
    [keyof ReferenceItem, unknown]
  >) {
    if (Array.isArray(fieldValue)) {
      if (fieldValue.length > 0) {
        Object.assign(result, { [key]: fieldValue });
      }
      continue;
    }

    if (fieldValue !== null && fieldValue !== undefined && fieldValue !== "") {
      Object.assign(result, { [key]: fieldValue });
    }
  }

  return result;
}
