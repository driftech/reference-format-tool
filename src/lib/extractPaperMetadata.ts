import { extractDoiCandidates, pickBestDoi } from "./doiUtils";
import { extractPagesFromText } from "./pageMetadata";
import type {
  ReferenceItem,
  ReferenceLanguage,
  ReferenceType,
} from "./referenceTypes";

export type ExtractPaperMetadataInput = {
  fileName: string;
  fileType: string;
  fullText: string;
  frontText: string;
  metadataTitle?: string;
};

type VolumeIssuePages = {
  volume: string | null;
  issue: string | null;
  pages: string | null;
  articleNumber: string | null;
};

const urlPattern = /(?:https?:\/\/|www\.)[^\s锛屻€傦紱;锛?\]]+/i;
const yearPattern = /\b(?:19|20)\d{2}\b/g;
const fileNameExtensionPattern = /\.[^.\\/]+$/;

export function extractPaperMetadata(
  input: ExtractPaperMetadataInput,
): ReferenceItem {
  const fullText = normalizeText(input.fullText);
  const frontText = normalizeText(input.frontText || fullText.slice(0, 3000));
  const evidenceText = frontText || truncateBeforeReferenceList(fullText).slice(0, 5000);
  const doiSearchText = [
    evidenceText,
    truncateBeforeReferenceList(fullText).slice(0, 12000),
  ].join("\n");
  const rawText = evidenceText || stripFileExtension(input.fileName);
  const language = detectLanguage(evidenceText || input.fileName);
  const warnings: string[] = [];

  const doi = pickBestDoi(extractDoiCandidates(doiSearchText), evidenceText) ?? null;
  const url = extractUrl(evidenceText, doi);
  const titleResult = extractTitle({
    fileName: input.fileName,
    fileType: input.fileType,
    language,
    metadataTitle: input.metadataTitle,
    text: evidenceText,
  });
  const title = titleResult.title;
  const authors = extractAuthors({
    fileType: input.fileType,
    language,
    text: evidenceText,
    title,
  });
  const yearResult = extractYear(input.fileType, evidenceText);
  const sourceTitle = extractSourceTitle(evidenceText, title, language);
  const volumeIssuePages = extractVolumeIssuePages(evidenceText);
  const placePublisher = extractPlacePublisher(evidenceText);
  const type = detectReferenceType(evidenceText, {
    doi,
    fileType: input.fileType,
    pages: volumeIssuePages.pages,
    publisher: placePublisher.publisher,
    sourceTitle,
    textLength: fullText.length || frontText.length,
    url,
  });

  if (titleResult.fromFileName) {
    warnings.push("题名可能来自文件名，建议人工核对。");
  }
  if (!title) {
    warnings.push("未能自动识别题名，建议人工补充。");
  }
  if (titleResult.uncertain) {
    warnings.push("题名识别结果不确定，建议人工核对。");
  }

  if (authors.length === 0) {
    warnings.push("未能自动识别作者，建议人工补充。");
  }

  if (!yearResult.year || yearResult.uncertain) {
    warnings.push("年份识别结果不确定，建议人工核对。");
  }

  if (type === "journal" && !sourceTitle) {
    warnings.push("未能自动识别期刊名，建议人工补充。");
  }

  if (type === "unknown") {
    warnings.push("该文件未能可靠识别为具体文献类型，建议人工检查。");
  }

  if (!fullText.trim() && !frontText.trim()) {
    warnings.push("文件没有可用提取文本，需要先转换文件或手动补充文献信息。");
  }

  const confidence = calculateConfidence({
    authors,
    doi,
    sourceTitle,
    title,
    type,
    year: yearResult.year,
  });

  return {
    id: createReferenceId(input.fileName, rawText),
    rawText,
    sourceFileName: input.fileName,
    sourceFileType: input.fileType,
    originalFileName: input.fileName,
    type,
    authors,
    year: yearResult.year,
    title,
    sourceTitle,
    volume: volumeIssuePages.volume,
    issue: volumeIssuePages.issue,
    pages: volumeIssuePages.pages,
    articleNumber: volumeIssuePages.articleNumber,
    publisher: placePublisher.publisher,
    place: placePublisher.place,
    doi,
    url,
    accessDate: null,
    language,
    metadataSource: "pdf",
    confidence,
    matchedBy: doi ? "doi" : title ? "title" : "filename",
    needsReview: warnings.length > 0,
    extractionWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
    warnings: Array.from(new Set(warnings)),
  };
}

function extractTitle(input: {
  fileName: string;
  fileType: string;
  language: ReferenceLanguage;
  metadataTitle?: string;
  text: string;
}): { title: string | null; fromFileName: boolean; uncertain: boolean } {
  const metadataTitle = cleanTitle(input.metadataTitle ?? "");
  if (metadataTitle && looksLikeMetadataTitle(metadataTitle, input.fileName)) {
    return { title: metadataTitle, fromFileName: false, uncertain: false };
  }

  const texTitle = extractTexCommandValue(input.text, "title");
  if (texTitle) {
    return { title: cleanTitle(texTitle), fromFileName: false, uncertain: false };
  }

  if (input.fileType === "md") {
    const mdMetadataTitle = extractMetadataValue(input.text, ["title", "棰樺悕", "鏍囬"]);
    if (mdMetadataTitle) {
      return { title: cleanTitle(mdMetadataTitle), fromFileName: false, uncertain: false };
    }

    const markdownHeading = input.text.match(/^#\s+(.+)$/m)?.[1];
    if (markdownHeading) {
      return { title: cleanTitle(markdownHeading), fromFileName: false, uncertain: false };
    }
  }

  const lines = getFrontMatterLines(input.text);
  const abstractIndex = findFirstLineIndex(lines, /^(摘要|abstract|keywords?|关键词|introduction|1\s+introduction)\b/i);
  const searchLines = lines.slice(0, abstractIndex > 0 ? abstractIndex : Math.min(lines.length, 18));

  for (const line of searchLines) {
    const candidate = cleanTitle(line);
    if (looksLikeTitle(candidate, input.language)) {
      return { title: candidate, fromFileName: false, uncertain: false };
    }
  }

  if (input.language === "zh") {
    const chineseTitle = searchLines
      .map((line) => cleanTitle(line))
      .find((line) => {
        const chineseCount = line.match(/[\u3400-\u9fff]/g)?.length ?? 0;
        return (
          chineseCount >= 8 &&
          !looksLikeJournalTitle(line, "zh") &&
          !looksLikeAffiliation(line) &&
          !looksLikeAuthorLine(line, "zh") &&
          !/鎽樿|鍏抽敭璇峾鍩洪噾|閭/.test(line)
        );
      });

    if (chineseTitle) {
      return { title: chineseTitle, fromFileName: false, uncertain: false };
    }
  }

  const textCandidate = searchLines
    .map((line) => cleanTitle(line))
    .find((line) => looksLikeFallbackTitle(line, input.language));

  if (textCandidate) {
    return { title: textCandidate, fromFileName: false, uncertain: true };
  }

  const hasExtractedText = input.text.trim().length > 0;

  return {
    title: hasExtractedText
      ? null
      : cleanTitle(stripFileExtension(input.fileName)) || null,
    fromFileName: !hasExtractedText,
    uncertain: true,
  };
}

function extractAuthors(input: {
  fileType: string;
  language: ReferenceLanguage;
  text: string;
  title: string | null;
}): string[] {
  const texAuthor = extractTexCommandValue(input.text, "author");
  if (texAuthor) {
    return splitAuthors(cleanLatexText(texAuthor), input.language);
  }

  if (input.fileType === "md") {
    const metadataAuthor = extractMetadataValue(input.text, [
      "author",
      "authors",
      "作者",
    ]);
    if (metadataAuthor) {
      return splitAuthors(metadataAuthor, input.language);
    }
  }

  const lines = getFrontMatterLines(input.text);
  const titleEndIndex = findTitleEndLineIndex(lines, input.title);
  const startIndex = titleEndIndex >= 0 ? titleEndIndex + 1 : 0;
  const abstractIndex = findFirstLineIndex(
    lines.slice(startIndex),
    /^(摘要|abstract|keywords?|关键词)\b/i,
  );
  const endIndex =
    abstractIndex >= 0 ? startIndex + abstractIndex : Math.min(lines.length, startIndex + 14);
  const searchLines = lines.slice(startIndex, endIndex);

  for (const candidate of buildAuthorCandidates(searchLines)) {
    const authors = extractAuthorsFromCandidate(candidate, input.language, input.title);
    if (authors.length > 0) {
      return authors;
    }
  }

  return [];
}

function findTitleEndLineIndex(lines: string[], title: string | null): number {
  if (!title) {
    return -1;
  }

  const normalizedTitle = normalizeComparableText(title);
  if (!normalizedTitle) {
    return -1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    for (const span of [1, 2, 3]) {
      const endIndex = index + span - 1;
      const normalizedCandidate = normalizeComparableText(
        lines.slice(index, index + span).map(cleanTitle).join(" "),
      );

      if (!normalizedCandidate) {
        continue;
      }

      const sameTitle =
        normalizedCandidate === normalizedTitle ||
        (normalizedTitle.includes(normalizedCandidate) &&
          normalizedCandidate.length / normalizedTitle.length >= 0.55) ||
        (normalizedCandidate.includes(normalizedTitle) &&
          normalizedTitle.length / normalizedCandidate.length >= 0.55);

      if (sameTitle) {
        return Math.min(endIndex, lines.length - 1);
      }
    }
  }

  return -1;
}

function buildAuthorCandidates(lines: string[]): string[] {
  const candidates: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    for (const span of [1, 2]) {
      const candidate = lines.slice(index, index + span).join(" ");
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function extractAuthorsFromCandidate(
  value: string,
  language: ReferenceLanguage,
  title: string | null,
): string[] {
  const candidate = cleanAuthorLine(value);

  if (
    !candidate ||
    (title && isTitleLikeLine(candidate, title)) ||
    isAuthorCandidateNoise(candidate, language)
  ) {
    return [];
  }

  if (looksLikeAuthorLine(candidate, language)) {
    return splitAuthors(candidate, language);
  }

  if (language !== "zh") {
    const westernNames = extractWesternAuthorNames(candidate);
    if (westernNames.length > 0) {
      if (westernNames.length === 1 && looksLikeSentenceLine(candidate)) {
        return [];
      }

      return westernNames;
    }
  }

  return [];
}

function extractYear(
  fileType: string,
  text: string,
): { year: string | null; uncertain: boolean } {
  const texDate = extractTexCommandValue(text, "date");
  const texYear = texDate?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? null;
  if ((fileType === "tex" || fileType === "latex") && texYear) {
    return { year: texYear, uncertain: false };
  }

  const years = Array.from(text.matchAll(yearPattern)).map((match) => match[0]);
  if (years.length === 0) {
    return { year: null, uncertain: true };
  }

  const likelyYears = years.filter((year) => Number(year) >= 1900 && Number(year) <= 2035);
  const year = likelyYears[0] ?? years[0];

  return {
    year,
    uncertain: new Set(likelyYears).size > 1,
  };
}

function extractSourceTitle(
  text: string,
  title: string | null,
  language: ReferenceLanguage,
): string | null {
  const lines = getFrontMatterLines(text);
  const journalLineWithYear = lines.find((line) =>
    looksLikeJournalCitationLine(line, title),
  );

  if (journalLineWithYear) {
    const source = extractJournalFromCitationLine(journalLineWithYear);
    if (source) {
      return source;
    }
  }

  const headerJournal = extractHeaderJournalTitle(lines, title, language);
  if (headerJournal) {
    return headerJournal;
  }

  const journalLine = lines.find((line) => looksLikeJournalTitle(line, language));
  if (journalLine) {
    return cleanSourceTitle(journalLine);
  }

  if (title) {
    const afterTitle = text.slice(text.indexOf(title) + title.length);
    const sourceNearVolume = afterTitle.match(
      /([A-Z][A-Za-z&:\-\s]{4,80}|[\u3400-\u9fff]{3,30})\s+(?:Vol\.?\s*\d+|Volume\s+\d+|\d+\s*\(\s*\d+\s*\))/i,
    );
    if (sourceNearVolume?.[1]) {
      const source = cleanSourceTitle(sourceNearVolume[1]);
      if (source && !looksLikeAffiliation(source)) {
        return source;
      }
    }
  }

  return null;
}

function extractVolumeIssuePages(text: string): VolumeIssuePages {
  const textWithoutDoiAndUrls = stripDoiAndUrls(text);
  const pageMetadata = extractPagesFromText(textWithoutDoiAndUrls);
  const chineseVolumeIssue = textWithoutDoiAndUrls.match(
    /第\s*(\d+)\s*卷\s*(?:第\s*(\d+)\s*期)?/,
  );
  const englishVolumeIssue = textWithoutDoiAndUrls.match(
    /(?:Vol\.?|Volume)\s*(\d+)(?:\s*(?:No\.?|Issue)\s*(\d+))?/i,
  );
  const compactVolumeIssue = textWithoutDoiAndUrls.match(/\b(\d{1,4})\s*\(\s*(\d{1,3})\s*\)/);
  const articleNumber = textWithoutDoiAndUrls.match(
    /\((?:19|20)\d{2}\)\s*(\d{1,4})\s*:\s*(\d{1,6})\b/,
  );
  const semicolonArticleNumber = textWithoutDoiAndUrls.match(
    /\b(?:19|20)\d{2}\s*;\s*(\d{1,4})\s*:\s*(\d{1,6})\b/,
  );
  const pageMatch = textWithoutDoiAndUrls.match(
    /(?:pp?\.?|pages?|椤电爜)\s*([A-Za-z]?\d+\s*[-鈥撯€擼\s*[A-Za-z]?\d+)/i,
  );
  const colonPageRange = textWithoutDoiAndUrls.match(
    /:\s*(\d{1,5}\s*[-–—]\s*\d{1,5})\b/,
  );
  const volume =
    chineseVolumeIssue?.[1] ??
    englishVolumeIssue?.[1] ??
    compactVolumeIssue?.[1] ??
    articleNumber?.[1] ??
    semicolonArticleNumber?.[1] ??
    null;
  const issue =
    chineseVolumeIssue?.[2] ?? englishVolumeIssue?.[2] ?? compactVolumeIssue?.[2] ?? null;
  const pages =
    pageMetadata.pages ??
    normalizePageRange(pageMatch?.[1] ?? colonPageRange?.[1] ?? null) ??
    null;
  const articleNumberValue =
    pageMetadata.articleNumber ??
    articleNumber?.[2] ??
    semicolonArticleNumber?.[2] ??
    null;

  return {
    volume,
    issue,
    pages,
    articleNumber: pages ? null : articleNumberValue,
  };
}

function extractPlacePublisher(text: string): {
  place: string | null;
  publisher: string | null;
} {
  const chinesePublisher = text.match(/([\u3400-\u9fff]{2,20})\s*[:：]\s*([\u3400-\u9fff]{2,30}出版社)/);
  if (chinesePublisher) {
    return {
      place: cleanToken(chinesePublisher[1]),
      publisher: cleanToken(chinesePublisher[2]),
    };
  }

  const englishPublisher = text.match(
    /([A-Z][A-Za-z\s.-]{2,30})\s*[:：]\s*([^,.。]*(?:Press|Publisher|Publishing|Books))/,
  );
  if (englishPublisher) {
    return {
      place: cleanToken(englishPublisher[1]),
      publisher: cleanToken(englishPublisher[2]),
    };
  }

  return { place: null, publisher: null };
}

function detectReferenceType(
  text: string,
  fields: {
    doi: string | null;
    fileType: string;
    pages: string | null;
    publisher: string | null;
    sourceTitle: string | null;
    textLength: number;
    url: string | null;
  },
): ReferenceType {
  if (/瀛︿綅璁烘枃|纭曞＋|鍗氬＋|dissertation|thesis/i.test(text)) {
    return "thesis";
  }

  if (/浼氳|conference|proceedings|symposium|workshop/i.test(text)) {
    return "conference";
  }

  if (/鍑虹増绀緗\bPress\b|Publisher|Publishing|Books/i.test(text) || fields.publisher) {
    return "book";
  }

  if (fields.textLength < 80 && !fields.doi && !fields.sourceTitle) {
    return "unknown";
  }

  if (fields.url && !fields.doi && /缃戦〉|website|web page|blog|news/i.test(text)) {
    return "web";
  }

  if (fields.doi || fields.sourceTitle || fields.pages || /journal|瀛︽姤|鏈熷垔|鏉傚織|review|letters|transactions/i.test(text)) {
    return "journal";
  }

  return "unknown";
}

function detectLanguage(text: string): ReferenceLanguage {
  const chineseCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;

  if (chineseCount >= 8 && chineseCount >= latinCount / 4) {
    return "zh";
  }

  if (latinCount >= 20 && latinCount > chineseCount) {
    return "en";
  }

  return chineseCount > 0 ? "zh" : latinCount > 0 ? "en" : "unknown";
}

function extractUrl(text: string, doi: string | null): string | null {
  const urls = Array.from(text.matchAll(new RegExp(urlPattern, "gi")))
    .map((match) => cleanToken(match[0]))
    .filter(Boolean)
    .filter((url) => !isNonBibliographicUrl(url))
    .filter((url) => !(doi && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(url)));

  return urls[0] ?? null;
}

function extractTexCommandValue(text: string, commandName: string): string | null {
  const match = text.match(new RegExp(`\\\\${commandName}(?:\\[[^\\]]*\\])?\\{([\\s\\S]*?)\\}`, "i"));
  return match?.[1] ? cleanLatexText(match[1]) : null;
}

function extractMetadataValue(text: string, keys: string[]): string | null {
  const keyPattern = keys.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`^\\s*(?:${keyPattern})\\s*[:=锛歖\\s*(.+)$`, "im"));
  return match?.[1] ? cleanToken(match[1].replace(/^["']|["']$/g, "")) : null;
}

function getFrontMatterLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^(doi|url|email|e-mail|鍩洪噾椤圭洰|鏀剁鏃ユ湡|received|accepted)\b/i.test(line));
}

function looksLikeTitle(value: string, language: ReferenceLanguage): boolean {
  if (!value || value.length < 6 || value.length > 180) {
    return false;
  }

  if (
    /(?:摘要|关键词|abstract|keywords?|introduction|doi|copyright|all rights reserved|vol\.?|no\.?|第\s*\d+\s*卷|出版社)/i.test(value) ||
    /\((?:19|20)\d{2}\)\s*\d{1,4}\s*:|\b(?:19|20)\d{2}\s*;\s*\d{1,4}\s*:/.test(value) ||
    looksLikeAffiliation(value) ||
    looksLikeAuthorLine(value, language) ||
    looksLikeJournalTitle(value, language) ||
    /@/.test(value)
  ) {
    return false;
  }

  if (language === "zh") {
    const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    return chineseCount >= 6;
  }

  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 3 && words.length <= 28 && /[A-Za-z]{3,}/.test(value);
}

function looksLikeFallbackTitle(
  value: string,
  language: ReferenceLanguage,
): boolean {
  if (!value || value.length < 8 || value.length > 220) {
    return false;
  }

  if (
    /(?:abstract|keywords?|introduction|doi|copyright|creative commons|license|received|accepted|published|available online|open access|vol\.?|issue|pages?)/i.test(value) ||
    /\((?:19|20)\d{2}\)\s*\d{1,4}\s*:|\b(?:19|20)\d{2}\s*;\s*\d{1,4}\s*:/.test(value) ||
    looksLikeAffiliation(value) ||
    looksLikeJournalTitle(value, language) ||
    /@|https?:\/\//i.test(value)
  ) {
    return false;
  }

  if (language === "zh") {
    return (value.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 6;
  }

  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 3 && /[A-Za-z]{3,}/.test(value);
}

function looksLikeMetadataTitle(value: string, fileName: string): boolean {
  const normalizedTitle = normalizeComparableText(value);
  const normalizedFileName = normalizeComparableText(stripFileExtension(fileName));

  if (!normalizedTitle || normalizedTitle === normalizedFileName) {
    return false;
  }

  if (
    /^(untitled|microsoft word|pdf|article|manuscript)$/i.test(value) ||
    /https?:\/\/|doi|creativecommons|license/i.test(value)
  ) {
    return false;
  }

  const hasLatinTitle = /[A-Za-z]{3,}/.test(value) && value.split(/\s+/).length >= 3;
  const hasChineseTitle = (value.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 6;

  return hasLatinTitle || hasChineseTitle;
}

function isTitleLikeLine(value: string, title: string): boolean {
  const normalizedValue = normalizeComparableText(value);
  const normalizedTitle = normalizeComparableText(title);

  if (!normalizedValue || !normalizedTitle) {
    return false;
  }

  return (
    normalizedValue === normalizedTitle ||
    normalizedTitle.includes(normalizedValue) ||
    (normalizedValue.includes(normalizedTitle) &&
      normalizedTitle.length / normalizedValue.length >= 0.5)
  );
}

function isAuthorCandidateNoise(
  value: string,
  language: ReferenceLanguage,
): boolean {
  const hasVolumeMarker =
    /\((?:19|20)\d{2}\)\s*\d{1,4}\s*:/.test(value) ||
    /\b(?:19|20)\d{2}\s*;\s*\d{1,4}\s*:/.test(value);

  return (
    value.length > 260 ||
    looksLikeAffiliation(value) ||
    looksLikeJournalTitle(value, language) ||
    /@|https?:\/\/|www\.|doi|abstract|keywords?|introduction|copyright|creative commons|license|received|accepted|published|available online/i.test(value) ||
    hasVolumeMarker
  );
}

function looksLikeSentenceLine(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);

  return (
    words.length >= 4 &&
    /\b(of|in|for|with|from|toward|towards|using|based|between|through|under|review|study|analysis|sustainability|carbon|building|buildings)\b/i.test(value) &&
    !/[,&;閿?]/.test(value)
  );
}

function looksLikeAuthorLine(value: string, language: ReferenceLanguage): boolean {
  if (
    !value ||
    value.length > 260 ||
    looksLikeAffiliation(value) ||
    looksLikeJournalTitle(value, language) ||
    /@|鎽樿|abstract|doi/i.test(value)
  ) {
    return false;
  }

  if (language === "zh") {
    const normalized = value.replace(/[\d*†‡§|\s]+/g, "");
    const parts = normalized.split(/[，,、；;]+/).filter(Boolean);
    return (
      parts.length > 0 &&
      parts.length <= 8 &&
      parts.every((part) => /^[\u3400-\u9fff路]{2,5}$/.test(part))
    );
  }

  if (looksLikeWesternAuthorList(value)) {
    return true;
  }

  if (extractWesternAuthorNames(value).length >= 2) {
    return true;
  }

  return /^[A-Z][A-Za-z'鈥?-]+(?:,\s*[A-Z](?:\.)?)*(?:\s*(?:,|;|and|&)\s*[A-Z][A-Za-z'鈥?-]+(?:,\s*[A-Z](?:\.)?)*){0,12}$/i.test(value);
}

function splitAuthors(value: string, language: ReferenceLanguage): string[] {
  const cleaned = cleanAuthorLine(value)
    .replace(/\\and/g, ",")
    .replace(/\bet\s+al\.?/gi, "")
    .replace(/\[[^\]]+\]/g, "");

  if (language !== "zh") {
    return splitEnglishAuthors(cleaned);
  }

  return cleaned
    .split(/[，,、；;\s]+/)
    .map((author) => cleanToken(author.replace(/[\d*†‡§|]+/g, "")))
    .filter((author) => author.length > 0 && !looksLikeAffiliation(author))
    .slice(0, 12);
}

function splitEnglishAuthors(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  const extractedNames = extractWesternAuthorNames(normalized);
  if (extractedNames.length > 1) {
    return extractedNames.slice(0, 12);
  }

  const westernNameParts = normalized
    .split(/\s*(?:,|;|\band\b|&)\s*/i)
    .map((part) => cleanToken(part))
    .filter(Boolean);

  if (westernNameParts.length > 1 && westernNameParts.every(looksLikeWesternName)) {
    return westernNameParts.slice(0, 12);
  }

  const explicitParts = normalized
    .split(/\s*(?:;|\band\b|&)\s*/i)
    .map((part) => cleanToken(part))
    .filter(Boolean);

  if (explicitParts.length > 1) {
    return explicitParts
      .map((author) => cleanToken(author.replace(/[\d*†‡§|]+/g, "")))
      .filter((author) => author.length > 0 && !looksLikeAffiliation(author))
      .slice(0, 12);
  }

  const commaNameParts = normalized
    .split(/\s*,\s*/)
    .map((part) => cleanToken(part))
    .filter(Boolean);

  if (
    commaNameParts.length > 1 &&
    commaNameParts.every((part) => /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(part))
  ) {
    return commaNameParts.slice(0, 12);
  }

  const apaMatches = Array.from(
    normalized.matchAll(/([A-Z][A-Za-z'-]+,\s*(?:[A-Z]\.?\s*){1,4})/g),
  ).map((match) => cleanToken(match[1]));

  if (apaMatches.length > 0) {
    return apaMatches.slice(0, 12);
  }

  return normalized
    .split(/\s*,\s*(?=[A-Z][A-Za-z'-]+(?:\s|$))/)
    .map((author) => cleanToken(author.replace(/[\d*†‡§|]+/g, "")))
    .filter((author) => author.length > 0 && !looksLikeAffiliation(author))
    .slice(0, 12);
}

function extractWesternAuthorNames(value: string): string[] {
  const cleaned = cleanAuthorLine(value)
    .replace(/\bet\s+al\.?/gi, "")
    .replace(/\band\b/gi, ",")
    .replace(/&/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isAuthorCandidateNoise(cleaned, "en")) {
    return [];
  }

  const apaMatches = Array.from(
    cleaned.matchAll(/\b([A-Z][A-Za-z'閳?-]+,\s*(?:[A-Z]\.?\s*){1,4})\b/g),
  ).map((match) => cleanToken(match[1]));

  if (apaMatches.length > 0) {
    return uniqueAuthors(apaMatches).slice(0, 12);
  }

  const namePattern =
    /\b((?:[A-Z]\.|[A-Z][A-Za-z'閳?-]+)(?:\s+(?:[A-Z]\.|[A-Z][A-Za-z'閳?-]+)){1,4})\b/g;
  const matches = Array.from(cleaned.matchAll(namePattern))
    .map((match) => cleanToken(match[1]))
    .filter((name) => looksLikeWesternPersonName(name))
    .filter((name) => !looksLikeNonAuthorName(name));

  return uniqueAuthors(matches).slice(0, 12);
}

function uniqueAuthors(authors: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const author of authors) {
    const key = normalizeComparableText(author);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(author);
  }

  return result;
}

function looksLikeWesternPersonName(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) {
    return false;
  }

  return tokens.every((token) =>
    /^(?:[A-Z]\.|[A-Z][A-Za-z'鈥?-]+)$/.test(token),
  );
}

function looksLikeNonAuthorName(value: string): boolean {
  return /\b(abstract|article|available|building|buildings|carbon|china|conference|copyright|creative|editorial|footprint|footprints|frontiers|geoscience|journal|keywords|lifecycle|license|open|pathways|published|research|review|science|sustainability|volume)\b/i.test(
    value,
  );
}

function looksLikeWesternAuthorList(value: string): boolean {
  const parts = value
    .split(/\s*(?:,|;|锛泑\band\b|&)\s*/i)
    .map((part) => cleanToken(part))
    .filter(Boolean);

  return parts.length > 0 && parts.length <= 12 && parts.every(looksLikeWesternName);
}

function looksLikeWesternName(value: string): boolean {
  return /^[A-Z][A-Za-z'鈥?-]+(?:\s+[A-Z][A-Za-z'鈥?-]+){1,4}$/.test(value);
}

function looksLikeJournalTitle(value: string, language: ReferenceLanguage): boolean {
  const cleaned = cleanSourceTitle(value);

  if (cleaned.length < 4 || cleaned.length > 120 || /doi|@|鎽樿|abstract/i.test(cleaned)) {
    return false;
  }

  if (language === "zh") {
    return /瀛︽姤|鏈熷垔|鏉傚織|澶у瀛︽姤|瀛﹂櫌瀛︽姤/.test(cleaned);
  }

  return /\b(journal|letters|bulletin|transactions|proceedings|frontiers)\b/i.test(cleaned);
}

function looksLikeJournalCitationLine(line: string, title: string | null): boolean {
  const cleaned = cleanSourceTitle(line);

  if (!cleaned || (title && cleanTitle(cleaned) === title)) {
    return false;
  }

  return /^[A-Z][A-Za-z&: -]{3,100}\s*(?:\((?:19|20)\d{2}\)|(?:19|20)\d{2})\s*[,;]?\s*\d{1,4}\s*[:锛?]/.test(cleaned);
}

function extractJournalFromCitationLine(line: string): string | null {
  const match = cleanSourceTitle(line).match(
    /^(.+?)\s*(?:\((?:19|20)\d{2}\)|(?:19|20)\d{2})\b/,
  );
  const source = match?.[1] ? cleanSourceTitle(match[1]) : null;

  return source && !looksLikeAffiliation(source) ? source : null;
}

function extractHeaderJournalTitle(
  lines: string[],
  title: string | null,
  language: ReferenceLanguage,
): string | null {
  const titleIndex = title
    ? lines.findIndex((line) => cleanTitle(line) === title)
    : -1;

  if (titleIndex <= 0) {
    return null;
  }

  const candidates = lines.slice(Math.max(0, titleIndex - 5), titleIndex);

  for (const candidate of candidates.reverse()) {
    const source = cleanSourceTitle(candidate);
    const words = source.split(/\s+/).filter(Boolean);

    if (
      source &&
      source.length >= 4 &&
      source.length <= 80 &&
      !looksLikeAffiliation(source) &&
      !looksLikeAuthorLine(source, language) &&
      !/doi|@|https?:\/\/|copyright|creative commons|license|article/i.test(source) &&
      (looksLikeJournalTitle(source, language) ||
        (language === "en" && words.length <= 5 && /^[A-Z]/.test(source)))
    ) {
      return source;
    }
  }

  return null;
}

function looksLikeAffiliation(value: string): boolean {
  return /澶у|瀛﹂櫌|鐮旂┒闄瀹為獙瀹涓績|鍩洪噾|椤圭洰|閭|閫氳浣滆€厊department|university|institute|college|school|laboratory|lab|faculty|email|foundation|grant/i.test(value);
}

function cleanLatexText(value: string): string {
  return value
    .replace(/\\and\b/gi, ",")
    .replace(/\\\\/g, "\n")
    .replace(/\\(?:thanks|footnote)\{[\s\S]*?\}/gi, "")
    .replace(/\\[a-z]+\*?(?:\[[^\]]*])?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/~|\\,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(value: string): string {
  return cleanToken(
    cleanLatexText(value)
      .replace(/^#+\s*/, "")
      .replace(/^[銆?]|[銆?]$/g, ""),
  );
}

function cleanSourceTitle(value: string): string {
  return cleanToken(value.replace(/^\W+|\W+$/g, ""));
}

function cleanAuthorLine(value: string): string {
  return cleanToken(
    cleanLatexText(value)
      .replace(/\S+@\S+/g, " ")
      .replace(/\b(?:orcid|corresponding author|correspondence|email|e-mail)\b.*$/i, " ")
      .replace(/\([^)]*(?:澶у|瀛﹂櫌|university|institute|department|email)[^)]*\)/gi, "")
      .replace(/\[[^\]]*(?:university|institute|department|email)[^\]]*]/gi, "")
      .replace(/[\u00b9\u00b2\u00b3\u2070-\u2079]/g, "")
      .replace(/\b\d+[a-z]?\b/gi, "")
      .replace(/\b[a-z]\b(?=\s*(?:,|;|$))/g, "")
      .replace(/[*\u2020\u2021\u00a7|]+/g, " ")
      .replace(/\s+([,;])/g, "$1")
      .replace(/([,;])\s*([,;])+/g, "$1")
      .replace(/\s{2,}/g, " "),
  );
}

function cleanToken(value: string): string {
  return value
    .replace(/^[\s,，。、；;:：]+/, "")
    .replace(/[\s,，。、；;:：]+$/, "")
    .trim();
}

function normalizePageRange(value: string | null): string | null {
  return value ? value.replace(/\s+/g, "").replace(/[–—]/g, "-") : null;
}

function stripDoiAndUrls(text: string): string {
  return text
    .replace(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi, " ")
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/www\.[^\s]+/gi, " ");
}

function isNonBibliographicUrl(url: string): boolean {
  return /creativecommons\.org|license|licence|springer\.com\/openaccess|rightslink|orcid\.org/i.test(url);
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "");
}

function truncateBeforeReferenceList(text: string): string {
  const match = text.match(/\n\s*(鍙傝€冩枃鐚畖references|bibliography)\s*\n/i);
  return match?.index ? text.slice(0, match.index) : text;
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(fileNameExtensionPattern, "").trim();
}

function calculateConfidence(fields: {
  authors: string[];
  doi: string | null;
  sourceTitle: string | null;
  title: string | null;
  type: ReferenceType;
  year: string | null;
}): number {
  let score = 0.2;

  if (fields.title) score += 0.2;
  if (fields.authors.length > 0) score += 0.2;
  if (fields.year) score += 0.15;
  if (fields.sourceTitle) score += 0.15;
  if (fields.doi) score += 0.2;
  if (fields.type !== "unknown") score += 0.1;

  return Math.min(1, Number(score.toFixed(2)));
}

function createReferenceId(fileName: string, rawText: string): string {
  let hash = 0;
  const source = `${fileName}:${rawText}`;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return `file-ref-${hash.toString(36)}`;
}

function findFirstLineIndex(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


