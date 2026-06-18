export type ExtractTitleCandidatesInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
};

export type BibliographicClues = {
  titleCandidates: string[];
  authorCandidates: string[];
  yearCandidates: string[];
  sourceTitleCandidates: string[];
  warnings: string[];
};

const fileNameExtensionPattern = /\.[^.\\/]+$/;
const yearPattern = /\b(?:19|20)\d{2}\b/g;
const frontMatterBoundaryPattern =
  /^(?:摘要|关键词|关键字)(?:\s|$|[:：])|^(?:abstract|keywords?|introduction|1\s+introduction)\b/i;

export function extractTitleCandidates(
  input: ExtractTitleCandidatesInput,
): string[] {
  return extractBibliographicClues(input).titleCandidates;
}

export function extractBibliographicClues(
  input: ExtractTitleCandidatesInput,
): BibliographicClues {
  const warnings: string[] = [];
  const frontText = normalizeText(input.firstPagesText);
  const safeFrontText = truncateBeforeReferenceList(frontText);
  const lines = getCandidateLines(safeFrontText);
  const titleCandidates = buildTitleCandidates(lines);
  const authorCandidates = extractAuthorCandidates(lines, titleCandidates[0]);
  const yearCandidates = extractYearCandidates(safeFrontText);
  const sourceTitleCandidates = extractSourceTitleCandidates(lines, titleCandidates[0]);

  if (titleCandidates.length === 0) {
    const fileNameTitle = cleanTitle(stripFileExtension(input.fileName));
    if (fileNameTitle) {
      titleCandidates.push(fileNameTitle);
      warnings.push("题名可能来自文件名，建议人工核对。");
    } else {
      warnings.push("未能从文档前部提取可靠题名候选。");
    }
  }

  if (authorCandidates.length === 0) {
    warnings.push("未能从文档前部提取可靠作者线索。");
  }

  if (yearCandidates.length === 0) {
    warnings.push("未能从文档前部提取可靠年份线索。");
  }

  return {
    titleCandidates: uniqueStrings(titleCandidates).slice(0, 5),
    authorCandidates: uniqueStrings(authorCandidates).slice(0, 12),
    yearCandidates: uniqueStrings(yearCandidates).slice(0, 5),
    sourceTitleCandidates: uniqueStrings(sourceTitleCandidates).slice(0, 6),
    warnings,
  };
}

export function normalizeTitleForMatch(value: string): string {
  return normalizeComparableText(value)
    .replace(/\b(the|a|an|of|and|for|in|on|to|with|from|by|using|based)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonNameForMatch(value: string): string {
  return normalizeComparableText(value)
    .replace(/\b(and|et|al)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTitleCandidates(lines: string[]): string[] {
  const boundaryIndex = findFirstLineIndex(lines, frontMatterBoundaryPattern);
  const searchLines = lines.slice(
    0,
    boundaryIndex > 0 ? boundaryIndex : Math.min(lines.length, 30),
  );
  const candidates: string[] = [];

  for (let index = 0; index < searchLines.length; index += 1) {
    for (const span of [1, 2, 3]) {
      const spanLines = searchLines.slice(index, index + span);
      if (
        span > 1 &&
        spanLines.slice(1).some((line) =>
          frontMatterBoundaryPattern.test(line) || looksLikeAuthorClue(line),
        )
      ) {
        continue;
      }

      const candidate = cleanTitle(spanLines.join(" "));
      if (looksLikeTitleCandidate(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((first, second) => {
    const firstScore = titleCandidateScore(first);
    const secondScore = titleCandidateScore(second);
    return secondScore - firstScore;
  });
}

function extractAuthorCandidates(lines: string[], title?: string): string[] {
  const titleIndex = findTitleLineIndex(lines, title);
  const startIndex = titleIndex >= 0 ? titleIndex + 1 : 0;
  const boundaryIndex = findFirstLineIndex(
    lines.slice(startIndex),
    frontMatterBoundaryPattern,
  );
  const endIndex =
    boundaryIndex >= 0
      ? startIndex + boundaryIndex
      : Math.min(lines.length, startIndex + 12);

  return lines
    .slice(startIndex, endIndex)
    .map(cleanAuthorLine)
    .filter(looksLikeAuthorClue)
    .flatMap(splitAuthorClue)
    .filter(Boolean);
}

function extractYearCandidates(text: string): string[] {
  return Array.from(text.matchAll(yearPattern))
    .map((match) => match[0])
    .filter((year) => {
      const value = Number(year);
      return value >= 1900 && value <= 2035;
    });
}

function extractSourceTitleCandidates(lines: string[], title?: string): string[] {
  const titleIndex = findTitleLineIndex(lines, title);
  const nearbyLines =
    titleIndex >= 0
      ? lines.slice(Math.max(0, titleIndex - 8), Math.min(lines.length, titleIndex + 12))
      : lines.slice(0, 20);

  return nearbyLines
    .map(cleanSourceTitle)
    .filter((line) => line && line !== title)
    .filter(looksLikeSourceTitleClue);
}

function getCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !looksLikeLineNoise(line));
}

function looksLikeLineNoise(value: string): boolean {
  return (
    value.length > 260 ||
    /https?:\/\/|www\.|@|doi\s*:?\s*10\./i.test(value) ||
    /copyright|creative commons|license|all rights reserved/i.test(value) ||
    /received|accepted|revised|available online|funding|foundation|grant|收稿|修回|基金|资助|通讯作者|邮箱/i.test(
      value,
    ) ||
    /^(page\s*)?\d+$/.test(value)
  );
}

function looksLikeTitleCandidate(value: string): boolean {
  if (!value || value.length < 8 || value.length > 220) {
    return false;
  }

  if (
    frontMatterBoundaryPattern.test(value) ||
    /摘要|关键词|关键字|abstract|keywords?|introduction/i.test(value) ||
    looksLikeLineNoise(value) ||
    looksLikeAffiliation(value) ||
    looksLikeSourceTitleClue(value) ||
    looksLikeAuthorClue(value) ||
    /\b(?:vol\.?|volume|no\.?|issue)\s*\d+/i.test(value) ||
    /第\s*\d+\s*卷|第\s*\d+\s*期/.test(value) ||
    /\((?:19|20)\d{2}\)\s*\d{1,4}\s*[:：]/.test(value)
  ) {
    return false;
  }

  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  if (chineseCount >= 8) {
    return true;
  }

  const words = value.split(/\s+/).filter(Boolean);
  return (
    words.length >= 4 &&
    words.length <= 32 &&
    /[A-Za-z]{3,}/.test(value) &&
    !/[.;]$/.test(value)
  );
}

function titleCandidateScore(value: string): number {
  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = value.split(/\s+/).filter(Boolean).length;
  let score = 0;

  if (chineseCount >= 8 || words >= 4) {
    score += 2;
  }

  if (value.length >= 20 && value.length <= 150) {
    score += 2;
  }

  if (/[。.!?？]$/.test(value)) {
    score -= 1;
  }

  if (/\b(review|analysis|assessment|study|model|framework|effect|impact)\b/i.test(value)) {
    score += 1;
  }

  return score;
}

function looksLikeAuthorClue(value: string): boolean {
  if (
    !value ||
    value.length > 180 ||
    looksLikeAffiliation(value) ||
    looksLikeSourceTitleClue(value) ||
    looksLikeLineNoise(value) ||
    /\b(abstract|keywords?|introduction|corresponding author)\b/i.test(value)
  ) {
    return false;
  }

  const zhParts = value
    .replace(/[\d*†‡§|\u00b9\u00b2\u00b3]+/g, "")
    .split(/[，,、；;\s]+/)
    .filter(Boolean);
  if (
    zhParts.length > 0 &&
    zhParts.length <= 10 &&
    zhParts.every((part) => /^[\u3400-\u9fff·]{2,5}$/.test(part))
  ) {
    return true;
  }

  const westernNames = splitWesternNames(value);
  return westernNames.length > 0 && westernNames.length <= 12;
}

function splitAuthorClue(value: string): string[] {
  const zhParts = value
    .replace(/[\d*†‡§|\u00b9\u00b2\u00b3]+/g, "")
    .split(/[，,、；;\s]+/)
    .map(cleanToken)
    .filter((part) => /^[\u3400-\u9fff·]{2,5}$/.test(part));

  if (zhParts.length > 0) {
    return zhParts;
  }

  return splitWesternNames(value);
}

function splitWesternNames(value: string): string[] {
  const cleaned = cleanAuthorLine(value)
    .replace(/\bet\s+al\.?/gi, "")
    .replace(/\band\b/gi, ",")
    .replace(/&/g, ",");

  const commaParts = cleaned
    .split(/\s*,\s*/)
    .map(cleanToken)
    .filter(Boolean);
  if (
    commaParts.length > 1 &&
    commaParts.length <= 12 &&
    commaParts.every(looksLikeWesternNamePart)
  ) {
    return commaParts;
  }

  const apaNames = Array.from(
    cleaned.matchAll(/\b([A-Z][A-Za-z'’-]+,\s*(?:[A-Z]\.?\s*){1,4})\b/g),
  ).map((match) => cleanToken(match[1]));

  if (apaNames.length > 0) {
    return apaNames;
  }

  const westernNamePattern =
    /\b((?:[A-Z]\.|[A-Z][A-Za-z'’-]+)(?:\s+(?:[A-Z]\.|[A-Z][A-Za-z'’-]+)){1,4})\b/g;

  return Array.from(cleaned.matchAll(westernNamePattern))
    .map((match) => cleanToken(match[1]))
    .filter((name) => {
      const tokens = name.split(/\s+/).filter(Boolean);
      return (
        tokens.length >= 2 &&
        tokens.length <= 5 &&
        !/\b(Abstract|Article|Building|Carbon|China|Journal|Review|Science|University)\b/i.test(
          name,
        )
      );
    });
}

function looksLikeWesternNamePart(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);
  return (
    tokens.length >= 2 &&
    tokens.length <= 5 &&
    tokens.every((token) => /^(?:[A-Z]\.?|[A-Z][A-Za-z'’-]+)$/.test(token)) &&
    !/\b(Abstract|Article|Building|Carbon|China|Journal|Review|Science|University)\b/i.test(
      value,
    )
  );
}

function looksLikeSourceTitleClue(value: string): boolean {
  const cleaned = cleanSourceTitle(value);
  if (
    cleaned.length < 4 ||
    cleaned.length > 120 ||
    looksLikeAffiliation(cleaned)
  ) {
    return false;
  }

  if (
    /\b(journal|letters|transactions|frontiers|proceedings|bulletin)\b/i.test(
      cleaned,
    ) ||
    /学报|期刊|杂志/.test(cleaned)
  ) {
    return true;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= 5 &&
    /\b(review|science|engineering|energy|environment|sustainability|buildings)\b/i.test(
      cleaned,
    )
  );
}

function looksLikeAffiliation(value: string): boolean {
  return /大学|学院|研究院|实验室|中心|Department|University|Institute|College|School|Laboratory|Faculty|Ministry/i.test(
    value,
  );
}

function findTitleLineIndex(lines: string[], title?: string): number {
  if (!title) {
    return -1;
  }

  const normalizedTitle = normalizeTitleForMatch(title);
  return lines.findIndex((line) => {
    const normalizedLine = normalizeTitleForMatch(line);
    return (
      normalizedLine === normalizedTitle ||
      normalizedTitle.includes(normalizedLine) ||
      normalizedLine.includes(normalizedTitle)
    );
  });
}

function findFirstLineIndex(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateBeforeReferenceList(text: string): string {
  const match = text.match(/\n\s*(参考文献|references|bibliography)\s*\n/i);
  return match?.index ? text.slice(0, match.index) : text;
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(fileNameExtensionPattern, "").trim();
}

function cleanTitle(value: string): string {
  return cleanToken(
    value
      .replace(/^#+\s*/, "")
      .replace(/[{}]/g, "")
      .replace(/\\[a-z]+\*?(?:\[[^\]]*])?/gi, "")
      .replace(/\s+/g, " "),
  );
}

function cleanAuthorLine(value: string): string {
  return cleanToken(
    value
      .replace(/\S+@\S+/g, " ")
      .replace(/\b(?:orcid|corresponding author|correspondence|email|e-mail)\b.*$/i, " ")
      .replace(/\([^)]*(?:university|institute|department|email|大学|学院|研究院)[^)]*\)/gi, "")
      .replace(/[*†‡§|\u00b9\u00b2\u00b3]+/g, " ")
      .replace(/\s+/g, " "),
  );
}

function cleanSourceTitle(value: string): string {
  return cleanToken(value.replace(/^\W+|\W+$/g, ""));
}

function cleanToken(value: string): string {
  return value.replace(/^[\s,，。、；;:：]+|[\s,，。、；;:：]+$/g, "").trim();
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanToken(value);
    const key = normalizeComparableText(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}
