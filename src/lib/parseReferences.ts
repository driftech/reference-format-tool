import type {
  ReferenceItem,
  ReferenceLanguage,
  ReferenceType,
} from "./referenceTypes";

const REVIEW_WARNING = "部分字段未能自动识别，建议人工检查";
const UNKNOWN_WARNING = "该条未能可靠识别，建议人工检查。";
const MISSING_YEAR_WARNING = "缺少年份";

const doiPattern = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const urlPattern = /(?:https?:\/\/|www\.)[^\s，。；;）)]+/i;
const yearPattern = /\b(?:19|20)\d{2}\b/;

export const referenceParserSamples = [
  "张三, 李四. 城市更新背景下历史街区空间活力研究[J]. 建筑学报, 2023, 64(2): 45-52. DOI:10.1234/example.2023.02.001",
  "王五. 现代科研方法[M]. 北京: 科学出版社, 2021.",
  "赵六. 高校研究生写作能力培养研究[D]. 上海: 复旦大学, 2020. 硕士学位论文.",
  "李明. 人工智能辅助科研写作研究[C]. 第十届全国学术写作会议论文集, 2022: 88-95.",
  "Smith, J., & Brown, P. (2023). Deep learning for reference parsing. Journal of Academic Writing, 18(4), 55-70. https://doi.org/10.1000/jaw.2023.018",
  "Miller, R. (2020). Foundations of research writing. Academic Press.",
  "Johnson, A. (2021). Machine learning support for academic writing [Doctoral dissertation, University of Example]. https://example.edu/theses/johnson",
  "World Health Organization. (2024, May 1). Global research data standards. WHO. https://www.who.int/example",
  "Unstructured note about a source without enough bibliographic clues",
  "教育部. 研究生教育学科专业目录[EB/OL]. https://www.moe.gov.cn/example, 2024-01-01.",
  "这是一条格式非常不完整的资料记录",
];

export const referenceParserSampleInput = referenceParserSamples.join("\n");

export function parseReferences(input: string): ReferenceItem[] {
  return splitReferenceLines(input).map((rawText, index) =>
    parseReferenceLine(rawText, index),
  );
}

function splitReferenceLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseReferenceLine(rawText: string, index: number): ReferenceItem {
  const parseText = stripLeadingNumber(rawText);
  const doi = extractDoi(parseText);
  const url = extractUrl(parseText);
  const year = extractYear(parseText);
  const language = detectLanguage(parseText);
  const authors = extractAuthors(parseText);
  const title = extractTitle(parseText, authors);
  const sourceTitle = extractSourceTitle(parseText, title);
  const volumeIssuePages = extractVolumeIssuePages(parseText);
  const placePublisher = extractPlacePublisher(parseText);
  const type = detectReferenceType(parseText, {
    doi,
    sourceTitle,
    volume: volumeIssuePages.volume,
    issue: volumeIssuePages.issue,
    pages: volumeIssuePages.pages,
    url,
  });
  const accessDate = extractAccessDate(parseText);
  const warnings = buildWarnings({
    type,
    authors,
    year,
    title,
    sourceTitle,
  });

  return {
    id: `ref-${index + 1}`,
    rawText,
    type,
    authors,
    year,
    title,
    sourceTitle,
    volume: volumeIssuePages.volume,
    issue: volumeIssuePages.issue,
    pages: volumeIssuePages.pages,
    publisher: placePublisher.publisher,
    place: placePublisher.place,
    doi,
    url,
    accessDate,
    language,
    warnings,
  };
}

function stripLeadingNumber(text: string): string {
  return text
    .replace(/^\s*(?:\[\d+\]|\d+[.)、]|（\d+）)\s*/, "")
    .trim();
}

function cleanToken(value: string): string {
  return value
    .replace(/^[\s,，.。:：;；]+/, "")
    .replace(/[\s,，.。;；]+$/, "")
    .trim();
}

function extractDoi(text: string): string | null {
  const doi = text.match(doiPattern)?.[0] ?? null;
  return doi ? cleanToken(doi.replace(/^https?:\/\/doi\.org\//i, "")) : null;
}

function extractUrl(text: string): string | null {
  const url = text.match(urlPattern)?.[0] ?? null;
  return url ? cleanToken(url) : null;
}

function extractYear(text: string): string | null {
  return text.match(yearPattern)?.[0] ?? null;
}

function detectLanguage(text: string): ReferenceLanguage {
  const chineseCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;

  if (chineseCount > 0) {
    return "zh";
  }

  if (latinCount > 0) {
    return "en";
  }

  return "unknown";
}

function extractAuthors(text: string): string[] {
  const authorSegment = text.match(/^(.+?)(?:\.\s+|．|。)/)?.[1] ?? "";
  const cleaned = cleanToken(authorSegment);

  if (!cleaned || yearPattern.test(cleaned) || cleaned.length > 80) {
    return [];
  }

  if (!/[\u3400-\u9fff]/.test(cleaned)) {
    const apaStyleAuthors = extractApaStyleAuthors(cleaned);
    if (apaStyleAuthors.length > 0) {
      return apaStyleAuthors;
    }
  }

  return cleaned
    .replace(/\bet al\.?/gi, "")
    .split(/\s*(?:,|，|;|；|、|\band\b|&)\s*/i)
    .map((author) => cleanToken(author))
    .filter(Boolean);
}

function extractApaStyleAuthors(text: string): string[] {
  const matches = Array.from(
    text.matchAll(
      /([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*),\s*((?:[A-Z]\.?\s*){1,4})/g,
    ),
  );

  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match) => `${match[1]}, ${match[2].replace(/\s+/g, " ").trim()}`)
    .map((author) => cleanToken(author))
    .filter(Boolean);
}

function extractTitle(text: string, authors: string[]): string | null {
  let workingText = text;

  if (authors.length > 0) {
    const authorMatch = workingText.match(/^(.+?)(?:\.\s+|．|。)/);
    if (authorMatch) {
      workingText = workingText.slice(authorMatch[0].length);
    }
  }

  workingText = workingText
    .replace(/^\((?:19|20)\d{2}(?:,\s*[^)]+)?\)[.。]?\s*/, "")
    .replace(/^\(?\d{4}\)?[.。]?\s*/, "");

  const titleBeforeTypeMark = workingText.match(/^(.+?)(?:\[[A-Za-z/]+\])/);
  if (titleBeforeTypeMark?.[1]) {
    return cleanToken(titleBeforeTypeMark[1]);
  }

  const titleBeforeThesisDescription = workingText.match(
    /^(.+?)\s+\[[^[\]]*(?:thesis|dissertation)[^[\]]*\]/i,
  );
  if (titleBeforeThesisDescription?.[1]) {
    return cleanToken(titleBeforeThesisDescription[1]);
  }

  const titleBeforePeriod = workingText.match(/^(.+?)(?:\.\s+|．|。)/);
  if (titleBeforePeriod?.[1]) {
    return cleanToken(titleBeforePeriod[1]);
  }

  const titleBeforeSource = workingText.match(/^(.+?)(?:,\s*(?:Journal|Proceedings|Conference|[A-Z][A-Za-z ]{4,}))/);
  if (titleBeforeSource?.[1]) {
    return cleanToken(titleBeforeSource[1]);
  }

  return null;
}

function extractSourceTitle(text: string, title: string | null): string | null {
  const afterTypeMark = text.match(/\[[A-Za-z/]+\]\.?\s*([^,，.。]+)[,，.。]/);
  if (afterTypeMark?.[1]) {
    const source = cleanToken(afterTypeMark[1]);
    if (!looksLikePlacePublisher(source) && !looksLikeUrlFragment(source)) {
      return source;
    }
  }

  if (title) {
    const escapedTitle = escapeRegExp(title);
    const afterTitle = text.match(new RegExp(`${escapedTitle}\\.?\\s*([^\\d]+?)(?:,|，)\\s*(?:19|20)\\d{2}`, "i"));
    if (afterTitle?.[1]) {
      const source = cleanToken(afterTitle[1]);
      if (source && !looksLikePlacePublisher(source) && !looksLikeUrlOrElectronicMarker(source)) {
        return source;
      }
    }

    const afterTitleApaJournal = text.match(new RegExp(`${escapedTitle}\\.?\\s+([^,，.。]+(?:\\s+[^,，.。]+)*?)[,，]\\s*\\d+`, "i"));
    if (afterTitleApaJournal?.[1]) {
      const source = cleanToken(afterTitleApaJournal[1]);
      if (source && !looksLikePlacePublisher(source)) {
        return source;
      }
    }

    const afterTitleWebsite = text.match(new RegExp(`${escapedTitle}\\.?\\s+([^,，.。]+)[.。]\\s*(?:https?:\\/\\/|www\\.)`, "i"));
    if (afterTitleWebsite?.[1]) {
      const source = cleanToken(afterTitleWebsite[1]);
      if (source && !looksLikeUrlFragment(source)) {
        return source;
      }
    }
  }

  return null;
}

function extractVolumeIssuePages(text: string): {
  volume: string | null;
  issue: string | null;
  pages: string | null;
} {
  const volumeIssuePages = text.match(
    /(?:^|[,，\s])(\d+)\s*\(\s*(\d+)\s*\)\s*[,，:：]\s*([A-Za-z]?\d+\s*[-–—]\s*[A-Za-z]?\d+)/,
  );

  if (volumeIssuePages) {
    return {
      volume: volumeIssuePages[1],
      issue: volumeIssuePages[2],
      pages: volumeIssuePages[3].replace(/\s+/g, ""),
    };
  }

  const simplePages = text.match(
    /(?:^|[,，\s])(\d+)\s*[,，:：]\s*([A-Za-z]?\d+\s*[-–—]\s*[A-Za-z]?\d+)/,
  );

  if (simplePages) {
    return {
      volume: simplePages[1],
      issue: null,
      pages: simplePages[2].replace(/\s+/g, ""),
    };
  }

  const pageOnly = text.match(/(?:pp?\.?|页码|:|：)\s*([A-Za-z]?\d+\s*[-–—]\s*[A-Za-z]?\d+)/i);

  return {
    volume: null,
    issue: null,
    pages: pageOnly?.[1]?.replace(/\s+/g, "") ?? null,
  };
}

function extractPlacePublisher(text: string): {
  place: string | null;
  publisher: string | null;
} {
  const chinesePublisher = text.match(/([^\s,，.。:：]{2,20})[:：]\s*([^,，.。]*出版社)/);
  if (chinesePublisher) {
    return {
      place: cleanToken(chinesePublisher[1]),
      publisher: cleanToken(chinesePublisher[2]),
    };
  }

  const chinesePlaceOrg = text.match(/([^\s,，.。:：]{2,20})[:：]\s*([^,，.。]{2,30}(?:大学|学院|研究院|会议论文集|会议|委员会|中心))/);
  if (chinesePlaceOrg) {
    return {
      place: cleanToken(chinesePlaceOrg[1]),
      publisher: cleanToken(chinesePlaceOrg[2]),
    };
  }

  const englishPublisher = text.match(
    /([A-Z][A-Za-z\s.-]{2,30})[:：]\s*([^,，.。]*(?:Press|Publisher|Publishing|Books))/,
  );

  if (englishPublisher) {
    return {
      place: cleanToken(englishPublisher[1]),
      publisher: cleanToken(englishPublisher[2]),
    };
  }

  const englishPublisherOnly = text.match(
    /(?:^|[.。]\s+)([^,，.。]*(?:Press|Publisher|Publishing|Books))[,，.。]\s*(?:19|20)?\d{0,2}/i,
  );
  if (englishPublisherOnly?.[1]) {
    return {
      place: null,
      publisher: cleanToken(englishPublisherOnly[1]),
    };
  }

  const englishThesisInstitution = text.match(
    /\[(?:[^\],，]+),\s*([^\]]+)\]/i,
  );
  if (englishThesisInstitution?.[1]) {
    return {
      place: null,
      publisher: cleanToken(englishThesisInstitution[1]),
    };
  }

  return {
    place: null,
    publisher: null,
  };
}

function extractAccessDate(text: string): string | null {
  const chineseAccessDate = text.match(/(?:访问日期|引用日期|检索日期)[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
  if (chineseAccessDate?.[1]) {
    return chineseAccessDate[1];
  }

  const englishAccessDate = text.match(/accessed\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);
  return englishAccessDate?.[1] ?? null;
}

function detectReferenceType(
  text: string,
  fields: {
    doi: string | null;
    sourceTitle: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
    url: string | null;
  },
): ReferenceType {
  const hasJournalMark = /\[[Jj]\]/.test(text);
  const hasJournalWords =
    /期刊|学报|杂志|journal|review|letters|bulletin|transactions/i.test(text);
  const hasVolumePageShape = Boolean(
    fields.pages && (fields.volume || fields.issue),
  );

  if (fields.doi || hasJournalMark || (fields.sourceTitle && hasJournalWords && hasVolumePageShape)) {
    return "journal";
  }

  if (/\[[Mm]\]|出版社|Press|Publisher|Publishing|Books/i.test(text)) {
    return "book";
  }

  if (/学位论文|硕士|博士|dissertation|thesis/i.test(text)) {
    return "thesis";
  }

  if (fields.url || /\[EB\/OL\]|\[OL\]|网页|website|web page/i.test(text)) {
    return "web";
  }

  if (/\[[Cc]\]|会议|conference|proceedings|symposium|workshop/i.test(text)) {
    return "conference";
  }

  if (fields.sourceTitle && hasVolumePageShape) {
    return "journal";
  }

  return "unknown";
}

function buildWarnings(fields: {
  type: ReferenceType;
  authors: string[];
  year: string | null;
  title: string | null;
  sourceTitle: string | null;
}): string[] {
  const warnings: string[] = [];

  if (fields.type === "unknown") {
    warnings.push(UNKNOWN_WARNING);
  }

  if (!fields.year) {
    warnings.push(MISSING_YEAR_WARNING);
  }

  const missingCoreFields =
    fields.authors.length === 0 ||
    !fields.year ||
    !fields.title ||
    fields.type === "unknown" ||
    (fields.type === "journal" && !fields.sourceTitle);

  if (missingCoreFields) {
    warnings.push(REVIEW_WARNING);
  }

  return warnings;
}

function looksLikePlacePublisher(text: string): boolean {
  return /出版社|Press|Publisher|Publishing|Books|^[\u3400-\u9fff]{2,8}$/.test(text);
}

function looksLikeUrlFragment(text: string): boolean {
  return /^(?:https?:\/\/|www\.?)/i.test(text);
}

function looksLikeUrlOrElectronicMarker(text: string): boolean {
  return looksLikeUrlFragment(text) || /https?:\/\/|www\.|\[(?:EB\/OL|OL)\]/i.test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
