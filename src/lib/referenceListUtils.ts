import type { ReferenceItem } from "./referenceTypes";

export type ReferenceSortMode =
  | "upload"
  | "author"
  | "year_asc"
  | "year_desc"
  | "title";

export type DuplicateReferenceGroupsResult = {
  duplicateGroups: ReferenceItem[][];
  warnings: string[];
};

export function sortReferenceItems(
  items: ReferenceItem[],
  mode: ReferenceSortMode,
): ReferenceItem[] {
  const indexed = items.map((item, index) => ({ item, index }));

  if (mode === "upload") {
    return items;
  }

  return indexed
    .sort((left, right) => {
      if (mode === "author") {
        return compareText(firstAuthor(left.item), firstAuthor(right.item), left.index, right.index);
      }

      if (mode === "year_asc" || mode === "year_desc") {
        const leftYear = Number(left.item.year ?? Number.POSITIVE_INFINITY);
        const rightYear = Number(right.item.year ?? Number.POSITIVE_INFINITY);
        const result = leftYear === rightYear ? left.index - right.index : leftYear - rightYear;
        return mode === "year_desc" ? -result : result;
      }

      return compareText(left.item.title ?? "", right.item.title ?? "", left.index, right.index);
    })
    .map(({ item }) => item);
}

export function detectDuplicateReferenceGroups(
  items: ReferenceItem[],
): DuplicateReferenceGroupsResult {
  const warnings: string[] = [];
  const duplicateGroups: ReferenceItem[][] = [];
  const usedIds = new Set<string>();
  const byDoi = new Map<string, ReferenceItem[]>();

  for (const item of items) {
    const doi = item.doi?.trim().toLowerCase();
    if (doi) {
      byDoi.set(doi, [...(byDoi.get(doi) ?? []), item]);
    }
  }

  for (const [doi, group] of byDoi.entries()) {
    if (group.length > 1) {
      duplicateGroups.push(group);
      group.forEach((item) => usedIds.add(item.id));
      warnings.push(`检测到 DOI 相同的重复文献：${doi}`);
    }
  }

  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    const left = items[leftIndex];
    if (usedIds.has(left.id) || !left.title) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const right = items[rightIndex];
      if (usedIds.has(right.id) || !right.title) {
        continue;
      }

      const similarity = titleSimilarity(left.title, right.title);
      if (similarity < 0.88) {
        continue;
      }

      duplicateGroups.push([left, right]);
      usedIds.add(left.id);
      usedIds.add(right.id);
      warnings.push(
        left.year && right.year && left.year !== right.year
          ? "检测到题名高度相似但年份不同的疑似重复文献，请人工确认。"
          : "检测到题名高度相似的疑似重复文献。",
      );
    }
  }

  return { duplicateGroups, warnings };
}

function compareText(
  left: string,
  right: string,
  leftIndex: number,
  rightIndex: number,
): number {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  const result = normalizedLeft.localeCompare(normalizedRight, "zh-Hans-CN");
  return result === 0 ? leftIndex - rightIndex : result;
}

function firstAuthor(item: ReferenceItem): string {
  return item.authors[0] ?? "";
}

function titleSimilarity(first: string, second: string): number {
  const left = normalizeText(first);
  const right = normalizeText(second);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const rightCounts = new Map<string, number>();
  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;
    if (count > 0) {
      intersection += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * intersection) / Math.max(1, leftBigrams.length + rightBigrams.length);
}

function bigrams(value: string): string[] {
  const chars = Array.from(value);
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}
