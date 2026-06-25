import { extractDoiCandidates } from "./doiUtils";

export type ParsedManualDoiInput = {
  dois: string[];
  invalidLines: string[];
  duplicateCount: number;
};

export function parseManualDoiInput(input: string): ParsedManualDoiInput {
  const seen = new Set<string>();
  const dois: string[] = [];
  const invalidLines: string[] = [];
  let duplicateCount = 0;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const candidates = extractDoiCandidates(line);

    if (candidates.length === 0) {
      invalidLines.push(line);
      continue;
    }

    for (const doi of candidates) {
      const key = doi.toLowerCase();

      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }

      seen.add(key);
      dois.push(doi);
    }
  }

  return {
    dois,
    invalidLines,
    duplicateCount,
  };
}
