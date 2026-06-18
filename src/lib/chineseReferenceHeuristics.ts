import type { ReferenceItem } from "./referenceTypes";

export type EnhanceChineseReferenceDraftInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
  item: ReferenceItem;
};

const unknownTypeWarningPattern =
  /未能可靠识别为具体文献类型|未能.*文献类型|unknown/i;

export function enhanceChineseReferenceDraft(
  input: EnhanceChineseReferenceDraftInput,
): ReferenceItem {
  const text = normalizeText(
    [input.firstPagesText, input.fullText].filter(Boolean).join("\n"),
  );

  if (!looksLikeChineseReference(input.item, text)) {
    return input.item;
  }

  const lines = getFrontLines(text);
  const sourceTitle = input.item.sourceTitle ?? extractChineseSourceTitle(lines, input.item.title);
  const pages = input.item.pages ?? extractChinesePages(text);
  const type =
    input.item.type === "unknown" && looksLikeChineseJournalArticle(input.item, sourceTitle, pages)
      ? "journal"
      : input.item.type;
  const warnings = cleanupWarnings(input.item.warnings, {
    sourceTitle,
    type,
  });

  if (type === "journal" && !sourceTitle) {
    warnings.push("未能自动识别中文期刊名，建议人工补充。");
  }

  const nextItem: ReferenceItem = {
    ...input.item,
    type,
    sourceTitle,
    pages,
    warnings: uniqueStrings(warnings),
  };

  return {
    ...nextItem,
    confidence: recalculateConfidence(nextItem),
    needsReview:
      nextItem.warnings.length > 0 ||
      !nextItem.title ||
      nextItem.authors.length === 0 ||
      !nextItem.year ||
      (nextItem.type === "journal" && !nextItem.sourceTitle),
    extractionWarning:
      nextItem.warnings.length > 0 ? nextItem.warnings.join(" ") : undefined,
  };
}

function looksLikeChineseReference(item: ReferenceItem, text: string): boolean {
  const chineseCount =
    [item.title, item.sourceTitle, item.authors.join(" "), text]
      .filter(Boolean)
      .join("")
      .match(/[\u3400-\u9fff]/g)?.length ?? 0;

  return item.language === "zh" || chineseCount >= 8;
}

function looksLikeChineseJournalArticle(
  item: ReferenceItem,
  sourceTitle: string | null,
  pages: string | null,
): boolean {
  return Boolean(
    item.title &&
      item.authors.length > 0 &&
      item.year &&
      (sourceTitle || item.volume || item.issue || pages),
  );
}

function extractChineseSourceTitle(
  lines: string[],
  title: string | null,
): string | null {
  const titleIndex = title ? findTitleLineIndex(lines, title) : -1;
  const candidates =
    titleIndex > 0 ? lines.slice(Math.max(0, titleIndex - 8), titleIndex) : lines.slice(0, 10);

  for (const line of candidates.reverse()) {
    const source = cleanSourceLine(line);
    if (looksLikeChineseJournalName(source)) {
      return source;
    }
  }

  return null;
}

function extractChinesePages(text: string): string | null {
  const explicit = text.match(/(?:页码|页|P\.?|pp\.?)\s*[:：]?\s*([A-Za-z]?\d{1,5}\s*[-–—]\s*[A-Za-z]?\d{1,5})/i);
  const range = explicit?.[1] ?? text.match(/(?:^|\s)(\d{1,5}\s*[-–—]\s*\d{1,5})(?:\s|$)/m)?.[1];

  return range ? range.replace(/\s+/g, "").replace(/[–—]/g, "-") : null;
}

function looksLikeChineseJournalName(value: string): boolean {
  if (!value || value.length < 2 || value.length > 30) {
    return false;
  }

  if (
    /摘要|关键词|基金|收稿|修回|作者|单位|大学|学院|研究院|实验室|邮箱|DOI|http|第\s*\d+\s*卷|第\s*\d+\s*期/i.test(
      value,
    )
  ) {
    return false;
  }

  const chineseCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  if (chineseCount < 2) {
    return false;
  }

  return (
    /学报|期刊|杂志|科学|技术|工程|建筑|环境|能源|城市|规划|研究|大学/.test(value) ||
    (chineseCount >= 4 && !/[，。；：、]/.test(value))
  );
}

function cleanupWarnings(
  warnings: string[],
  fields: {
    sourceTitle: string | null;
    type: ReferenceItem["type"];
  },
): string[] {
  return warnings.filter((warning) => {
    if (fields.type !== "unknown" && unknownTypeWarningPattern.test(warning)) {
      return false;
    }

    if (fields.sourceTitle && /期刊名|来源/.test(warning)) {
      return false;
    }

    return true;
  });
}

function recalculateConfidence(item: ReferenceItem): number {
  let score = 0.2;

  if (item.title) score += 0.2;
  if (item.authors.length > 0) score += 0.2;
  if (item.year) score += 0.15;
  if (item.sourceTitle) score += 0.15;
  if (item.doi) score += 0.2;
  if (item.volume || item.issue || item.pages || item.articleNumber) score += 0.05;
  if (item.type !== "unknown") score += 0.1;

  return Number(Math.min(1, score).toFixed(2));
}

function getFrontLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 60);
}

function findTitleLineIndex(lines: string[], title: string): number {
  const normalizedTitle = normalizeComparable(title);

  return lines.findIndex((line) => {
    const normalizedLine = normalizeComparable(line);
    return (
      normalizedLine === normalizedTitle ||
      normalizedTitle.includes(normalizedLine) ||
      normalizedLine.includes(normalizedTitle)
    );
  });
}

function cleanSourceLine(value: string): string {
  return value
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/第\s*\d+\s*卷.*$/g, "")
    .replace(/Vol\.?\s*\d+.*$/i, "")
    .replace(/[|｜].*$/g, "")
    .replace(/^[\s,，。、；;:：]+|[\s,，。、；;:：]+$/g, "")
    .trim();
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

