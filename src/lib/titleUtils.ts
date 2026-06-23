export type ExtractTitleCandidatesInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
  pdfMetadataText?: string;
};

export type BibliographicClues = {
  titleCandidates: string[];
  authorCandidates: string[];
  yearCandidates: string[];
  sourceTitleCandidates: string[];
  warnings: string[];
  isLikelyPrintedPdf: boolean;
};

export type PrintedPdfDetectionInput = {
  firstPagesText: string;
  fullText?: string;
  pdfMetadataText?: string;
  hasDoi?: boolean;
};

const fileNameExtensionPattern = /\.[^.\\/]+$/;
const yearPattern = /\b(?:19|20)\d{2}\b/g;
const frontMatterBoundaryPattern =
  /^(?:abstract|article\s+info|keywords?|introduction|1\s+introduction|\u6458\u8981|\u5173\u952e\u8bcd)(?:\s|$|[:\uFF1A])/i;
const printedPdfMetadataPattern = /chrome|skia\/pdf|microsoft\s+print\s+to\s+pdf|adobe\s+pdf|acrobat|print/i;

const noisePatterns = [
  /^contents\s+lists\s+available\s+at\s+sciencedirect$/i,
  /^science\s*direct$/i,
  /^journal\s+homepage/i,
  /^check\s+for\s+updates$/i,
  /^article\s+info$/i,
  /^abstract$/i,
  /^keywords?$/i,
  /^elsevier$/i,
  /^available\s+online\b/i,
  /^received\b/i,
  /^revised\b/i,
  /^accepted\b/i,
  /^www\./i,
  /^https?:\/\//i,
  /creative\s+commons|all\s+rights\s+reserved|copyright/i,
  /journal\s+homepage\s*:/i,
  /\bdoi\s*:?\s*10\./i,
];

const sourceTitlePattern =
  /\b(journal|letters|transactions|frontiers|proceedings|bulletin|construction|energy|buildings|engineering|environment|sustainability|resources|reviews)\b/i;

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
  const safeFrontText = cleanPrintedPdfFrontText(truncateBeforeReferenceList(frontText));
  const lines = getCandidateLines(safeFrontText);
  const titleCandidates = buildTitleCandidates(lines);
  const isLikelyPrintedPdf = detectPrintedPdfRisk({
    firstPagesText: input.firstPagesText,
    fullText: input.fullText,
    pdfMetadataText: input.pdfMetadataText,
  });

  if (titleCandidates.length === 0) {
    const fileNameTitle = cleanTitle(stripFileExtension(input.fileName));
    if (fileNameTitle) {
      titleCandidates.push(fileNameTitle);
      warnings.push("\u9898\u540d\u53ef\u80fd\u6765\u81ea\u6587\u4ef6\u540d\uff0c\u5efa\u8bae\u4eba\u5de5\u6838\u5bf9\u3002");
    } else {
      warnings.push("\u672a\u80fd\u4ece\u6587\u6863\u524d\u90e8\u63d0\u53d6\u53ef\u9760\u9898\u540d\u5019\u9009\u3002");
    }
  }

  const authorCandidates = extractAuthorCandidates(lines, titleCandidates[0]);
  const yearCandidates = extractYearCandidates(safeFrontText);
  const sourceTitleCandidates = extractSourceTitleCandidates(lines, titleCandidates[0]);

  if (authorCandidates.length === 0) {
    warnings.push("\u672a\u80fd\u4ece\u6587\u6863\u524d\u90e8\u63d0\u53d6\u53ef\u9760\u4f5c\u8005\u7ebf\u7d22\u3002");
  }

  if (yearCandidates.length === 0) {
    warnings.push("\u672a\u80fd\u4ece\u6587\u6863\u524d\u90e8\u63d0\u53d6\u53ef\u9760\u5e74\u4efd\u7ebf\u7d22\u3002");
  }

  if (isLikelyPrintedPdf) {
    warnings.push(getPrintedPdfWarning());
  }

  return {
    titleCandidates: uniqueStrings(titleCandidates).slice(0, 6),
    authorCandidates: uniqueStrings(authorCandidates).slice(0, 12),
    yearCandidates: uniqueStrings(yearCandidates).slice(0, 5),
    sourceTitleCandidates: uniqueStrings(sourceTitleCandidates).slice(0, 6),
    warnings,
    isLikelyPrintedPdf,
  };
}

export function detectPrintedPdfRisk(input: PrintedPdfDetectionInput): boolean {
  const metadataText = input.pdfMetadataText ?? "";
  const firstPagesText = normalizeText(input.firstPagesText);
  const normalizedFront = firstPagesText.toLowerCase();
  const fullText = input.fullText ?? firstPagesText;
  const hasDoi = input.hasDoi ?? /\b10\.\d{4,9}\//.test(fullText);
  const noiseHitCount = [
    "contents lists available at sciencedirect",
    "sciencedirect",
    "journal homepage",
    "check for updates",
    "article info",
    "available online",
  ].filter((item) => normalizedFront.includes(item)).length;
  const longLineCount = firstPagesText
    .split("\n")
    .filter((line) => line.trim().length > 180).length;

  return Boolean(
    printedPdfMetadataPattern.test(metadataText) ||
      (!hasDoi && noiseHitCount >= 2) ||
      (!hasDoi && longLineCount >= 3),
  );
}

export function getPrintedPdfWarning(): string {
  return "\u8be5\u6587\u4ef6\u53ef\u80fd\u662f\u6d4f\u89c8\u5668\u6253\u5370\u7248\u3001\u4e8c\u6b21\u5bfc\u51fa\u7248\u6216\u6587\u672c\u5c42\u5f02\u5e38 PDF\u3002\u7cfb\u7edf\u5df2\u5c1d\u8bd5\u57fa\u4e8e\u9996\u9875\u9898\u540d\u8fdb\u884c\u5339\u914d\uff0c\u7ed3\u679c\u8bf7\u4eba\u5de5\u6838\u5bf9\u3002\u5efa\u8bae\u4f18\u5148\u4e0a\u4f20\u671f\u520a\u5b98\u7f51\u6216\u6570\u636e\u5e93\u4e0b\u8f7d\u7684\u539f\u59cb PDF\u3002";
}

export function getManualRecoveryWarning(): string {
  return "\u672a\u80fd\u4ece\u8be5\u6587\u4ef6\u4e2d\u7a33\u5b9a\u8bc6\u522b\u9898\u5f55\u4fe1\u606f\u3002\u8be5\u6587\u4ef6\u53ef\u80fd\u662f\u6d4f\u89c8\u5668\u6253\u5370\u7248\u3001\u626b\u63cf\u7248\u6216\u6587\u672c\u5c42\u5f02\u5e38 PDF\u3002\u8bf7\u4f18\u5148\u4e0a\u4f20\u51fa\u7248\u793e\u539f\u59cb PDF\uff0c\u6216\u624b\u52a8\u8f93\u5165 DOI / \u8bba\u6587\u9898\u540d\u8fdb\u884c\u8865\u5168\u3002";
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
  const searchLines = lines.slice(0, boundaryIndex > 0 ? boundaryIndex : Math.min(lines.length, 35));
  const candidates: string[] = [];

  for (let index = 0; index < searchLines.length; index += 1) {
    for (const span of [1, 2, 3, 4]) {
      const spanLines = searchLines.slice(index, index + span);
      if (spanLines.length < span || spanLines.some(looksLikeLineNoise)) {
        continue;
      }

      if (span > 1 && spanLines.slice(1).some((line) => frontMatterBoundaryPattern.test(line) || looksLikeAuthorClue(line))) {
        continue;
      }

      const candidate = cleanTitle(spanLines.join(" "));
      if (looksLikeTitleCandidate(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((first, second) => titleCandidateScore(second) - titleCandidateScore(first));
}

function extractAuthorCandidates(lines: string[], title?: string): string[] {
  const titleIndex = findTitleLineIndex(lines, title);
  const startIndex = titleIndex >= 0 ? titleIndex + 1 : 0;
  const boundaryIndex = findFirstLineIndex(lines.slice(startIndex), frontMatterBoundaryPattern);
  const endIndex = boundaryIndex >= 0 ? startIndex + boundaryIndex : Math.min(lines.length, startIndex + 10);

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
  const nearbyLines = titleIndex >= 0
    ? lines.slice(Math.max(0, titleIndex - 8), Math.min(lines.length, titleIndex + 12))
    : lines.slice(0, 20);

  return nearbyLines
    .map(cleanSourceTitle)
    .filter((line) => line && line !== title)
    .filter(looksLikeSourceTitleClue);
}

function cleanPrintedPdfFrontText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !looksLikeLineNoise(line))
    .join("\n");
}

function getCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !looksLikeLineNoise(line));
}

function looksLikeLineNoise(value: string): boolean {
  const cleaned = value.trim();
  if (!cleaned) {
    return true;
  }

  return (
    cleaned.length > 260 ||
    noisePatterns.some((pattern) => pattern.test(cleaned)) ||
    /^(page\s*)?\d+$/.test(cleaned) ||
    /^\d{1,4}\s*$/.test(cleaned) ||
    /\b\d{2,4}\s*\(\d{4}\)\s*\d{3,8}\b/.test(cleaned) ||
    /^vol\.?\s*\d+|^volume\s*\d+|^no\.?\s*\d+|^issue\s*\d+/i.test(cleaned) ||
    /@/.test(cleaned)
  );
}

function looksLikeTitleCandidate(value: string): boolean {
  if (!value || value.length < 8 || value.length > 240) {
    return false;
  }

  if (
    frontMatterBoundaryPattern.test(value) ||
    looksLikeLineNoise(value) ||
    looksLikeAffiliation(value) ||
    looksLikeSourceTitleClue(value) ||
    looksLikeAuthorClue(value) ||
    /\b(?:vol\.?|volume|no\.?|issue)\s*\d+/i.test(value) ||
    /\((?:19|20)\d{2}\)\s*\d{1,8}\s*[:\uFF1A]?/.test(value)
  ) {
    return false;
  }

  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  if (chineseCount >= 8) {
    return true;
  }

  const words = value.split(/\s+/).filter(Boolean);
  const latinLetters = value.replace(/[^A-Za-z]/g, "");
  const uppercaseRatio = latinLetters.length > 0 ? (value.match(/[A-Z]/g)?.length ?? 0) / latinLetters.length : 0;

  return (
    words.length >= 4 &&
    words.length <= 34 &&
    value.length >= 24 &&
    /[A-Za-z]{3,}/.test(value) &&
    !/[.;]$/.test(value) &&
    !(uppercaseRatio > 0.85 && words.length <= 4)
  );
}

function titleCandidateScore(value: string): number {
  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = value.split(/\s+/).filter(Boolean).length;
  let score = 0;

  if (chineseCount >= 8 || words >= 4) {
    score += 2;
  }

  if (value.length >= 30 && value.length <= 170) {
    score += 3;
  } else if (value.length >= 20 && value.length <= 220) {
    score += 1;
  }

  if (/\b(review|analysis|assessment|study|model|framework|effect|impact|lifecycle|carbon|building|energy|sustainability)\b/i.test(value)) {
    score += 1;
  }

  if (/[?!:\uFF1A]$/.test(value)) {
    score -= 0.5;
  }

  return score;
}

function looksLikeAuthorClue(value: string): boolean {
  if (!value || value.length > 180 || looksLikeAffiliation(value) || looksLikeSourceTitleClue(value) || looksLikeLineNoise(value) || /\b(abstract|keywords?|introduction|corresponding author|article info)\b/i.test(value)) {
    return false;
  }

  const zhParts = value
    .replace(/[\d*\u2020\u2021\u00a7\u00b9\u00b2\u00b3]+/g, "")
    .split(/[\uFF0C\u3001\uFF1B;\s]+/)
    .filter(Boolean);
  if (zhParts.length > 0 && zhParts.length <= 10 && zhParts.every((part) => /^[\u3400-\u9fff\u00b7]{2,5}$/.test(part))) {
    return true;
  }

  const westernNames = splitWesternNames(value);
  return westernNames.length > 0 && westernNames.length <= 12;
}

function splitAuthorClue(value: string): string[] {
  const zhParts = value
    .replace(/[\d*\u2020\u2021\u00a7\u00b9\u00b2\u00b3]+/g, "")
    .split(/[\uFF0C\u3001\uFF1B;\s]+/)
    .map(cleanToken)
    .filter((part) => /^[\u3400-\u9fff\u00b7]{2,5}$/.test(part));

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

  const apaNames = Array.from(cleaned.matchAll(/\b([A-Z][A-Za-z'\u2019\-]+,\s*(?:[A-Z]\.?(?:\s|$)){1,4})/g)).map((match) => cleanToken(match[1]));
  if (apaNames.length > 0) {
    return apaNames;
  }

  const commaParts = cleaned.split(/\s*,\s*/).map(cleanToken).filter(Boolean);
  if (commaParts.length > 1 && commaParts.length <= 12 && commaParts.every(looksLikeWesternNamePart)) {
    return commaParts;
  }

  const westernNamePattern = /\b((?:[A-Z]\.|[A-Z][A-Za-z'\u2019\-]+)(?:\s+(?:[A-Z]\.|[A-Z][A-Za-z'\u2019\-]+)){1,4})\b/g;
  return Array.from(cleaned.matchAll(westernNamePattern))
    .map((match) => cleanToken(match[1]))
    .filter((name) => {
      const tokens = name.split(/\s+/).filter(Boolean);
      return tokens.length >= 2 && tokens.length <= 5 && !/\b(Abstract|Article|Building|Carbon|China|Journal|Review|Science|University|Department|Elsevier)\b/i.test(name);
    });
}

function looksLikeWesternNamePart(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.length >= 2 && tokens.length <= 5 && tokens.every((token) => /^(?:[A-Z]\.?|[A-Z][A-Za-z'\u2019\-]+)$/.test(token)) && !/\b(Abstract|Article|Building|Carbon|China|Journal|Review|Science|University|Elsevier)\b/i.test(value);
}

function looksLikeSourceTitleClue(value: string): boolean {
  const cleaned = cleanSourceTitle(value);
  if (cleaned.length < 4 || cleaned.length > 120 || looksLikeAffiliation(cleaned)) {
    return false;
  }

  if (/\u5b66\u62a5|\u671f\u520a|\u6742\u5fd7/.test(cleaned)) {
    return true;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 7 && sourceTitlePattern.test(cleaned);
}

function looksLikeAffiliation(value: string): boolean {
  return /\u5927\u5b66|\u5b66\u9662|\u7814\u7a76\u9662|\u5b9e\u9a8c\u5ba4|\u4e2d\u5fc3|Department|University|Institute|College|School|Laboratory|Faculty|Ministry/i.test(value);
}

function findTitleLineIndex(lines: string[], title?: string): number {
  if (!title) {
    return -1;
  }

  const normalizedTitle = normalizeTitleForMatch(title);
  return lines.findIndex((line) => {
    const normalizedLine = normalizeTitleForMatch(line);
    return normalizedLine === normalizedTitle || (normalizedLine.length >= 12 && normalizedTitle.includes(normalizedLine)) || (normalizedTitle.length >= 12 && normalizedLine.includes(normalizedTitle));
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
  const match = text.match(/\n\s*(\u53c2\u8003\u6587\u732e|references|bibliography)\s*\n/i);
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
      .replace(/\s+/g, " ")
      .replace(/[\s,;:\uFF1A\uFF0C\u3002]+$/g, ""),
  );
}

function cleanAuthorLine(value: string): string {
  return cleanToken(
    value
      .replace(/\S+@\S+/g, " ")
      .replace(/\b(?:orcid|corresponding author|correspondence|email|e-mail)\b.*$/i, " ")
      .replace(/\([^)]*(?:university|institute|department|email|\u5927\u5b66|\u5b66\u9662|\u7814\u7a76\u9662)[^)]*\)/gi, "")
      .replace(/[\u2020\u2021\u00a7\u00b9\u00b2\u00b3*]+/g, " ")
      .replace(/\s+/g, " "),
  );
}

function cleanSourceTitle(value: string): string {
  return cleanToken(value.replace(/^\W+|\W+$/g, ""));
}

function cleanToken(value: string): string {
  return value.replace(/^[\s,\uFF0C\u3002\uFF1B;:\uFF1A]+|[\s,\uFF0C\u3002\uFF1B;:\uFF1A]+$/g, "").trim();
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
