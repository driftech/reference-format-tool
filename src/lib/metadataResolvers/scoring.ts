import type { ReferenceItem, MetadataSource } from "../referenceTypes";
import {
  normalizePersonNameForMatch,
  normalizeTitleForMatch,
} from "../titleUtils";

export type ScoreMetadataCandidateInput = {
  candidate: ReferenceItem;
  extracted: {
    titleCandidates: string[];
    authorCandidates?: string[];
    yearCandidates?: string[];
    sourceTitleCandidates?: string[];
  };
};

export function scoreMetadataCandidate(
  input: ScoreMetadataCandidateInput,
): number {
  const candidate = input.candidate;
  const extracted = input.extracted;
  const titleScore = bestTextSimilarity(
    candidate.title ?? "",
    extracted.titleCandidates,
    "title",
  );
  const authorScore = scoreAuthorMatch(
    candidate.authors,
    extracted.authorCandidates ?? [],
  );
  const yearScore =
    candidate.year && extracted.yearCandidates?.includes(candidate.year) ? 1 : 0;
  const sourceScore = bestTextSimilarity(
    candidate.sourceTitle ?? "",
    extracted.sourceTitleCandidates ?? [],
    "source",
  );
  const trustScore = sourceTrustScore(candidate.metadataSource);

  const score =
    titleScore * 0.5 +
    authorScore * 0.2 +
    yearScore * 0.1 +
    sourceScore * 0.1 +
    trustScore * 0.1;

  return clampScore(score);
}

export function titleSimilarity(first: string, second: string): number {
  const normalizedFirst = normalizeTitleForMatch(first);
  const normalizedSecond = normalizeTitleForMatch(second);

  if (!normalizedFirst || !normalizedSecond) {
    return 0;
  }

  if (normalizedFirst === normalizedSecond) {
    return 1;
  }

  const shorter = normalizedFirst.length < normalizedSecond.length
    ? normalizedFirst
    : normalizedSecond;
  const longer = normalizedFirst.length < normalizedSecond.length
    ? normalizedSecond
    : normalizedFirst;

  if (shorter.length >= 12 && longer.includes(shorter)) {
    return Math.min(0.92, shorter.length / longer.length + 0.25);
  }

  return Math.max(
    tokenJaccardSimilarity(normalizedFirst, normalizedSecond),
    diceCoefficient(normalizedFirst, normalizedSecond),
  );
}

function bestTextSimilarity(
  candidateValue: string,
  extractedValues: string[],
  mode: "title" | "source",
): number {
  if (!candidateValue || extractedValues.length === 0) {
    return 0;
  }

  return Math.max(
    ...extractedValues.map((value) =>
      mode === "title"
        ? titleSimilarity(candidateValue, value)
        : sourceSimilarity(candidateValue, value),
    ),
  );
}

function sourceSimilarity(first: string, second: string): number {
  const normalizedFirst = normalizeTitleForMatch(first);
  const normalizedSecond = normalizeTitleForMatch(second);

  if (!normalizedFirst || !normalizedSecond) {
    return 0;
  }

  if (normalizedFirst === normalizedSecond) {
    return 1;
  }

  if (normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst)) {
    return 0.85;
  }

  return tokenJaccardSimilarity(normalizedFirst, normalizedSecond);
}

function scoreAuthorMatch(
  candidateAuthors: string[],
  extractedAuthors: string[],
): number {
  if (candidateAuthors.length === 0 || extractedAuthors.length === 0) {
    return 0;
  }

  const normalizedExtracted = extractedAuthors
    .map(normalizeAuthorForMatch)
    .filter(Boolean);
  const normalizedCandidates = candidateAuthors
    .map(normalizeAuthorForMatch)
    .filter(Boolean);

  if (normalizedCandidates.length === 0 || normalizedExtracted.length === 0) {
    return 0;
  }

  const firstCandidate = normalizedCandidates[0];
  const firstExtracted = normalizedExtracted[0];

  if (authorTokensOverlap(firstCandidate, firstExtracted)) {
    return 1;
  }

  const matchedCount = normalizedCandidates.filter((candidate) =>
    normalizedExtracted.some((extracted) => authorTokensOverlap(candidate, extracted)),
  ).length;

  return Math.min(1, matchedCount / Math.min(3, normalizedCandidates.length));
}

function normalizeAuthorForMatch(value: string): string {
  const normalized = normalizePersonNameForMatch(value);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2 && value.includes(",")) {
    return tokens.join(" ");
  }

  return normalized;
}

function authorTokensOverlap(first: string, second: string): boolean {
  const firstTokens = first.split(/\s+/).filter(Boolean);
  const secondTokens = second.split(/\s+/).filter(Boolean);

  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return false;
  }

  const firstSurname = extractLikelySurname(first);
  const secondSurname = extractLikelySurname(second);
  if (firstSurname && secondSurname && firstSurname === secondSurname) {
    return true;
  }

  const firstLastToken = firstTokens[firstTokens.length - 1];
  const secondLastToken = secondTokens[secondTokens.length - 1];
  const directMatch =
    first.includes(second) ||
    second.includes(first) ||
    firstLastToken === secondLastToken;

  if (directMatch) {
    return true;
  }

  const firstSet = new Set(firstTokens);
  const overlapCount = secondTokens.filter((token) => firstSet.has(token)).length;

  return overlapCount >= Math.min(2, Math.min(firstTokens.length, secondTokens.length));
}

function extractLikelySurname(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return "";
  }

  const commaSeparated = value.includes(",");
  if (commaSeparated) {
    return tokens[0];
  }

  const lastToken = tokens[tokens.length - 1];
  if (tokens.length >= 2 && lastToken.length <= 2 && tokens[0].length > 2) {
    return tokens[0];
  }

  return tokens[tokens.length - 1];
}

function sourceTrustScore(source: MetadataSource | undefined): number {
  if (source === "crossref") {
    return 1;
  }

  if (source === "datacite") {
    return 0.9;
  }

  if (source === "openalex") {
    return 0.85;
  }

  if (source === "pdf") {
    return 0.45;
  }

  if (source === "manual") {
    return 0.8;
  }

  return 0.3;
}

function tokenJaccardSimilarity(first: string, second: string): number {
  const firstTokens = new Set(first.split(/\s+/).filter(Boolean));
  const secondTokens = new Set(second.split(/\s+/).filter(Boolean));

  if (firstTokens.size === 0 || secondTokens.size === 0) {
    return 0;
  }

  const intersection = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  const union = new Set([...firstTokens, ...secondTokens]).size;

  return intersection / union;
}

function diceCoefficient(first: string, second: string): number {
  const firstBigrams = buildBigrams(first);
  const secondBigrams = buildBigrams(second);

  if (firstBigrams.length === 0 || secondBigrams.length === 0) {
    return 0;
  }

  const secondCounts = new Map<string, number>();
  for (const bigram of secondBigrams) {
    secondCounts.set(bigram, (secondCounts.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const bigram of firstBigrams) {
    const count = secondCounts.get(bigram) ?? 0;
    if (count > 0) {
      intersection += 1;
      secondCounts.set(bigram, count - 1);
    }
  }

  return (2 * intersection) / (firstBigrams.length + secondBigrams.length);
}

function buildBigrams(value: string): string[] {
  const compact = value.replace(/\s+/g, "");
  const bigrams: string[] = [];

  for (let index = 0; index < compact.length - 1; index += 1) {
    bigrams.push(compact.slice(index, index + 2));
  }

  return bigrams;
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}
