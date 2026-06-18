import { parseChineseCitationText } from "./parseChineseCitation";
import type { ReferenceItem } from "./referenceTypes";
import { normalizeChineseAcademicText } from "./zhTextUtils";

export function parseChineseBibliographyBatch(text: string): ReferenceItem[] {
  const entries = splitBibliographyEntries(text);

  return entries.map((entry, index) => {
    const parsed = parseChineseCitationText(entry);
    const warnings: string[] = [];
    const hasUsefulField = Boolean(
      parsed.title ||
        parsed.authors?.length ||
        parsed.year ||
        parsed.sourceTitle ||
        parsed.publisher,
    );

    if (!hasUsefulField) {
      warnings.push("未能解析该中文题录，已保留原文，建议人工修改字段。");
    }

    return {
      id: `zh-import-${index + 1}-${hashString(entry)}`,
      rawText: entry,
      type: parsed.type ?? "unknown",
      authors: parsed.authors ?? [],
      year: parsed.year ?? null,
      title: parsed.title ?? null,
      sourceTitle: parsed.sourceTitle ?? null,
      volume: parsed.volume ?? null,
      issue: parsed.issue ?? null,
      pages: parsed.pages ?? null,
      publisher: parsed.publisher ?? null,
      place: parsed.place ?? null,
      doi: parsed.doi ?? null,
      url: parsed.url ?? null,
      accessDate: parsed.accessDate ?? null,
      language: "zh",
      metadataSource: "imported_bibliography",
      matchedBy: hasUsefulField ? "manual" : "none",
      confidence: hasUsefulField ? 0.9 : 0.2,
      needsReview: !hasUsefulField,
      warnings,
    };
  });
}

function splitBibliographyEntries(text: string): string[] {
  const normalized = normalizeChineseAcademicText(text);

  if (!normalized) {
    return [];
  }

  const numbered = normalized
    .replace(/\n\s*(\[\d+]|\d+[.、])\s*/g, "\n@@ENTRY@@$1 ")
    .split("\n@@ENTRY@@")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (numbered.length > 1) {
    return numbered.map((entry) => entry.replace(/^(\[\d+]|\d+[.、])\s*/, "").trim());
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    const startsNewEntry =
      buffer.length > 0 &&
      /^[\u3400-\u9fffA-Za-z].+?\.\s*.+?\[[A-Za-z/]+]/.test(line);

    if (startsNewEntry) {
      entries.push(buffer.join(" ").trim());
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length > 0) {
    entries.push(buffer.join(" ").trim());
  }

  return entries.filter(Boolean);
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
