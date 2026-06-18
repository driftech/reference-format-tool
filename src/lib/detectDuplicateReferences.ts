import type { ReferenceItem } from "./referenceTypes";

export type DuplicateReferenceLevel = "high" | "suspected" | "possible";

export type DuplicateReferenceResult = {
  referenceIds: string[];
  level: DuplicateReferenceLevel;
  message: string;
  reason: string;
};

export function detectDuplicateReferences(
  referenceItems: ReferenceItem[],
): DuplicateReferenceResult[] {
  const results: DuplicateReferenceResult[] = [];
  const pairedReferenceIds = new Set<string>();

  results.push(...detectDoiDuplicates(referenceItems, pairedReferenceIds));
  results.push(...detectTitleDuplicates(referenceItems, pairedReferenceIds));
  results.push(...detectFileNameDuplicates(referenceItems, pairedReferenceIds));

  return results;
}

function detectDoiDuplicates(
  referenceItems: ReferenceItem[],
  pairedReferenceIds: Set<string>,
): DuplicateReferenceResult[] {
  const byDoi = new Map<string, ReferenceItem[]>();

  for (const reference of referenceItems) {
    const doi = normalizeText(reference.doi ?? "");

    if (!doi) {
      continue;
    }

    byDoi.set(doi, [...(byDoi.get(doi) ?? []), reference]);
  }

  return Array.from(byDoi.entries())
    .filter(([, references]) => references.length > 1)
    .map(([doi, references]) => {
      for (const reference of references) {
        pairedReferenceIds.add(reference.id);
      }

      return {
        referenceIds: references.map((reference) => reference.id),
        level: "high",
        reason: `DOI 完全相同：${doi}`,
        message: "检测到 DOI 完全相同的文献，可能是重复上传。",
      };
    });
}

function detectTitleDuplicates(
  referenceItems: ReferenceItem[],
  pairedReferenceIds: Set<string>,
): DuplicateReferenceResult[] {
  const results: DuplicateReferenceResult[] = [];

  for (let leftIndex = 0; leftIndex < referenceItems.length; leftIndex += 1) {
    const left = referenceItems[leftIndex];
    const leftTitle = normalizeTitle(left.title ?? "");

    if (leftTitle.length < 8) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < referenceItems.length; rightIndex += 1) {
      const right = referenceItems[rightIndex];

      if (pairedReferenceIds.has(left.id) || pairedReferenceIds.has(right.id)) {
        continue;
      }

      const rightTitle = normalizeTitle(right.title ?? "");

      if (rightTitle.length < 8) {
        continue;
      }

      const similarity = diceSimilarity(leftTitle, rightTitle);

      if (similarity >= 0.88) {
        pairedReferenceIds.add(left.id);
        pairedReferenceIds.add(right.id);
        results.push({
          referenceIds: [left.id, right.id],
          level: "suspected",
          reason: `题名相似度 ${Math.round(similarity * 100)}%`,
          message: "检测到题名高度相似的文献，建议确认是否重复。",
        });
      }
    }
  }

  return results;
}

function detectFileNameDuplicates(
  referenceItems: ReferenceItem[],
  pairedReferenceIds: Set<string>,
): DuplicateReferenceResult[] {
  const results: DuplicateReferenceResult[] = [];
  const candidates = referenceItems.filter(
    (reference) => !reference.title && reference.sourceFileName,
  );

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    const leftName = normalizeTitle(left.sourceFileName ?? "");

    if (leftName.length < 6) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];

      if (pairedReferenceIds.has(left.id) || pairedReferenceIds.has(right.id)) {
        continue;
      }

      const rightName = normalizeTitle(right.sourceFileName ?? "");

      if (rightName.length < 6) {
        continue;
      }

      const similarity = diceSimilarity(leftName, rightName);

      if (similarity >= 0.82) {
        pairedReferenceIds.add(left.id);
        pairedReferenceIds.add(right.id);
        results.push({
          referenceIds: [left.id, right.id],
          level: "possible",
          reason: `文件名相似度 ${Math.round(similarity * 100)}%`,
          message: "题名缺失且文件名相似，可能是重复文件。",
        });
      }
    }
  }

  return results;
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

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

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function getBigrams(value: string): string[] {
  const chars = Array.from(value);

  if (chars.length < 2) {
    return chars;
  }

  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
}

function normalizeTitle(value: string): string {
  return normalizeText(value)
    .replace(/\.[^.]+$/g, "")
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "");
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
