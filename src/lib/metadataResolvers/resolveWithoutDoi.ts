import "server-only";

import { extractPaperMetadata } from "../extractPaperMetadata";
import { enhanceChineseReferenceDraft } from "../chineseReferenceHeuristics";
import { extractDoiCandidates, pickBestDoi } from "../doiUtils";
import type {
  MetadataCandidate,
  MetadataMatchMethod,
  ReferenceItem,
} from "../referenceTypes";
import {
  detectPrintedPdfRisk,
  extractBibliographicClues,
  getManualRecoveryWarning,
  getPrintedPdfWarning,
  type BibliographicClues,
} from "../titleUtils";
import { scoreMetadataCandidate, titleSimilarity } from "./scoring";
import { searchMetadataByTitle } from "./searchByTitle";

export type ResolveWithoutDoiInput = {
  fileName: string;
  firstPagesText: string;
  fullText?: string;
  pdfMetadataText?: string;
};

export type ResolveWithoutDoiResult = {
  bestCandidate: MetadataCandidate | null;
  candidates: MetadataCandidate[];
  localDraft: ReferenceItem;
  warnings: string[];
};

export type ResolveWithoutDoiDevSample = {
  name: string;
  input: ResolveWithoutDoiInput;
  expectedTitleCandidate?: string;
};

export const resolveWithoutDoiDevSamples: ResolveWithoutDoiDevSample[] = [
  {
    name: "English article with clear title",
    input: {
      fileName: "clear-english-paper.pdf",
      firstPagesText:
        "Lifecycle carbon footprints of buildings and sustainability pathways in China\nYing Zhou, Xiaoyu Yu, X Zhang\nAbstract\nThis paper studies building carbon footprints.",
    },
    expectedTitleCandidate:
      "Lifecycle carbon footprints of buildings and sustainability pathways in China",
  },
  {
    name: "Chinese article with clear title",
    input: {
      fileName: "建筑碳排放研究.pdf",
      firstPagesText:
        "城市建筑全生命周期碳排放核算方法研究\n张三 李四\n摘要\n本文研究建筑碳排放核算方法。",
    },
    expectedTitleCandidate: "城市建筑全生命周期碳排放核算方法研究",
  },
  {
    name: "Messy front page with useful filename",
    input: {
      fileName: "A review of building lifecycle carbon emissions.pdf",
      firstPagesText:
        "Energy and Buildings\nVol. 128\nDepartment of Architecture\nAbstract\nNo readable title area.",
    },
    expectedTitleCandidate: "A review of building lifecycle carbon emissions",
  },
  {
    name: "Title only without authors",
    input: {
      fileName: "title-only.pdf",
      firstPagesText:
        "Deep retrofitting strategies for low carbon buildings\nAbstract\nThe article discusses energy renovation.",
    },
    expectedTitleCandidate: "Deep retrofitting strategies for low carbon buildings",
  },
  {
    name: "No candidate text",
    input: {
      fileName: "unknown-source.pdf",
      firstPagesText: "",
    },
    expectedTitleCandidate: "unknown-source",
  },
];

export async function resolveWithoutDoi(
  input: ResolveWithoutDoiInput,
): Promise<ResolveWithoutDoiResult> {
  const clues = extractBibliographicClues({
    fileName: input.fileName,
    firstPagesText: input.firstPagesText,
    fullText: input.fullText,
    pdfMetadataText: input.pdfMetadataText,
  });
  const localDraft = createLocalDraft(input, clues);
  const printedPdfRisk = clues.isLikelyPrintedPdf ||
    detectPrintedPdfRisk({
      firstPagesText: input.firstPagesText,
      fullText: input.fullText,
      pdfMetadataText: input.pdfMetadataText,
    });
  const warnings = printedPdfRisk
    ? [...clues.warnings, getPrintedPdfWarning()]
    : [...clues.warnings];

  if (clues.titleCandidates.length === 0) {
    warnings.push("没有可用于开放元数据检索的题名候选，已生成低置信度本地草稿。");
    return {
      bestCandidate: null,
      candidates: [],
      localDraft,
      warnings: uniqueWarnings(warnings),
    };
  }

  const candidates: MetadataCandidate[] = [];
  for (const title of clues.titleCandidates.slice(0, 3)) {
    try {
      const searchedCandidates = await searchMetadataByTitle({
        title,
        authors: clues.authorCandidates,
        year: clues.yearCandidates[0],
      });
      candidates.push(...searchedCandidates);
    } catch {
      warnings.push("题名开放元数据检索失败，已保留本地草稿供人工编辑。");
    }
  }

  const scoredCandidates = sortAndScoreCandidates(
    dedupeCandidates(candidates),
    clues,
  );
  const bestCandidate =
    scoredCandidates.length > 0 && scoredCandidates[0].confidence >= 0.85
      ? scoredCandidates[0]
      : null;

  if (!bestCandidate) {
    warnings.push("未找到高置信度开放元数据候选，已生成低置信度本地草稿。");
  }

  return {
    bestCandidate,
    candidates: scoredCandidates,
    localDraft,
    warnings: uniqueWarnings(warnings),
  };
}

function createLocalDraft(
  input: ResolveWithoutDoiInput,
  clues: BibliographicClues,
): ReferenceItem {
  const fullText = input.fullText ?? input.firstPagesText;
  const extractedDoi = pickBestDoi(
    extractDoiCandidates([input.firstPagesText, fullText].join("\n")),
    input.firstPagesText,
  );
  const draft = applyExtractedDoi(enhanceChineseReferenceDraft({
    fileName: input.fileName,
    firstPagesText: input.firstPagesText,
    fullText,
    item: extractPaperMetadata({
    fileName: input.fileName,
    fileType: inferFileType(input.fileName),
    fullText,
    frontText: input.firstPagesText,
    metadataTitle: clues.titleCandidates[0],
    }),
  }), extractedDoi);
  const titleFromFileName = clues.warnings.some((warning) =>
    warning.includes("题名可能来自文件名"),
  );
  const confidence = titleFromFileName ? 0.3 : Math.min(draft.confidence ?? 0.45, 0.55);
  const warnings = uniqueWarnings([
    ...draft.warnings,
    ...clues.warnings,
    "本地 PDF 文本识别仅作为草稿，建议优先核对开放元数据候选或手动编辑。",
  ]);

  return {
    ...draft,
    metadataSource: "pdf",
    confidence,
    matchedBy: draft.doi ? "doi" : titleFromFileName ? "filename" : "title",
    needsReview: true,
    extractionWarning: warnings.join(" "),
    warnings,
  };
}

function applyExtractedDoi(item: ReferenceItem, doi: string | undefined): ReferenceItem {
  if (!doi) {
    return item;
  }

  return {
    ...item,
    doi,
    confidence: Math.min(1, Number(((item.confidence ?? 0.4) + 0.15).toFixed(2))),
    matchedBy: "doi",
  };
}

function sortAndScoreCandidates(
  candidates: MetadataCandidate[],
  clues: BibliographicClues,
): MetadataCandidate[] {
  return candidates
    .map((candidate) => {
      const aggregateConfidence = scoreMetadataCandidate({
        candidate: candidate.item,
        extracted: clues,
      });
      const maxTitleSimilarity = getMaxTitleSimilarity(candidate.item.title, clues.titleCandidates);
      const titleConfidence = maxTitleSimilarity >= 0.85
        ? Math.min(0.96, maxTitleSimilarity * 0.86 + completenessBonus(candidate.item))
        : aggregateConfidence;
      const confidence = Number(Math.max(aggregateConfidence, titleConfidence).toFixed(2));
      const matchedBy: MetadataMatchMethod =
        clues.authorCandidates.length > 0 || clues.yearCandidates.length > 0
          ? "title_author_year"
          : "title";
      const warnings = uniqueWarnings([
        ...(candidate.warnings ?? []),
        ...(confidence < 0.9 ? ["题名检索候选需要用户确认。"] : []),
      ]);
      const item: ReferenceItem = {
        ...candidate.item,
        confidence,
        matchedBy,
        needsReview: confidence < 0.9 || candidate.item.needsReview,
        extractionWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
        warnings,
      };

      return {
        ...candidate,
        confidence,
        matchedBy,
        item,
        warnings,
      };
    })
    .filter((candidate) => candidate.confidence >= 0.45)
    .sort((first, second) => second.confidence - first.confidence);
}

function getMaxTitleSimilarity(title: string | null | undefined, titleCandidates: string[]): number {
  if (!title) {
    return 0;
  }

  return Math.max(
    0,
    ...titleCandidates.map((candidate) => titleSimilarity(title, candidate)),
  );
}

function completenessBonus(item: ReferenceItem): number {
  let bonus = 0.03;

  if (item.authors.length > 0) {
    bonus += 0.02;
  }

  if (item.year) {
    bonus += 0.02;
  }

  if (item.sourceTitle) {
    bonus += 0.02;
  }

  return bonus;
}

function dedupeCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  const seen = new Set<string>();
  const result: MetadataCandidate[] = [];

  for (const candidate of candidates) {
    const key =
      candidate.item.doi?.toLowerCase() ??
      normalizeKey(`${candidate.item.title ?? ""}:${candidate.item.year ?? ""}`);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function inferFileType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension || "pdf";
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
