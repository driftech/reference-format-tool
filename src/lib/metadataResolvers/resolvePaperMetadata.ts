import "server-only";

import {
  extractDoiCandidates,
  pickBestDoi,
} from "../doiUtils";
import { enhanceChineseReferenceDraft } from "../chineseReferenceHeuristics";
import { extractPaperMetadata } from "../extractPaperMetadata";
import {
  extractPagesFromText,
  getPagesOrArticleNumber,
  mergePageMetadataIntoReference,
  type PageMetadata,
} from "../pageMetadata";
import type { MetadataCandidate, ReferenceItem } from "../referenceTypes";
import { extractZhPaperMetadata } from "../zhPaperMetadata";
import { isLikelyChinesePaper } from "../zhTextUtils";
import { getManualRecoveryWarning, getPrintedPdfWarning, detectPrintedPdfRisk } from "../titleUtils";
import { resolveByDoi } from "./resolveByDoi";
import { resolveWithoutDoi } from "./resolveWithoutDoi";

export type ResolvePaperMetadataInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
  pdfMetadataText?: string;
};

export type ResolvePaperMetadataStatus = "success" | "needs_review" | "failed";

export type ResolvePaperMetadataResult = {
  finalItem: ReferenceItem;
  candidates: MetadataCandidate[];
  localDraft: ReferenceItem;
  status: ResolvePaperMetadataStatus;
  warnings: string[];
};

const minimumTextLength = 80;

export async function resolvePaperMetadata(
  input: ResolvePaperMetadataInput,
): Promise<ResolvePaperMetadataResult> {
  const fullText = normalizeText(input.fullText ?? "");
  const firstPagesText = normalizeText(input.firstPagesText);
  const searchableText = [firstPagesText, fullText].filter(Boolean).join("\n");

  if (searchableText.trim().length < minimumTextLength) {
    const failedDraft = createEmptyDraft(input.fileName, [
      "该 PDF 可能是扫描版或不含可提取文本，暂不支持自动识别。请手动补充该文献信息。",
    ]);

    return {
      finalItem: failedDraft,
      candidates: [],
      localDraft: failedDraft,
      status: "failed",
      warnings: failedDraft.warnings,
    };
  }

  const doi = pickBestDoi(extractDoiCandidates(searchableText), firstPagesText);
  const printedPdfRisk = detectPrintedPdfRisk({
    firstPagesText,
    fullText,
    pdfMetadataText: input.pdfMetadataText,
    hasDoi: Boolean(doi),
  });

  if (isLikelyChinesePaper(searchableText)) {
    return resolveChinesePaperMetadata(input, firstPagesText, fullText, doi);
  }

  const localDraft = applyExtractedDoi(
    createLocalDraft(input, firstPagesText, fullText),
    doi,
  );
  const pageFallback = buildPageFallback(localDraft, firstPagesText, fullText);
  const warnings: string[] = printedPdfRisk ? [getPrintedPdfWarning()] : [];
  let candidates: MetadataCandidate[] = [];

  if (doi) {
    const doiResult = await safeResolveByDoi(doi, warnings);
    candidates = [...candidates, ...doiResult.candidates];

    if (doiResult.bestCandidate && isHighConfidenceCandidate(doiResult.bestCandidate)) {
      const finalItem = finalizeCandidateItem({
        candidate: doiResult.bestCandidate,
        candidates,
        fileName: input.fileName,
        localDraft,
        pageFallback,
        warnings: uniqueWarnings([...warnings, ...doiResult.warnings]),
      });

      return {
        finalItem,
        candidates: compactCandidates(dedupeCandidates(candidates)),
        localDraft,
        status: getResolvedStatus(finalItem),
        warnings: finalItem.warnings,
      };
    }

    warnings.push("未能通过 DOI 查询到开放元数据，已尝试使用题名检索或本地草稿。");
  } else {
    warnings.push("未识别到 DOI，系统已尝试通过题名检索。该结果需要人工确认。");
  }

  const titleResult = await safeResolveWithoutDoi(input, warnings);
  candidates = dedupeCandidates([...candidates, ...titleResult.candidates]);

  if (titleResult.bestCandidate) {
    const finalItem = finalizeCandidateItem({
      candidate: titleResult.bestCandidate,
      candidates,
      fileName: input.fileName,
      localDraft,
      pageFallback,
      warnings: uniqueWarnings([...warnings, ...titleResult.warnings]),
    });

    return {
      finalItem,
      candidates: compactCandidates(candidates),
      localDraft,
      status: getResolvedStatus(finalItem),
      warnings: finalItem.warnings,
    };
  }

  const finalItem = finalizeLocalDraft({
    candidates,
    localDraft: titleResult.localDraft ?? localDraft,
    pageFallback: buildPageFallback(titleResult.localDraft ?? localDraft, firstPagesText, fullText),
    warnings: uniqueWarnings([...warnings, ...titleResult.warnings]),
  });

  return {
    finalItem,
    candidates: compactCandidates(candidates),
    localDraft: titleResult.localDraft ?? localDraft,
    status: "needs_review",
    warnings: finalItem.warnings,
  };
}

async function resolveChinesePaperMetadata(
  input: ResolvePaperMetadataInput,
  firstPagesText: string,
  fullText: string,
  doi: string | undefined,
): Promise<ResolvePaperMetadataResult> {
  const zhDraft = extractZhPaperMetadata({
    fileName: input.fileName,
    firstPagesText,
    fullText,
    doi,
  });
  const pageFallback = buildPageFallback(zhDraft, firstPagesText, fullText);
  const printedPdfRisk = detectPrintedPdfRisk({
    firstPagesText,
    fullText,
    pdfMetadataText: input.pdfMetadataText,
    hasDoi: Boolean(doi),
  });
  const warnings: string[] = printedPdfRisk ? [getPrintedPdfWarning()] : [];
  let candidates: MetadataCandidate[] = [];

  if (doi) {
    const doiResult = await safeResolveByDoi(doi, warnings);
    candidates = [...candidates, ...doiResult.candidates];

    if (doiResult.bestCandidate && isHighConfidenceCandidate(doiResult.bestCandidate)) {
      const finalItem = finalizeCandidateItem({
        candidate: doiResult.bestCandidate,
        candidates,
        fileName: input.fileName,
        localDraft: zhDraft,
        pageFallback,
        warnings: uniqueWarnings([...warnings, ...doiResult.warnings]),
      });

      return {
        finalItem,
        candidates: compactCandidates(dedupeCandidates(candidates)),
        localDraft: zhDraft,
        status: getResolvedStatus(finalItem),
        warnings: finalItem.warnings,
      };
    }

    warnings.push("未能通过 DOI 查询到开放元数据，已尝试使用题名检索或本地草稿。");
  } else {
    warnings.push("未识别到 DOI，系统已尝试通过题名检索。该结果需要人工确认。");
  }

  const finalItem = finalizeLocalDraft({
    candidates,
    localDraft: {
      ...zhDraft,
      matchedBy: doi ? "doi_unresolved" : "local_zh_parse",
      doi: doi ?? zhDraft.doi,
    },
    pageFallback,
    warnings: uniqueWarnings([
      ...warnings,
      "中文文献开放元数据可能不完整，已生成本地解析草稿，请人工核对题名、作者、期刊、年份、卷期页码。",
    ]),
  });

  return {
    finalItem,
    candidates: compactCandidates(dedupeCandidates(candidates)),
    localDraft: zhDraft,
    status: "needs_review",
    warnings: finalItem.warnings,
  };
}

async function safeResolveByDoi(
  doi: string,
  warnings: string[],
): Promise<{
  bestCandidate: MetadataCandidate | null;
  candidates: MetadataCandidate[];
  warnings: string[];
}> {
  try {
    return await resolveByDoi(doi);
  } catch {
    warnings.push("英文开放元数据查询失败。请稍后重试，或手动编辑字段。");
    return { bestCandidate: null, candidates: [], warnings: [] };
  }
}

async function safeResolveWithoutDoi(
  input: ResolvePaperMetadataInput,
  warnings: string[],
) {
  try {
    return await resolveWithoutDoi(input);
  } catch {
    warnings.push("英文开放元数据查询失败。请稍后重试，或手动编辑字段。");
    const localDraft = createLocalDraft(
      input,
      normalizeText(input.firstPagesText),
      normalizeText(input.fullText ?? ""),
    );

    return {
      bestCandidate: null,
      candidates: [],
      localDraft,
      warnings: [],
    };
  }
}

function createLocalDraft(
  input: ResolvePaperMetadataInput,
  firstPagesText: string,
  fullText: string,
): ReferenceItem {
  const item = extractPaperMetadata({
    fileName: input.fileName,
    fileType: inferFileType(input.fileName),
    fullText,
    frontText: firstPagesText,
  });

  return enhanceChineseReferenceDraft({
    fileName: input.fileName,
    firstPagesText,
    fullText,
    item,
  });
}

function createEmptyDraft(fileName: string, warnings: string[]): ReferenceItem {
  const id = `failed-${hashString(fileName)}`;

  return {
    id,
    rawText: "",
    sourceFileName: fileName,
    sourceFileType: inferFileType(fileName),
    originalFileName: fileName,
    type: "unknown",
    authors: [],
    year: null,
    title: null,
    sourceTitle: null,
    volume: null,
    issue: null,
    pages: null,
    publisher: null,
    place: null,
    doi: null,
    url: null,
    accessDate: null,
    language: "unknown",
    metadataSource: "pdf",
    confidence: 0,
    matchedBy: "none",
    needsReview: true,
    extractionWarning: warnings.join(" "),
    warnings,
  };
}

function finalizeCandidateItem(input: {
  candidate: MetadataCandidate;
  candidates: MetadataCandidate[];
  fileName: string;
  localDraft: ReferenceItem;
  pageFallback: PageMetadata;
  warnings: string[];
}): ReferenceItem {
  const item = mergePageMetadataIntoReference(input.candidate.item, input.pageFallback);
  const warnings = pruneWarningsByFields(item, uniqueWarnings([
    ...item.warnings,
    ...input.warnings,
    ...buildCompletenessWarnings(item),
  ]));
  const needsReview =
    input.candidate.confidence < 0.85 ||
    !hasMinimumFields(item) ||
    item.warnings.length > 0;

  return {
    ...compactReferenceItem(item),
    id: input.localDraft.id,
    rawText: item.rawText || input.localDraft.rawText,
    sourceFileName: input.fileName,
    sourceFileType: input.localDraft.sourceFileType,
    originalFileName: input.fileName,
    candidates: compactCandidates(dedupeCandidates(input.candidates)),
    needsReview,
    extractionWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
    warnings,
  };
}

function finalizeLocalDraft(input: {
  candidates: MetadataCandidate[];
  localDraft: ReferenceItem;
  pageFallback?: PageMetadata;
  warnings: string[];
}): ReferenceItem {
  const localDraft = input.pageFallback
    ? mergePageMetadataIntoReference(input.localDraft, input.pageFallback)
    : input.localDraft;
  const warnings = pruneWarningsByFields(localDraft, uniqueWarnings([
    ...localDraft.warnings,
    ...input.warnings,
    ...buildCompletenessWarnings(localDraft),
    ...(!localDraft.title || localDraft.authors.length === 0 || !localDraft.year ? [getManualRecoveryWarning()] : []),
  ]));

  return {
    ...localDraft,
    candidates: compactCandidates(dedupeCandidates(input.candidates)),
    metadataSource: input.localDraft.metadataSource ?? "pdf",
    needsReview: true,
    extractionWarning: warnings.join(" "),
    warnings,
  };
}

function buildPageFallback(
  localDraft: ReferenceItem,
  firstPagesText: string,
  fullText: string,
): PageMetadata {
  const localPages = getPagesOrArticleNumber(localDraft);
  void fullText;
  const textPages = extractPagesFromText(firstPagesText);

  return {
    pages: localPages.pages ?? textPages.pages,
    articleNumber: localPages.articleNumber ?? (!localPages.pages ? textPages.articleNumber : null),
  };
}

function applyExtractedDoi(item: ReferenceItem, doi: string | undefined): ReferenceItem {
  if (!doi) {
    return item;
  }

  const warnings = item.warnings.filter(
    (warning) => !/未识别到 DOI|DOI.*未识别|no doi/i.test(warning),
  );

  return {
    ...item,
    doi,
    confidence: Math.min(1, Number(((item.confidence ?? 0.4) + 0.15).toFixed(2))),
    matchedBy: "doi",
    warnings,
    extractionWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}

function compactCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    item: compactReferenceItem(candidate.item),
    raw: undefined,
  }));
}

function compactReferenceItem(item: ReferenceItem): ReferenceItem {
  return {
    ...item,
    rawMetadata: undefined,
    candidates: undefined,
  };
}

function isHighConfidenceCandidate(candidate: MetadataCandidate): boolean {
  return candidate.confidence >= 0.85 && hasCoreFields(candidate.item);
}

function getResolvedStatus(item: ReferenceItem): ResolvePaperMetadataStatus {
  if (!hasMinimumFields(item)) {
    return "needs_review";
  }

  if (
    item.metadataSource !== "pdf" &&
    typeof item.confidence === "number" &&
    item.confidence >= 0.85
  ) {
    return "success";
  }

  return item.needsReview ? "needs_review" : "success";
}

function hasCoreFields(item: ReferenceItem): boolean {
  return Boolean(item.title && item.authors.length > 0 && item.year);
}

function hasMinimumFields(item: ReferenceItem): boolean {
  return hasCoreFields(item) && (item.type !== "journal" || Boolean(item.sourceTitle));
}

function buildCompletenessWarnings(item: ReferenceItem): string[] {
  const warnings: string[] = [];

  if (!item.title) {
    warnings.push("缺少题名，建议人工补充。");
  }

  if (item.authors.length === 0) {
    warnings.push("缺少作者，建议人工补充。");
  }

  if (!item.year) {
    warnings.push("缺少年份，建议人工补充。");
  }

  if (item.type === "journal" && !item.sourceTitle) {
    warnings.push("缺少期刊名，建议人工补充。");
  }

  return warnings;
}

function pruneWarningsByFields(item: ReferenceItem, warnings: string[]): string[] {
  return warnings.filter((warning) => {
    if (item.title && /题名|标题/.test(warning) && /未能|缺少|未识别/.test(warning)) {
      return false;
    }

    if (item.authors.length > 0 && /作者/.test(warning) && /未能|缺少|未识别/.test(warning)) {
      return false;
    }

    if (item.year && /年份|年/.test(warning) && /未能|缺少|未识别/.test(warning)) {
      return false;
    }

    if (item.sourceTitle && /期刊名|来源/.test(warning) && /未能|缺少|未识别/.test(warning)) {
      return false;
    }

    if (item.doi && /未识别到 DOI|未能.*DOI/.test(warning)) {
      return false;
    }

    return true;
  });
}

function dedupeCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  const seen = new Set<string>();
  const result: MetadataCandidate[] = [];

  for (const candidate of candidates) {
    const key =
      candidate.item.doi?.toLowerCase() ??
      `${candidate.source}:${normalizeKey(candidate.item.title ?? "")}:${candidate.item.year ?? ""}`;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result.sort((first, second) => second.confidence - first.confidence);
}

function inferFileType(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "pdf";
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}

function uniqueWarnings(warnings: string[]): string[] {
  return Array.from(
    new Set(warnings.map((warning) => warning.trim()).filter(Boolean)),
  );
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
