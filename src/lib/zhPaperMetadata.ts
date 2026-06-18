import { extractDoiCandidates, pickBestDoi } from "./doiUtils";
import type { ReferenceItem, ReferenceType } from "./referenceTypes";
import {
  isLikelyChinesePaper,
  normalizeChineseAcademicText,
  removeCommonZhNoiseLines,
  stripFileExtension,
  uniqueStrings,
} from "./zhTextUtils";

export type ExtractZhPaperMetadataInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
  doi?: string;
};

const localZhWarning =
  "中文文献为本地解析草稿，请人工核对作者、题名、期刊、年份、卷期页码。";

export function extractZhPaperMetadata(
  input: ExtractZhPaperMetadataInput,
): ReferenceItem {
  const firstText = normalizeChineseAcademicText(input.firstPagesText);
  const fullText = normalizeChineseAcademicText(input.fullText ?? "");
  const text = [firstText, fullText].filter(Boolean).join("\n");
  const frontLines = removeCommonZhNoiseLines(firstText.split("\n")).slice(0, 80);
  const doi =
    input.doi ??
    pickBestDoi(extractDoiCandidates([firstText, fullText].join("\n")), firstText) ??
    null;
  const type = inferReferenceType(text);
  const title = extractTitle(frontLines, input.fileName);
  const authors = extractAuthors(frontLines, title.value);
  const sourceTitle = extractSourceTitle(frontLines, title.value);
  const yearInfo = extractYear(firstText);
  const volumeIssue = extractVolumeIssue(firstText);
  const pages = extractPages(firstText, doi);
  const warnings = uniqueStrings([
    localZhWarning,
    ...title.warnings,
    ...(authors.length === 0 ? ["未能自动识别作者，建议人工补充。"] : []),
    ...(type === "journal" && !sourceTitle
      ? ["未能自动识别期刊名，建议人工补充。"]
      : []),
    ...yearInfo.warnings,
    ...(isLikelyChinesePaper(text) ? [] : ["中文特征不明显，解析结果需要人工核对。"]),
  ]);
  const missingKeyFields = [
    title.value,
    authors.length > 0 ? "authors" : "",
    yearInfo.year,
    type === "journal" ? sourceTitle : "source",
  ].filter(Boolean).length;

  return {
    id: `zh-${hashString(input.fileName)}-${hashString(title.value ?? text.slice(0, 80))}`,
    rawText: firstText || text,
    sourceFileName: input.fileName,
    sourceFileType: inferFileType(input.fileName),
    originalFileName: input.fileName,
    type,
    authors,
    year: yearInfo.year,
    title: title.value,
    sourceTitle,
    volume: volumeIssue.volume,
    issue: volumeIssue.issue,
    pages,
    publisher: null,
    place: null,
    doi,
    url: null,
    accessDate: null,
    language: "zh",
    metadataSource: "local_zh",
    matchedBy: doi ? "doi_unresolved" : "local_zh_parse",
    confidence: calculateConfidence(missingKeyFields),
    needsReview: true,
    extractionWarning: warnings.join(" "),
    warnings,
  };
}

function inferReferenceType(text: string): ReferenceType {
  if (/学位论文|硕士|博士/.test(text)) {
    return "thesis";
  }

  if (/会议|论文集/.test(text)) {
    return "conference";
  }

  if (text.trim().length < 30) {
    return "unknown";
  }

  return "journal";
}

function extractTitle(
  lines: string[],
  fileName: string,
): { value: string | null; warnings: string[] } {
  const boundaryIndex = lines.findIndex((line) =>
    /摘要|关键词|关键字|中图分类号|文献标识码|文章编号/.test(line),
  );
  const candidates = lines
    .slice(0, boundaryIndex > 0 ? boundaryIndex : Math.min(lines.length, 25))
    .map(cleanLine)
    .filter(looksLikeTitle);

  if (candidates.length > 0) {
    return {
      value: candidates.sort((first, second) => scoreTitle(second) - scoreTitle(first))[0],
      warnings: [],
    };
  }

  const fileTitle = stripFileExtension(fileName);
  return {
    value: fileTitle || null,
    warnings: fileTitle ? ["题名可能来自文件名，建议人工核对。"] : ["未能自动识别题名，建议人工补充。"],
  };
}

function extractAuthors(lines: string[], title: string | null): string[] {
  const titleIndex = title ? findSimilarLineIndex(lines, title) : -1;
  const start = titleIndex >= 0 ? titleIndex + 1 : 0;
  const boundaryIndex = lines
    .slice(start)
    .findIndex((line) => /摘要|关键词|关键字|中图分类号|文献标识码/.test(line));
  const searchLines = lines.slice(
    start,
    boundaryIndex >= 0 ? start + boundaryIndex : Math.min(lines.length, start + 8),
  );

  for (const line of searchLines) {
    const cleaned = cleanLine(line)
      .replace(/[*†‡§\d]+/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .trim();

    if (looksLikeAuthorLine(cleaned)) {
      return uniqueStrings(
        cleaned
          .split(/[，,、；;\s]+/)
          .map((author) => author.trim())
          .filter((author) => /^[\u3400-\u9fff·]{2,5}$/.test(author)),
      ).slice(0, 12);
    }
  }

  return [];
}

function extractSourceTitle(lines: string[], title: string | null): string | null {
  const titleIndex = title ? findSimilarLineIndex(lines, title) : -1;
  const candidates =
    titleIndex > 0 ? lines.slice(Math.max(0, titleIndex - 10), titleIndex) : lines.slice(0, 12);

  for (const candidate of candidates.reverse()) {
    const source = cleanLine(candidate)
      .replace(/\b(?:19|20)\d{2}\b/g, "")
      .replace(/第\s*\d+\s*卷.*$/g, "")
      .replace(/\d+\s*-\s*\d+$/g, "")
      .trim();

    if (source !== title && looksLikeJournalName(source)) {
      return source;
    }
  }

  return null;
}

function extractYear(text: string): { year: string | null; warnings: string[] } {
  const safeText = text.replace(/收稿日期|修回日期|录用日期|基金项目/g, "\n$&");
  const preferred = safeText.match(
    /(?:第\s*\d+\s*卷|第\s*\d+\s*期|Vol\.?\s*\d+|No\.?\s*\d+|期刊|学报|杂志|出版).*?((?:19|20)\d{2})/i,
  )?.[1];

  if (preferred) {
    return { year: preferred, warnings: [] };
  }

  const years = uniqueStrings(
    Array.from(safeText.matchAll(/(?:19|20)\d{2}/g))
      .map((match) => match[0])
      .filter((year) => Number(year) >= 1900 && Number(year) <= 2035),
  );

  if (years.length === 0) {
    return { year: null, warnings: ["未能自动识别年份，建议人工补充。"] };
  }

  return {
    year: years[0],
    warnings: years.length > 1 ? ["年份识别结果不确定，建议人工核对。"] : [],
  };
}

function extractVolumeIssue(text: string): {
  volume: string | null;
  issue: string | null;
} {
  const volumeIssue =
    text.match(/第\s*(\d+)\s*卷\s*第?\s*(\d+)\s*期/) ??
    text.match(/(\d+)\s*卷\s*(\d+)\s*期/) ??
    text.match(/Vol\.?\s*(\d+)\s*No\.?\s*(\d+)/i);

  if (volumeIssue) {
    return {
      volume: volumeIssue[1],
      issue: volumeIssue[2],
    };
  }

  const issue = text.match(/(?:19|20)\d{2}\s*年\s*第?\s*(\d+)\s*期/)?.[1] ?? null;
  return { volume: null, issue };
}

function extractPages(text: string, doi: string | null): string | null {
  const withoutDoi = doi ? text.replace(doi, " ") : text;
  const explicit = withoutDoi.match(
    /(?:页码|页|P\.?|pp\.?)\s*[:：]?\s*([A-Za-z]?\d{1,5}\s*[-–—~～]\s*[A-Za-z]?\d{1,5})/i,
  )?.[1];
  const general = withoutDoi.match(
    /(?:^|\s)([1-9]\d{0,4}\s*[-–—~～]\s*[1-9]\d{0,4})(?:\s|$)/m,
  )?.[1];
  const pages = explicit ?? general;

  if (!pages) {
    return null;
  }

  const normalized = pages.replace(/[–—~～]/g, "-").replace(/\s+/g, "");
  const [start, end] = normalized.split("-").map((value) => Number(value));

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }

  if (end - start > 300) {
    return null;
  }

  return normalized;
}

function looksLikeTitle(value: string): boolean {
  if (value.length < 6 || value.length > 80) {
    return false;
  }

  if (
    /摘要|关键词|基金|收稿|作者|通讯|邮箱|DOI|http|中图分类号|文献标识码|文章编号/.test(value) ||
    /大学|学院|研究院|公司|中心|实验室/.test(value) ||
    looksLikeJournalName(value) ||
    looksLikeAuthorLine(value)
  ) {
    return false;
  }

  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return chineseCount >= 6;
}

function scoreTitle(value: string): number {
  let score = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  if (/研究|分析|方法|设计|评价|影响|模型|策略|机制/.test(value)) score += 8;
  if (/[。.;；]$/.test(value)) score -= 4;
  return score;
}

function looksLikeAuthorLine(value: string): boolean {
  if (
    !value ||
    value.length > 80 ||
    /大学|学院|研究院|公司|中心|实验室|基金|作者简介|通讯作者|邮箱|DOI|摘要|关键词/.test(value)
  ) {
    return false;
  }

  const parts = value.split(/[，,、；;\s]+/).filter(Boolean);
  return (
    parts.length > 0 &&
    parts.length <= 10 &&
    parts.every((part) => /^[\u3400-\u9fff·]{2,5}$/.test(part))
  );
}

function looksLikeJournalName(value: string): boolean {
  if (!value || value.length < 3 || value.length > 32) {
    return false;
  }

  if (/摘要|关键词|大学|学院|研究院|公司|中心|实验室|DOI|http|第\s*\d+\s*卷|第\s*\d+\s*期/.test(value)) {
    return false;
  }

  return /学报|期刊|杂志|科学|技术|工程|建筑|环境|能源|城市|规划|研究/.test(value);
}

function findSimilarLineIndex(lines: string[], target: string): number {
  const normalizedTarget = normalizeKey(target);
  return lines.findIndex((line) => {
    const normalizedLine = normalizeKey(line);
    return (
      normalizedLine === normalizedTarget ||
      normalizedTarget.includes(normalizedLine) ||
      normalizedLine.includes(normalizedTarget)
    );
  });
}

function calculateConfidence(presentKeyFieldCount: number): number {
  if (presentKeyFieldCount >= 4) {
    return 0.7;
  }

  if (presentKeyFieldCount === 3) {
    return 0.55;
  }

  return 0.35;
}

function cleanLine(value: string): string {
  return normalizeChineseAcademicText(value)
    .replace(/^[\s,，。、；;:：]+|[\s,，。、；;:：]+$/g, "")
    .trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}

function inferFileType(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "pdf";
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
