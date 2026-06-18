import type { ReferenceItem } from "./referenceTypes";
import { titleSimilarity } from "./metadataResolvers/scoring";
import { normalizeZhComparable } from "./zhTextUtils";

export type ImportedCitationMatch = {
  pdfItemId: string;
  importedItemId: string;
  score: number;
  status: "auto" | "needs_confirm" | "unmatched";
};

export type ImportedCitationMatchResult = {
  matches: ImportedCitationMatch[];
  unmatchedPdfItems: ReferenceItem[];
  unmatchedImportedItems: ReferenceItem[];
};

export function matchImportedCitationsToPdfItems(input: {
  pdfItems: ReferenceItem[];
  importedItems: ReferenceItem[];
}): ImportedCitationMatchResult {
  const matches: ImportedCitationMatch[] = [];
  const usedImportedIds = new Set<string>();

  for (const pdfItem of input.pdfItems) {
    const best = findBestImportedMatch(pdfItem, input.importedItems, usedImportedIds);

    if (!best || best.score < 0.75) {
      continue;
    }

    matches.push({
      pdfItemId: pdfItem.id,
      importedItemId: best.item.id,
      score: best.score,
      status: best.score >= 0.9 ? "auto" : "needs_confirm",
    });
    usedImportedIds.add(best.item.id);
  }

  const matchedPdfIds = new Set(matches.map((match) => match.pdfItemId));

  return {
    matches,
    unmatchedPdfItems: input.pdfItems.filter((item) => !matchedPdfIds.has(item.id)),
    unmatchedImportedItems: input.importedItems.filter(
      (item) => !usedImportedIds.has(item.id),
    ),
  };
}

function findBestImportedMatch(
  pdfItem: ReferenceItem,
  importedItems: ReferenceItem[],
  usedImportedIds: Set<string>,
): { item: ReferenceItem; score: number } | null {
  let best: { item: ReferenceItem; score: number } | null = null;

  for (const importedItem of importedItems) {
    if (usedImportedIds.has(importedItem.id)) {
      continue;
    }

    const score = scorePair(pdfItem, importedItem);
    if (!best || score > best.score) {
      best = { item: importedItem, score };
    }
  }

  return best;
}

function scorePair(pdfItem: ReferenceItem, importedItem: ReferenceItem): number {
  if (
    pdfItem.doi &&
    importedItem.doi &&
    pdfItem.doi.toLowerCase() === importedItem.doi.toLowerCase()
  ) {
    return 1;
  }

  const titleScore = titleSimilarity(pdfItem.title ?? "", importedItem.title ?? "");
  const authorScore = scoreAuthors(pdfItem.authors, importedItem.authors);
  const yearScore =
    pdfItem.year && importedItem.year && pdfItem.year === importedItem.year ? 1 : 0;

  return clampScore(titleScore * 0.7 + authorScore * 0.2 + yearScore * 0.1);
}

function scoreAuthors(first: string[], second: string[]): number {
  if (first.length === 0 || second.length === 0) {
    return 0;
  }

  const firstNormalized = first.map(normalizeZhComparable).filter(Boolean);
  const secondNormalized = second.map(normalizeZhComparable).filter(Boolean);

  if (firstNormalized.length === 0 || secondNormalized.length === 0) {
    return 0;
  }

  if (firstNormalized[0] === secondNormalized[0]) {
    return 1;
  }

  const secondSet = new Set(secondNormalized);
  const matchedCount = firstNormalized.filter((author) => secondSet.has(author)).length;

  return Math.min(1, matchedCount / Math.min(3, firstNormalized.length));
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}
