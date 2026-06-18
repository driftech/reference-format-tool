"use client";

import type { ChangeEvent, ClipboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import {
  detectDuplicateReferences,
  type DuplicateReferenceResult,
} from "@/lib/detectDuplicateReferences";
import { extractTextFromFile } from "@/lib/extractTextFromFile";
import { sourceFileAccept } from "@/lib/fileTypes";
import {
  formatAuthors,
  formatAPA7,
  formatGB7714,
  formatPreviewValue,
  formatReferences,
} from "@/lib/formatReferences";
import {
  parseReferences,
  referenceParserSampleInput,
} from "@/lib/parseReferences";
import {
  referenceLanguageLabels,
  referenceTypeLabels,
  type MetadataCandidate,
  type ReferenceItem,
  type ReferenceType,
} from "@/lib/referenceTypes";
import type { ResolvePaperMetadataResult } from "@/lib/metadataResolvers/resolvePaperMetadata";
import {
  createUploadedSourceFile,
  sourceFileStatusClassNames,
  sourceFileStatusLabels,
  type UploadedSourceFile,
} from "@/lib/uploadedSourceFileTypes";
import {
  validateReferences,
  type ReferenceValidationResult,
} from "@/lib/validateReferences";
import { buildChineseSearchLinks } from "@/lib/chineseSearchLinks";
import { buildBibTeX, buildRis, downloadTextFile } from "@/lib/exportReferences";
import {
  matchImportedCitationsToPdfItems,
  type ImportedCitationMatch,
} from "@/lib/matchImportedCitations";
import { parseChineseBibliographyBatch } from "@/lib/parseChineseBibliographyBatch";
import { parseChineseCitationText } from "@/lib/parseChineseCitation";
import {
  detectDuplicateReferenceGroups,
  sortReferenceItems,
  type ReferenceSortMode,
} from "@/lib/referenceListUtils";

type FormatOption = {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
};

type EditableReferenceField =
  | "type"
  | "authors"
  | "year"
  | "title"
  | "sourceTitle"
  | "volume"
  | "issue"
  | "pages"
  | "articleNumber"
  | "doi"
  | "url"
  | "publisher"
  | "place";

type QualityStatus = "passed" | "review" | "missing" | "duplicate";

const formatOptions: FormatOption[] = [
  {
    id: "gbt-7714",
    title: "国内期刊",
    description: "GB/T 7714-2015 顺序编码制",
  },
  {
    id: "apa-7",
    title: "国外期刊",
    description: "APA 7th",
  },
  {
    id: "ieee",
    title: "IEEE",
    description: "后续支持",
    disabled: true,
  },
  {
    id: "chicago",
    title: "Chicago",
    description: "后续支持",
    disabled: true,
  },
  {
    id: "mla",
    title: "MLA",
    description: "后续支持",
    disabled: true,
  },
  {
    id: "vancouver",
    title: "Vancouver",
    description: "后续支持",
    disabled: true,
  },
];

const textExtractionStatusLabels: Record<
  UploadedSourceFile["textExtractionStatus"],
  string
> = {
  idle: "未提取",
  extracting: "提取中",
  success: "提取成功",
  failed: "提取失败",
};

const textExtractionStatusClassNames: Record<
  UploadedSourceFile["textExtractionStatus"],
  string
> = {
  idle: "bg-slate-200 text-slate-700",
  extracting: "bg-blue-100 text-blue-800",
  success: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

const metadataStatusLabels: Record<UploadedSourceFile["metadataStatus"], string> = {
  idle: "未识别",
  success: "成功",
  review: "需要检查",
  failed: "失败",
};

const metadataStatusClassNames: Record<
  UploadedSourceFile["metadataStatus"],
  string
> = {
  idle: "bg-slate-200 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
};

const qualityStatusLabels: Record<QualityStatus, string> = {
  passed: "通过",
  review: "需要检查",
  missing: "信息缺失",
  duplicate: "疑似重复",
};

const qualityStatusClassNames: Record<QualityStatus, string> = {
  passed: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-800",
  missing: "bg-orange-100 text-orange-800",
  duplicate: "bg-violet-100 text-violet-800",
};

export function ReferenceFormatTool() {
  const [inputText, setInputText] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("gbt-7714");
  const [manualStartIndexInput, setManualStartIndexInput] = useState("1");
  const [resultText, setResultText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [sourceSelectedFormat, setSourceSelectedFormat] = useState("gbt-7714");
  const [sourceStartIndexInput, setSourceStartIndexInput] = useState("1");
  const [referenceSortMode, setReferenceSortMode] =
    useState<ReferenceSortMode>("upload");
  const [sourceResultText, setSourceResultText] = useState("");
  const [sourceStatusMessage, setSourceStatusMessage] = useState("");
  const [sourceCopyMessage, setSourceCopyMessage] = useState("");
  const [uploadedSourceFiles, setUploadedSourceFiles] = useState<UploadedSourceFile[]>([]);
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [citationSupplementTexts, setCitationSupplementTexts] = useState<
    Record<string, string>
  >({});
  const [citationSupplementMessages, setCitationSupplementMessages] = useState<
    Record<string, string>
  >({});
  const [chineseBibliographyText, setChineseBibliographyText] = useState("");
  const [chineseBibliographyMessage, setChineseBibliographyMessage] = useState("");
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const bibliographyFileInputRef = useRef<HTMLInputElement>(null);

  const parsedReferences = useMemo(() => parseReferences(inputText), [inputText]);
  const referenceCount = parsedReferences.length;
  const sourceReferenceItems = useMemo(
    () =>
      uploadedSourceFiles
        .map((file) => file.referenceItem)
        .filter((reference): reference is ReferenceItem => Boolean(reference)),
    [uploadedSourceFiles],
  );
  const sourceValidationResults = useMemo(
    () => validateReferences(sourceReferenceItems, sourceSelectedFormat),
    [sourceReferenceItems, sourceSelectedFormat],
  );
  const duplicateResults = useMemo(
    () => detectDuplicateReferences(sourceReferenceItems),
    [sourceReferenceItems],
  );
  const duplicateGroupResult = useMemo(
    () => detectDuplicateReferenceGroups(sourceReferenceItems),
    [sourceReferenceItems],
  );
  const orderedSourceReferenceItems = useMemo(
    () => sortReferenceItems(sourceReferenceItems, referenceSortMode),
    [referenceSortMode, sourceReferenceItems],
  );
  const importedChineseItems = useMemo(
    () => parseChineseBibliographyBatch(chineseBibliographyText),
    [chineseBibliographyText],
  );
  const importedChineseMatchResult = useMemo(
    () =>
      matchImportedCitationsToPdfItems({
        pdfItems: sourceReferenceItems,
        importedItems: importedChineseItems,
      }),
    [importedChineseItems, sourceReferenceItems],
  );
  const validationByReferenceId = useMemo(
    () =>
      new Map(
        sourceValidationResults.map((result) => [result.referenceId, result]),
      ),
    [sourceValidationResults],
  );
  const duplicatesByReferenceId = useMemo(
    () => buildDuplicatesByReferenceId(duplicateResults),
    [duplicateResults],
  );

  const uploadSummary = useMemo(
    () => {
      const duplicateIds = new Set(
        duplicateResults.flatMap((duplicate) => duplicate.referenceIds),
      );

      return uploadedSourceFiles.reduce(
        (summary, file) => {
          const reference = file.referenceItem;
          const validation = reference
            ? validationByReferenceId.get(reference.id)
            : undefined;
          const qualityStatus = reference
            ? getQualityStatus(validation, duplicateIds.has(reference.id))
            : undefined;

          return {
            total: summary.total + 1,
            recognized:
              summary.recognized + (file.referenceItem ? 1 : 0),
            needsReview:
              summary.needsReview +
              (qualityStatus === "review" || qualityStatus === "missing" ? 1 : 0),
            duplicates:
              summary.duplicates + (qualityStatus === "duplicate" ? 1 : 0),
            failed:
              summary.failed +
              (file.status !== "supported" || file.metadataStatus === "failed"
                ? 1
                : 0),
            missingAuthors:
              summary.missingAuthors +
              (reference && reference.authors.length === 0 ? 1 : 0),
            missingYears:
              summary.missingYears + (reference && !reference.year ? 1 : 0),
            missingTitles:
              summary.missingTitles + (reference && !reference.title ? 1 : 0),
          };
        },
        {
          duplicates: 0,
          failed: 0,
          missingAuthors: 0,
          missingTitles: 0,
          missingYears: 0,
          needsReview: 0,
          recognized: 0,
          total: 0,
        },
      );
    },
    [duplicateResults, uploadedSourceFiles, validationByReferenceId],
  );
  const isExtractingText = uploadedSourceFiles.some(
    (file) => file.textExtractionStatus === "extracting",
  );

  const handleSourceFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    setUploadedSourceFiles((currentFiles) => [
      ...currentFiles,
      ...files.map((file) => createUploadedSourceFile(file)),
    ]);
    setStatusMessage(`已加入 ${files.length} 个文件。可在上传队列中执行文本提取。`);
    setSourceStatusMessage("");
    setCopyMessage("");
    event.target.value = "";
  };

  const handleRemoveSourceFile = (fileId: string) => {
    setUploadedSourceFiles((currentFiles) =>
      currentFiles.filter((file) => file.id !== fileId),
    );
    setExpandedPreviewIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(fileId);
      return nextIds;
    });
    setSourceResultText("");
    setSourceCopyMessage("");
    setCitationSupplementTexts((current) => removeRecordKey(current, fileId));
    setCitationSupplementMessages((current) => removeRecordKey(current, fileId));
  };

  const handleRemoveReferenceRecord = (referenceId: string) => {
    const file = uploadedSourceFiles.find(
      (sourceFile) => sourceFile.referenceItem?.id === referenceId,
    );

    if (file) {
      handleRemoveSourceFile(file.id);
    }
  };

  const handleClearSourceFiles = () => {
    setUploadedSourceFiles([]);
    setExpandedPreviewIds(new Set());
    setSourceResultText("");
    setSourceStatusMessage("");
    setSourceCopyMessage("");
    setCitationSupplementTexts({});
    setCitationSupplementMessages({});

    if (sourceFileInputRef.current) {
      sourceFileInputRef.current.value = "";
    }
  };

  const handleUpdateReferenceField = (
    fileId: string,
    field: EditableReferenceField,
    value: string,
  ) => {
    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) => {
        if (file.id !== fileId || !file.referenceItem) {
          return file;
        }

        const nextReference =
          field === "authors"
            ? {
                ...file.referenceItem,
                authors: parseEditableAuthors(value),
              }
            : {
                ...file.referenceItem,
                [field]: normalizeEditableValue(field, value),
              };
        const nextReferenceWithWarnings = {
          ...nextReference,
          metadataSource: "manual" as const,
          matchedBy: "manual" as const,
          needsReview: getManualMetadataStatus(nextReference) !== "success",
          warnings: getWarningsAfterEdit(nextReference, field),
        };

        return {
          ...file,
          metadataStatus: getManualMetadataStatus(nextReferenceWithWarnings),
          referenceItem: nextReferenceWithWarnings,
        };
      }),
    );
    setSourceResultText("");
    setSourceCopyMessage("");
  };

  const handleUseMetadataCandidate = (
    fileId: string,
    candidateId: string,
  ) => {
    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) => {
        if (file.id !== fileId || !file.referenceItem) {
          return file;
        }

        const candidate = file.referenceItem.candidates?.find(
          (item) => item.id === candidateId,
        );

        if (!candidate) {
          return file;
        }

        const referenceItem = {
          ...candidate.item,
          id: file.referenceItem.id,
          sourceFileName: file.fileName,
          sourceFileType: file.fileType,
          originalFileName: file.fileName,
          candidates: file.referenceItem.candidates,
          needsReview:
            candidate.confidence < 0.9 ||
            !candidate.item.title ||
            candidate.item.authors.length === 0 ||
            !candidate.item.year ||
            (candidate.item.type === "journal" && !candidate.item.sourceTitle),
          warnings: candidate.warnings ?? candidate.item.warnings,
        };

        return {
          ...file,
          metadataStatus: getManualMetadataStatus(referenceItem),
          referenceItem,
        };
      }),
    );
    setSourceResultText("");
    setSourceCopyMessage("");
    setSourceStatusMessage("已采用候选结果，请继续核对并生成参考文献列表。");
  };

  const handleChineseCitationTextChange = (fileId: string, value: string) => {
    setCitationSupplementTexts((current) => ({
      ...current,
      [fileId]: value,
    }));
    setCitationSupplementMessages((current) => removeRecordKey(current, fileId));
  };

  const handleApplyChineseCitation = (fileId: string) => {
    const text = citationSupplementTexts[fileId]?.trim() ?? "";

    if (!text) {
      setCitationSupplementMessages((current) => ({
        ...current,
        [fileId]: "请先粘贴一条中文引用格式。",
      }));
      return;
    }

    const parsed = parseChineseCitationText(text);
    if (!hasParsedCitationFields(parsed)) {
      setCitationSupplementMessages((current) => ({
        ...current,
        [fileId]: "未能解析该引用格式，请手动修改字段。",
      }));
      return;
    }

    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) => {
        if (file.id !== fileId || !file.referenceItem) {
          return file;
        }

        const referenceItem = mergeReferenceItem(file.referenceItem, parsed, {
          confidence: 0.9,
          matchedBy: "manual",
          metadataSource: "manual",
          needsReview: false,
          warnings: ["请根据原文或数据库记录核对。"],
        });

        return {
          ...file,
          metadataStatus: getManualMetadataStatus(referenceItem),
          referenceItem,
        };
      }),
    );
    setSourceResultText("");
    setSourceCopyMessage("");
    setCitationSupplementMessages((current) => ({
      ...current,
      [fileId]: "已解析并覆盖当前字段，请继续核对。",
    }));
  };

  const handleChineseBibliographyFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setChineseBibliographyText(text);
      setChineseBibliographyMessage(`已读取题录文本：${file.name}`);
    } catch {
      setChineseBibliographyMessage("题录文本读取失败，请改为直接粘贴。");
    } finally {
      event.target.value = "";
    }
  };

  const handleApplyImportedCitationMatches = () => {
    const autoMatches = importedChineseMatchResult.matches.filter(
      (match) => match.status === "auto",
    );

    if (autoMatches.length === 0) {
      setChineseBibliographyMessage("暂无可批量采用的自动匹配结果。");
      return;
    }

    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) => {
        if (!file.referenceItem) {
          return file;
        }

        const match = autoMatches.find(
          (item) => item.pdfItemId === file.referenceItem?.id,
        );
        const importedItem = match
          ? importedChineseItems.find((item) => item.id === match.importedItemId)
          : undefined;

        if (!match || !importedItem) {
          return file;
        }

        const referenceItem = mergeReferenceItem(file.referenceItem, importedItem, {
          confidence: match.score,
          matchedBy: "title_author_year",
          metadataSource: "imported_bibliography",
          needsReview: !hasCompleteReferenceFields(importedItem),
          warnings: hasCompleteReferenceFields(importedItem)
            ? ["已采用导入题录匹配结果，投稿前仍请核对。"]
            : ["导入题录字段仍不完整，请人工核对。"],
        });

        return {
          ...file,
          metadataStatus: getManualMetadataStatus(referenceItem),
          referenceItem,
        };
      }),
    );
    setSourceResultText("");
    setSourceCopyMessage("");
    setChineseBibliographyMessage(`已采用 ${autoMatches.length} 条自动匹配题录。`);
  };

  const handleExtractText = async (fileId: string, progressLabel?: string) => {
    const targetFile = uploadedSourceFiles.find((file) => file.id === fileId);

    if (!targetFile || targetFile.textExtractionStatus === "extracting") {
      return;
    }

    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              textExtractionStatus: "extracting",
              textExtractionResult: undefined,
              metadataStatus: "idle",
              referenceItem: undefined,
            }
          : file,
      ),
    );
    setStatusMessage(progressLabel ?? `正在提取并识别：${targetFile.fileName}`);
    setCopyMessage("");

    const extractionResult = await extractTextFromFile(targetFile.file);
    const metadataResult = await resolvePaperMetadataFromApi({
      extractionError: extractionResult.error,
      extractionSuccess: extractionResult.success,
      fileName: targetFile.fileName,
      firstPagesText: extractionResult.frontText,
      fullText: extractionResult.fullText,
    });
    const referenceItemWithSource = {
      ...metadataResult.finalItem,
      sourceFileName: targetFile.fileName,
      sourceFileType: targetFile.fileType,
      originalFileName: targetFile.fileName,
      candidates: metadataResult.candidates,
      warnings: Array.from(
        new Set([
          ...metadataResult.finalItem.warnings,
          ...metadataResult.warnings,
          ...(extractionResult.error ? [extractionResult.error] : []),
        ]),
      ),
    };
    const metadataStatus = mapResolvedMetadataStatus(metadataResult.status);

    setUploadedSourceFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              textExtractionStatus: extractionResult.success ? "success" : "failed",
              textExtractionResult: extractionResult,
              metadataStatus,
              referenceItem: referenceItemWithSource,
            }
          : file,
      ),
    );
    setStatusMessage(
      extractionResult.success
        ? `已提取并生成 1 条识别记录：${targetFile.fileName}`
        : `文件无法读取，已生成需手动补充记录：${targetFile.fileName}`,
    );
  };

  const handleExtractAllText = async () => {
    if (uploadedSourceFiles.length === 0 || isExtractingText) {
      return;
    }

    const filesToExtract = [...uploadedSourceFiles];

    for (let index = 0; index < filesToExtract.length; index += 1) {
      const sourceFile = filesToExtract[index];
      await handleExtractText(
        sourceFile.id,
        `正在识别第 ${index + 1} / ${filesToExtract.length} 篇：${sourceFile.fileName}`,
      );
    }

    setStatusMessage(`批量识别完成：共处理 ${filesToExtract.length} 篇文件。`);
  };

  const handleTogglePreview = (fileId: string) => {
    setExpandedPreviewIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(fileId)) {
        nextIds.delete(fileId);
      } else {
        nextIds.add(fileId);
      }

      return nextIds;
    });
  };

  const handleConvert = () => {
    if (parsedReferences.length === 0) {
      setResultText("");
      setCopyMessage("");
      setStatusMessage("请先在文本转换区输入已有参考文献文本。");
      return;
    }

    const startIndex = parseStartIndexInput(manualStartIndexInput);
    setManualStartIndexInput(String(startIndex));
    setResultText(formatReferences(parsedReferences, selectedFormat, { startIndex }));
    setCopyMessage("");
    setStatusMessage(
      selectedFormat === "gbt-7714"
        ? `已生成 ${parsedReferences.length} 条 GB/T 7714-2015 格式结果。`
        : selectedFormat === "apa-7"
          ? `已生成 ${parsedReferences.length} 条 APA 7th 格式结果。`
          : `已解析并生成 ${parsedReferences.length} 条占位格式结果。`,
    );
  };

  const handleGenerateSourceReferenceList = () => {
    if (sourceReferenceItems.length === 0) {
      setSourceResultText("");
      setSourceCopyMessage("");
      setSourceStatusMessage("请先上传并识别论文 PDF。");
      return;
    }

    const itemsForOutput = orderedSourceReferenceItems.map(addTitleMissingWarning);
    const startIndex = parseStartIndexInput(sourceStartIndexInput);
    setSourceStartIndexInput(String(startIndex));
    const formatted =
      sourceSelectedFormat === "gbt-7714"
        ? formatGB7714(itemsForOutput, { startIndex })
        : formatAPA7(itemsForOutput);
    const hasIncompleteReferences = orderedSourceReferenceItems.some(
      (reference) =>
        !reference.title || reference.authors.length === 0 || !reference.year,
    );
    const hasReviewReferences = orderedSourceReferenceItems.some(
      (reference) => reference.needsReview,
    );

    if (itemsForOutput.some((item, index) => item !== sourceReferenceItems[index])) {
      setUploadedSourceFiles((currentFiles) =>
        currentFiles.map((file) => {
          if (!file.referenceItem) {
            return file;
          }

          const updatedReference = itemsForOutput.find(
            (item) => item.id === file.referenceItem?.id,
          );

          return updatedReference
            ? { ...file, referenceItem: updatedReference }
            : file;
        }),
      );
    }

    setSourceResultText(formatted);
    setSourceCopyMessage("");
    setSourceStatusMessage(
      hasIncompleteReferences
        ? "部分文献信息不完整，已按现有字段生成，请在投稿前核对。"
        : hasReviewReferences
        ? "部分文献信息需要检查，已按当前字段生成。投稿前请核对。"
        : `已生成 ${orderedSourceReferenceItems.length} 条参考文献。`,
    );
  };

  const handleChangeReferenceSortMode = (nextMode: ReferenceSortMode) => {
    setReferenceSortMode(nextMode);

    if (sourceResultText) {
      const sortedItems = sortReferenceItems(sourceReferenceItems, nextMode).map(
        addTitleMissingWarning,
      );
      const startIndex = parseStartIndexInput(sourceStartIndexInput);
      setSourceStartIndexInput(String(startIndex));
      setSourceResultText(
        sourceSelectedFormat === "gbt-7714"
          ? formatGB7714(sortedItems, { startIndex })
          : formatAPA7(sortedItems),
      );
      setSourceStatusMessage("已按新的排序方式重新生成参考文献列表。");
    }
  };

  const handleDownloadSourceResult = (format: "txt" | "bib" | "ris") => {
    if (orderedSourceReferenceItems.length === 0) {
      setSourceStatusMessage("请先上传并识别论文 PDF。");
      return;
    }

    const items = orderedSourceReferenceItems.map(addTitleMissingWarning);
    const startIndex = parseStartIndexInput(sourceStartIndexInput);
    setSourceStartIndexInput(String(startIndex));
    const content =
      format === "txt"
        ? sourceSelectedFormat === "gbt-7714"
          ? formatGB7714(items, { startIndex })
          : sourceResultText || formatAPA7(items)
        : format === "bib"
          ? buildBibTeX(items)
          : buildRis(items);

    downloadTextFile(`references.${format}`, content);
    setSourceStatusMessage(`已下载 references.${format}。`);
  };

  const handleClearSourceOutput = () => {
    setSourceResultText("");
    setSourceStatusMessage("");
    setSourceCopyMessage("");
  };

  const handleCopySourceResult = async () => {
    if (!sourceResultText) {
      setSourceCopyMessage("暂无可复制的结果。");
      return;
    }

    try {
      await navigator.clipboard.writeText(sourceResultText);
      setSourceCopyMessage("结果已复制。");
    } catch {
      if (copyTextWithFallback(sourceResultText)) {
        setSourceCopyMessage("结果已复制。");
        return;
      }

      setSourceCopyMessage("复制失败，请手动选中结果复制。");
    }
  };

  const handleClear = () => {
    setInputText("");
    setResultText("");
    setStatusMessage("");
    setCopyMessage("");

  };

  const handleCopy = async () => {
    if (!resultText) {
      setCopyMessage("暂无可复制的结果。");
      return;
    }

    try {
      await navigator.clipboard.writeText(resultText);
      setCopyMessage("结果已复制。");
    } catch {
      if (copyTextWithFallback(resultText)) {
        setCopyMessage("结果已复制。");
        return;
      }

      setCopyMessage("复制失败，请手动选中结果复制。");
    }
  };

  const handleLoadSamples = () => {
    setInputText(referenceParserSampleInput);
    setResultText("");
    setStatusMessage("已填入解析测试样例。");
    setCopyMessage("");

  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-7">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            论文文件参考文献生成器
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">
            上传自己参考过的论文文件，系统按“一个 PDF 一条参考文献”的方式识别该文件本身的题名、作者、期刊和年份，生成论文末尾可用的参考文献列表；不会提取 PDF 文末 References / 参考文献章节，也不会生成该论文引用过的文献。
          </p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            DOI 精确匹配通常更可靠；无 DOI 或开放元数据缺失的文献需要人工确认。已有参考文献文本转换入口仍保留在下方，两套入口互不混用状态。
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                论文文件上传队列
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                主流程：PDF 上传 → 文本提取 → DOI 提取 → Crossref / DataCite / OpenAlex 查询 → 无 DOI 或查询失败时题名检索 → 候选结果和置信度 → 用户确认或编辑 → 生成 GB/T 7714 / APA 7th。
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                第一批：.pdf、.docx、.tex、.latex、.md、.txt；第二批：.rtf、.epub；建议先转换：.doc、.caj。
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative inline-flex min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-within:ring-2 focus-within:ring-slate-950 focus-within:ring-offset-2">
                上传论文文件
              <input
                  ref={sourceFileInputRef}
                  type="file"
                  accept={sourceFileAccept}
                  multiple
                  aria-label="上传论文文件"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={handleSourceFileUpload}
                />
              </label>
              <button
                type="button"
                onClick={handleExtractAllText}
                disabled={uploadedSourceFiles.length === 0 || isExtractingText}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {isExtractingText ? "提取中..." : "提取并识别全部"}
              </button>
              <button
                type="button"
                onClick={handleClearSourceFiles}
                disabled={uploadedSourceFiles.length === 0}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                清空全部文件
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <QueueStat label="已上传" value={`${uploadSummary.total} 个`} />
            <QueueStat label="成功识别" value={`${uploadSummary.recognized} 条`} />
            <QueueStat label="需要检查" value={`${uploadSummary.needsReview} 条`} />
            <QueueStat label="失败/不支持" value={`${uploadSummary.failed} 个`} />
            <QueueStat label="缺少作者" value={`${uploadSummary.missingAuthors} 条`} />
            <QueueStat label="缺少年份" value={`${uploadSummary.missingYears} 条`} />
            <QueueStat label="缺少题名" value={`${uploadSummary.missingTitles} 条`} />
            <QueueStat label="疑似重复" value={`${uploadSummary.duplicates} 条`} />
          </div>

          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
            本工具生成结果仅用于辅助整理，自动识别可能不完整。投稿前请以目标期刊、学校或导师要求为准。
          </p>

          {uploadedSourceFiles.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {uploadedSourceFiles.map((sourceFile) => (
                <article
                  key={sourceFile.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-semibold text-slate-900">
                          {sourceFile.fileName}
                        </h3>
                        <span className="rounded-md bg-white px-2 py-1 text-xs font-medium uppercase text-slate-600 ring-1 ring-slate-200">
                          {sourceFile.fileType}
                        </span>
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            sourceFileStatusClassNames[sourceFile.status],
                          ].join(" ")}
                        >
                          {sourceFileStatusLabels[sourceFile.status]}
                        </span>
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            textExtractionStatusClassNames[
                              sourceFile.textExtractionStatus
                            ],
                          ].join(" ")}
                        >
                          {textExtractionStatusLabels[sourceFile.textExtractionStatus]}
                        </span>
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            metadataStatusClassNames[sourceFile.metadataStatus],
                          ].join(" ")}
                        >
                          识别：{metadataStatusLabels[sourceFile.metadataStatus]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        大小：{formatFileSize(sourceFile.size)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {sourceFile.message}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                      <button
                        type="button"
                        onClick={() => handleExtractText(sourceFile.id)}
                        disabled={sourceFile.textExtractionStatus === "extracting"}
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {sourceFile.textExtractionStatus === "extracting"
                          ? "提取中..."
                          : sourceFile.textExtractionStatus === "success"
                            ? "重新提取并识别"
                            : "提取并识别"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveSourceFile(sourceFile.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <FileExtractionSummary
                    sourceFile={sourceFile}
                    expanded={expandedPreviewIds.has(sourceFile.id)}
                    onTogglePreview={() => handleTogglePreview(sourceFile.id)}
                  />
                  <MetadataSummary
                    sourceFile={sourceFile}
                    duplicateResults={
                      sourceFile.referenceItem
                        ? duplicatesByReferenceId.get(sourceFile.referenceItem.id) ?? []
                        : []
                    }
                    validationResult={
                      sourceFile.referenceItem
                        ? validationByReferenceId.get(sourceFile.referenceItem.id)
                        : undefined
                    }
                    citationSupplementText={citationSupplementTexts[sourceFile.id] ?? ""}
                    citationSupplementMessage={citationSupplementMessages[sourceFile.id] ?? ""}
                    onApplyChineseCitation={handleApplyChineseCitation}
                    onChineseCitationTextChange={handleChineseCitationTextChange}
                    onUpdateField={handleUpdateReferenceField}
                    onUseCandidate={handleUseMetadataCandidate}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-7 text-slate-500">
              暂无上传文件。一次可选择多个论文文件，每个文件原则上生成一条识别记录。
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                中文题录批量导入
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                如果中文文献较多，建议先在知网、万方、维普中批量检索并导出 GB/T 7714 / EndNote / RIS / BibTeX / NoteExpress 题录，再粘贴或上传到本工具。本阶段先支持 GB/T 7714 纯文本批量粘贴，并会尝试按题名、作者、年份与已上传 PDF 草稿自动匹配。
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                EndNote / RIS / BibTeX / NoteExpress 结构化导入为后续支持；当前不会后台抓取中文数据库结果。
              </p>
            </div>
            <label className="relative inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-slate-950 focus-within:ring-offset-2">
              上传题录 TXT
              <input
                ref={bibliographyFileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={handleChineseBibliographyFileUpload}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div>
              <textarea
                value={chineseBibliographyText}
                onChange={(event) => {
                  setChineseBibliographyText(event.target.value);
                  setChineseBibliographyMessage("");
                }}
                placeholder="[1] 张三, 李四. 城市更新背景下历史街区空间活力研究[J]. 建筑学报, 2023, 64(2): 45-52.&#10;[2] 王五. 建筑环境学[M]. 北京: 中国建筑工业出版社, 2020."
                className="min-h-44 w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleApplyImportedCitationMatches}
                  disabled={importedChineseMatchResult.matches.every(
                    (match) => match.status !== "auto",
                  )}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  批量采用自动匹配结果
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChineseBibliographyText("");
                    setChineseBibliographyMessage("");
                    if (bibliographyFileInputRef.current) {
                      bibliographyFileInputRef.current.value = "";
                    }
                  }}
                  disabled={!chineseBibliographyText && !chineseBibliographyMessage}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  清空题录
                </button>
              </div>
              {chineseBibliographyMessage ? (
                <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm leading-6 text-slate-600">
                  {chineseBibliographyMessage}
                </p>
              ) : null}
            </div>

            <ChineseBibliographyImportPreview
              importedItems={importedChineseItems}
              matches={importedChineseMatchResult.matches}
              unmatchedPdfCount={importedChineseMatchResult.unmatchedPdfItems.length}
              unmatchedImportedCount={
                importedChineseMatchResult.unmatchedImportedItems.length
              }
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                从上传文件生成参考文献列表
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                使用上方每个文件对应的一条 ReferenceItem，按当前编辑后的字段生成最终列表。
              </p>
            </div>
            <span className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              {sourceReferenceItems.length} 条识别记录
            </span>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(320px,1.15fr)]">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">输出格式</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {formatOptions.slice(0, 2).map((option) => {
                  const isSelected = sourceSelectedFormat === option.id;

                  return (
                    <label
                      key={`source-${option.id}`}
                      className={[
                        "rounded-lg border p-4 transition",
                        "cursor-pointer bg-white hover:border-slate-400",
                        isSelected
                          ? "border-slate-950 ring-2 ring-slate-950/10"
                          : "border-slate-200",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="source-format"
                        value={option.id}
                        checked={isSelected}
                        onChange={() => {
                          setSourceSelectedFormat(option.id);
                          setSourceResultText("");
                          setSourceCopyMessage("");
                        }}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-slate-900">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-500">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>

              <label className="mt-5 block text-sm">
                <span className="font-semibold text-slate-900">排序方式</span>
                <select
                  value={referenceSortMode}
                  onChange={(event) =>
                    handleChangeReferenceSortMode(
                      event.target.value as ReferenceSortMode,
                    )
                  }
                  className="mt-2 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="upload">上传顺序</option>
                  <option value="author">作者字母顺序</option>
                  <option value="year_asc">年份升序</option>
                  <option value="year_desc">年份降序</option>
                  <option value="title">题名顺序</option>
                </select>
              </label>

              <StartIndexSetting
                disabled={sourceSelectedFormat !== "gbt-7714"}
                value={sourceStartIndexInput}
                onChange={setSourceStartIndexInput}
              />

              <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
                <button
                  type="button"
                  onClick={handleGenerateSourceReferenceList}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                >
                  生成参考文献列表
                </button>
                <button
                  type="button"
                  onClick={handleClearSourceOutput}
                  disabled={!sourceResultText && !sourceStatusMessage}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  清空输出结果
                </button>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => handleDownloadSourceResult("txt")}
                  disabled={orderedSourceReferenceItems.length === 0}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  下载 TXT
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSourceResult("bib")}
                  disabled={orderedSourceReferenceItems.length === 0}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  下载 BIB
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSourceResult("ris")}
                  disabled={orderedSourceReferenceItems.length === 0}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  下载 RIS
                </button>
              </div>

              {sourceStatusMessage ? (
                <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm leading-6 text-slate-600">
                  {sourceStatusMessage}
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    文件参考文献输出
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    输出只来自上传文件识别记录，不读取下方手工文本输入。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySourceResult}
                  disabled={!sourceResultText}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  复制结果
                </button>
              </div>

              <QualityCheckPanel
                duplicateResults={duplicateResults}
                validationResults={sourceValidationResults}
              />
              <DuplicateGroupsPanel
                duplicateGroups={duplicateGroupResult.duplicateGroups}
                onRemoveReference={handleRemoveReferenceRecord}
              />

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
                {sourceResultText ? (
                  <pre className="min-h-72 whitespace-pre-wrap break-words p-4 text-sm leading-7 text-slate-900">
                    {sourceResultText}
                  </pre>
                ) : (
                  <div className="flex min-h-72 items-center justify-center px-6 text-center text-sm leading-7 text-slate-500">
                    暂无输出。上传并识别文件，必要时编辑字段，然后点击“生成参考文献列表”。
                  </div>
                )}
              </div>

              {sourceCopyMessage ? (
                <p className="mt-3 text-sm text-slate-600">{sourceCopyMessage}</p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <label
                      htmlFor="references"
                      className="text-base font-semibold text-slate-900"
                    >
                      已有参考文献文本转换
                    </label>
                    <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                      保留原有入口：每行一条已整理好的参考文献文本，用于测试 GB/T 7714 或 APA 7th 输出。
                    </p>
                  </div>
                </div>

                <p className="mt-3 break-words text-xs leading-6 text-slate-500">
                  注意：这里不会读取上方上传队列中的文件，也不会把文件全文按行拆成多条参考文献。
                </p>

                <textarea
                  id="references"
                  value={inputText}
                  onChange={(event) => {
                    setInputText(event.target.value);
                    setStatusMessage("");
                    setCopyMessage("");
                  }}
                  placeholder="示例：&#10;张三, 李四. 学术写作方法研究[J]. 高等教育研究, 2024, 45(2): 12-18.&#10;Smith J. Research methods in practice. Journal of Academic Studies, 2023, 18(4), 55-70."
                  className="mt-4 min-h-72 w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      目标期刊类型
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      当前仅开放两种基础选项。
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                    {referenceCount} 条
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {formatOptions.map((option) => {
                    const isSelected = selectedFormat === option.id;

                    return (
                      <label
                        key={option.id}
                        className={[
                          "rounded-lg border p-4 transition",
                          option.disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                            : "cursor-pointer bg-white hover:border-slate-400",
                          isSelected
                            ? "border-slate-950 ring-2 ring-slate-950/10"
                            : "border-slate-200",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="format"
                          value={option.id}
                          checked={isSelected}
                          disabled={option.disabled}
                          onChange={() => setSelectedFormat(option.id)}
                          className="sr-only"
                        />
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-sm font-semibold text-slate-900">
                              {option.title}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-slate-500">
                              {option.description}
                            </span>
                          </span>
                          {option.disabled ? (
                            <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-500">
                              后续支持
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <StartIndexSetting
                disabled={selectedFormat !== "gbt-7714"}
                value={manualStartIndexInput}
                onChange={setManualStartIndexInput}
              />

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row">
                <button
                  type="button"
                  onClick={handleConvert}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                >
                  开始转换
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                >
                  清空输入
                </button>
                <button
                  type="button"
                  onClick={handleLoadSamples}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                >
                  填入样例
                </button>
              </div>

              {statusMessage ? (
                <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  {statusMessage}
                </p>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex h-full min-w-0 flex-col sm:min-h-[420px]">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    转换结果
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    结果生成后可直接复制。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!resultText}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  复制结果
                </button>
              </div>

              <div className="mt-4 flex flex-1 rounded-lg border border-slate-200 bg-slate-50">
                {resultText ? (
                  <pre className="min-h-80 w-full whitespace-pre-wrap break-words p-4 text-sm leading-7 text-slate-900">
                    {resultText}
                  </pre>
                ) : (
                  <div className="flex min-h-80 w-full items-center justify-center px-6 text-center text-sm leading-7 text-slate-500">
                    暂无转换结果。输入参考文献并点击“开始转换”后，结果会显示在这里。
                  </div>
                )}
              </div>

              {copyMessage ? (
                <p className="mt-3 text-sm text-slate-600">{copyMessage}</p>
              ) : null}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                解析预览
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                根据当前输入自动生成统一数据对象，字段未识别时会显示提示。
              </p>
            </div>
            <span className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              {parsedReferences.length} 条记录
            </span>
          </div>

          {parsedReferences.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {parsedReferences.map((reference, index) => (
                <article
                  key={reference.id}
                  className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {index + 1}. {referenceTypeLabels[reference.type]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        语言：{referenceLanguageLabels[reference.language]}
                      </p>
                    </div>
                    {reference.warnings.length > 0 ? (
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                        需检查
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                        已识别
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <PreviewField label="作者" value={formatAuthors(reference.authors)} />
                    <PreviewField label="年份" value={formatPreviewValue(reference.year)} />
                    <PreviewField label="标题" value={formatPreviewValue(reference.title)} wide />
                    <PreviewField
                      label="来源"
                      value={formatPreviewValue(reference.sourceTitle)}
                      wide
                    />
                    <PreviewField label="DOI" value={formatPreviewValue(reference.doi)} wide />
                    <PreviewField label="URL" value={formatPreviewValue(reference.url)} wide />
                  </dl>

                  {reference.warnings.length > 0 ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                      {reference.warnings.join("；")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-7 text-slate-500">
              暂无解析预览。在文本转换区输入已有参考文献后，这里会显示解析出的结构化字段。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function copyTextWithFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function FileExtractionSummary({
  sourceFile,
  expanded,
  onTogglePreview,
}: {
  sourceFile: UploadedSourceFile;
  expanded: boolean;
  onTogglePreview: () => void;
}) {
  const result = sourceFile.textExtractionResult;

  if (!result && sourceFile.textExtractionStatus === "idle") {
    return (
      <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
        尚未提取文本。点击“提取文本”后会显示文本长度、提示和预览。
      </div>
    );
  }

  if (sourceFile.textExtractionStatus === "extracting") {
    return (
      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        正在读取文件文本，请稍候。
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const previewText = (result.frontText || result.fullText).slice(
    0,
    expanded ? 1000 : 300,
  );
  const canExpand = (result.frontText || result.fullText).length > 300;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {typeof result.pageCount === "number" ? (
          <span className="rounded-md bg-slate-100 px-2 py-1">
            页数：{result.pageCount}
          </span>
        ) : null}
        <span className="rounded-md bg-slate-100 px-2 py-1">
          文本长度：{result.fullText.length} 字
        </span>
      </div>

      {result.warning ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
          {result.warning}
        </p>
      ) : null}

      {result.error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-6 text-rose-800">
          {result.error}
        </p>
      ) : null}

      {result.success && previewText ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600">
              文本预览（最多显示 1000 字）
            </p>
            {canExpand ? (
              <button
                type="button"
                onClick={onTogglePreview}
                className="text-xs font-semibold text-slate-700 underline-offset-4 hover:underline"
              >
                {expanded ? "收起预览" : "展开预览"}
              </button>
            ) : null}
          </div>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-xs leading-6 text-slate-700">
            {previewText}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function MetadataSummary({
  sourceFile,
  duplicateResults,
  validationResult,
  citationSupplementText,
  citationSupplementMessage,
  onApplyChineseCitation,
  onChineseCitationTextChange,
  onUpdateField,
  onUseCandidate,
}: {
  sourceFile: UploadedSourceFile;
  duplicateResults: DuplicateReferenceResult[];
  validationResult?: ReferenceValidationResult;
  citationSupplementText: string;
  citationSupplementMessage: string;
  onApplyChineseCitation: (fileId: string) => void;
  onChineseCitationTextChange: (fileId: string, value: string) => void;
  onUpdateField: (
    fileId: string,
    field: EditableReferenceField,
    value: string,
  ) => void;
  onUseCandidate: (fileId: string, candidateId: string) => void;
}) {
  const reference = sourceFile.referenceItem;

  if (!reference) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
        尚未生成识别结果。点击“提取并识别”后，此处会显示该文件对应的一条 ReferenceItem。
      </div>
    );
  }

  const qualityStatus = getQualityStatus(
    validationResult,
    duplicateResults.length > 0,
  );
  const chineseSearchLinks =
    reference.language === "zh" && reference.needsReview
      ? buildChineseSearchLinks({
          title: reference.title,
          authors: reference.authors,
          year: reference.year,
        })
      : [];

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            识别结果：{reference.sourceFileName ?? sourceFile.fileName}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            文件类型：{reference.sourceFileType ?? sourceFile.fileType}
            {typeof reference.confidence === "number"
              ? ` · 置信度：${Math.round(reference.confidence * 100)}%`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={[
              "rounded-md px-2 py-1 text-xs font-medium",
              metadataStatusClassNames[sourceFile.metadataStatus],
            ].join(" ")}
          >
            {metadataStatusLabels[sourceFile.metadataStatus]}
          </span>
          <span
            className={[
              "rounded-md px-2 py-1 text-xs font-medium",
              qualityStatusClassNames[qualityStatus],
            ].join(" ")}
          >
            {qualityStatusLabels[qualityStatus]}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
        <MetaBadge label="元数据来源" value={reference.metadataSource ?? "unknown"} />
        <MetaBadge label="匹配方式" value={reference.matchedBy ?? "none"} />
        <MetaBadge
          label="置信度"
          value={
            typeof reference.confidence === "number"
              ? `${Math.round(reference.confidence * 100)}%`
              : "未提供"
          }
        />
        <MetaBadge label="需要核对" value={reference.needsReview ? "是" : "否"} />
        <MetaBadge label="Article number" value={reference.articleNumber ?? "无"} />
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0">
          <span className="text-xs font-medium text-slate-500">文献类型</span>
          <select
            value={reference.type}
            onChange={(event) =>
              onUpdateField(sourceFile.id, "type", event.target.value)
            }
            className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          >
            {Object.entries(referenceTypeLabels).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <EditableField
          label="年份"
          value={reference.year}
          onChange={(value) => onUpdateField(sourceFile.id, "year", value)}
          requiredMissing={!reference.year}
        />
        <EditableField
          label="卷"
          value={reference.volume}
          onChange={(value) => onUpdateField(sourceFile.id, "volume", value)}
        />
        <EditableField
          label="期"
          value={reference.issue}
          onChange={(value) => onUpdateField(sourceFile.id, "issue", value)}
        />
        <EditableField
          label="页码"
          value={reference.pages}
          onChange={(value) => onUpdateField(sourceFile.id, "pages", value)}
        />
        <EditableField
          label="文章编号"
          value={reference.articleNumber}
          onChange={(value) => onUpdateField(sourceFile.id, "articleNumber", value)}
        />
        <EditableField
          label="DOI"
          value={reference.doi}
          onChange={(value) => onUpdateField(sourceFile.id, "doi", value)}
        />
        <EditableField
          label="题名"
          value={reference.title}
          onChange={(value) => onUpdateField(sourceFile.id, "title", value)}
          requiredMissing={!reference.title}
          wide
        />
        <EditableField
          label="作者"
          value={reference.authors.join("\n")}
          onChange={(value) => onUpdateField(sourceFile.id, "authors", value)}
          requiredMissing={reference.authors.length === 0}
          multiline
          wide
        />
        <EditableField
          label="期刊名 / 来源"
          value={reference.sourceTitle}
          onChange={(value) => onUpdateField(sourceFile.id, "sourceTitle", value)}
          requiredMissing={reference.type === "journal" && !reference.sourceTitle}
          wide
        />
        <EditableField
          label="URL"
          value={reference.url}
          onChange={(value) => onUpdateField(sourceFile.id, "url", value)}
          wide
        />
        <EditableField
          label="出版社 / 学校 / 机构"
          value={reference.publisher}
          onChange={(value) => onUpdateField(sourceFile.id, "publisher", value)}
          wide
        />
        <EditableField
          label="出版地 / 城市"
          value={reference.place}
          onChange={(value) => onUpdateField(sourceFile.id, "place", value)}
          wide
        />
      </div>

      {reference.candidates && reference.candidates.length > 0 ? (
        <MetadataCandidateList
          candidates={reference.candidates}
          currentReference={reference}
          onUseCandidate={(candidateId) =>
            onUseCandidate(sourceFile.id, candidateId)
          }
        />
      ) : null}

      {reference.language === "zh" ? (
        <ChineseReferenceAssistPanel
          searchLinks={chineseSearchLinks}
          supplementText={citationSupplementText}
          supplementMessage={citationSupplementMessage}
          onSupplementTextChange={(value) =>
            onChineseCitationTextChange(sourceFile.id, value)
          }
          onApplySupplement={() => onApplyChineseCitation(sourceFile.id)}
        />
      ) : null}

      {reference.warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
          {reference.warnings.join("；")}
        </div>
      ) : null}

      {validationResult && validationResult.issues.length > 0 ? (
        <IssueList
          title="质量检查"
          items={validationResult.issues.map(
            (issue) => `${issue.scope}：${issue.message}`,
          )}
        />
      ) : null}

      {duplicateResults.length > 0 ? (
        <IssueList
          title="重复检测"
          items={duplicateResults.map(
            (duplicate) => `${duplicate.message}（${duplicate.reason}）`,
          )}
        />
      ) : null}
    </div>
  );
}

function ChineseReferenceAssistPanel({
  searchLinks,
  supplementText,
  supplementMessage,
  onSupplementTextChange,
  onApplySupplement,
}: {
  searchLinks: ReturnType<typeof buildChineseSearchLinks>;
  supplementText: string;
  supplementMessage: string;
  onSupplementTextChange: (value: string) => void;
  onApplySupplement: () => void;
}) {
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
      <div>
        <h5 className="font-semibold">中文数据库辅助检索</h5>
        <p className="mt-1 text-xs leading-6">
          本工具不会后台抓取中文数据库结果。请在数据库页面确认文献后，复制 GB/T 7714、RIS、EndNote 或 BibTeX 题录，再粘贴/导入本工具补全字段。
        </p>
        {searchLinks.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {searchLinks.map((link) => (
              <a
                key={link.provider}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                {link.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs">题名为空，暂不能生成中文数据库搜索链接。</p>
        )}
      </div>

      <div className="border-t border-amber-200 pt-3">
        <h5 className="font-semibold">粘贴中文引用格式补全</h5>
        <p className="mt-1 text-xs leading-6">
          如果自动识别不完整，可从知网、万方、维普等平台复制 GB/T 7714 引用格式，粘贴后自动填充字段。
        </p>
        <textarea
          value={supplementText}
          onChange={(event) => onSupplementTextChange(event.target.value)}
          rows={3}
          placeholder="张三, 李四. 城市更新背景下历史街区空间活力研究[J]. 建筑学报, 2023, 64(2): 45-52."
          className="mt-2 w-full resize-y rounded-md border border-amber-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-700 focus:ring-2 focus:ring-amber-700/10"
        />
        <button
          type="button"
          onClick={onApplySupplement}
          className="mt-2 inline-flex min-h-9 items-center justify-center rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-900 focus:ring-offset-2"
        >
          解析并覆盖当前字段
        </button>
        {supplementMessage ? (
          <p className="mt-2 text-xs font-medium">{supplementMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

function ChineseBibliographyImportPreview({
  importedItems,
  matches,
  unmatchedPdfCount,
  unmatchedImportedCount,
}: {
  importedItems: ReferenceItem[];
  matches: ImportedCitationMatch[];
  unmatchedPdfCount: number;
  unmatchedImportedCount: number;
}) {
  const autoCount = matches.filter((match) => match.status === "auto").length;
  const confirmCount = matches.filter(
    (match) => match.status === "needs_confirm",
  ).length;

  if (importedItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
        暂无导入题录。粘贴 GB/T 7714 中文题录后，这里会显示解析数量和匹配结果。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <h3 className="font-semibold text-slate-900">题录解析与匹配</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MetaBadge label="已解析题录" value={`${importedItems.length} 条`} />
        <MetaBadge label="自动匹配" value={`${autoCount} 条`} />
        <MetaBadge label="需要确认" value={`${confirmCount} 条`} />
        <MetaBadge label="未匹配" value={`${unmatchedImportedCount} 条题录 / ${unmatchedPdfCount} 条 PDF`} />
      </div>
      <div className="mt-3 max-h-56 overflow-auto rounded-md bg-white p-3">
        {importedItems.slice(0, 5).map((item, index) => (
          <div key={item.id} className="border-b border-slate-100 py-2 last:border-b-0">
            <p className="text-xs font-semibold text-slate-800">
              {index + 1}. {formatPreviewValue(item.title)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatAuthors(item.authors)} · {formatPreviewValue(item.year)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-800">{value}</dd>
    </div>
  );
}

function MetadataCandidateList({
  candidates,
  currentReference,
  onUseCandidate,
}: {
  candidates: MetadataCandidate[];
  currentReference: ReferenceItem;
  onUseCandidate: (candidateId: string) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h5 className="text-sm font-semibold text-slate-900">候选结果</h5>
        <p className="text-xs text-slate-500">
          数据库候选不会自动覆盖手动编辑，采用前请核对题名、作者和年份。
        </p>
      </div>
      <div className="mt-3 grid gap-3">
        {candidates.map((candidate) => {
          const item = candidate.item;
          const isCurrent =
            currentReference.metadataSource === candidate.source &&
            currentReference.doi === item.doi &&
            currentReference.title === item.title;

          return (
            <article
              key={candidate.id}
              className="rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-medium uppercase text-slate-700">
                      {candidate.source}
                    </span>
                    <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-800">
                      置信度 {Math.round(candidate.confidence * 100)}%
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                      {candidate.matchedBy}
                    </span>
                  </div>
                  <p className="mt-2 break-words font-semibold leading-6 text-slate-900">
                    {formatPreviewValue(item.title)}
                  </p>
                  <dl className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <PreviewField
                      label="作者"
                      value={item.authors.length > 0 ? formatAuthors(item.authors) : "未识别"}
                    />
                    <PreviewField label="年份" value={formatPreviewValue(item.year)} />
                    <PreviewField
                      label="期刊/来源"
                      value={formatPreviewValue(item.sourceTitle)}
                    />
                    <PreviewField label="DOI" value={formatPreviewValue(item.doi)} />
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => onUseCandidate(candidate.id)}
                  disabled={isCurrent}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {isCurrent ? "当前结果" : "采用此候选"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  requiredMissing = false,
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  multiline?: boolean;
  requiredMissing?: boolean;
  wide?: boolean;
}) {
  const className = [
    "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2",
    requiredMissing
      ? "border-amber-400 focus:border-amber-700 focus:ring-amber-700/10"
      : "border-slate-300 focus:border-slate-900 focus:ring-slate-900/10",
  ].join(" ");

  return (
    <label className={wide ? "min-w-0 sm:col-span-2 lg:col-span-3" : "min-w-0"}>
      <span className="text-xs font-medium text-slate-500">
        {label}
        {requiredMissing ? (
          <span className="ml-2 text-amber-700">需补充</span>
        ) : null}
      </span>
      {multiline ? (
        <textarea
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`${className} resize-y leading-6`}
          placeholder="多个作者可用换行、分号、顿号或中文逗号分隔"
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

function StartIndexSetting({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeStartIndexInputForDisplay(event.target.value));
  };

  const handleBlur = () => {
    onChange(String(parseStartIndexInput(value)));
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedNumber = extractStartIndexNumberText(
      event.clipboardData.getData("text"),
    );

    if (!pastedNumber) {
      return;
    }

    event.preventDefault();
    onChange(pastedNumber);
  };

  return (
    <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="block text-sm">
        <span className="font-semibold text-slate-900">起始编号</span>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onBlur={handleBlur}
          onChange={handleChange}
          onPaste={handlePaste}
          className="mt-2 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
      </label>
      {disabled ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          APA 7th 通常不使用顺序编号。
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          如果你已有 23 条参考文献，需要继续补充，请将起始编号设为 24。
        </p>
      )}
    </div>
  );
}

function QualityCheckPanel({
  duplicateResults,
  validationResults,
}: {
  duplicateResults: DuplicateReferenceResult[];
  validationResults: ReferenceValidationResult[];
}) {
  const issueResults = validationResults.filter(
    (result) => result.issues.length > 0,
  );

  if (validationResults.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
        暂无质量检查结果。请先上传并识别论文文件。
      </div>
    );
  }

  if (issueResults.length === 0 && duplicateResults.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
        质量检查未发现明显问题。投稿前仍请以目标期刊、学校或导师要求为准。
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <h4 className="font-semibold">质量检查结果</h4>
      <p className="mt-1 text-xs leading-6">
        以下问题不会阻止生成，只用于提醒人工核对。
      </p>

      {issueResults.length > 0 ? (
        <div className="mt-3 space-y-2">
          {issueResults.map((result) => (
            <div key={result.referenceId} className="rounded-md bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold text-slate-800">
                {result.referenceLabel}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {result.issues.map((issue) => (
                  <li key={`${issue.scope}-${issue.field ?? ""}-${issue.message}`}>
                    {issue.scope}：{issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {duplicateResults.length > 0 ? (
        <div className="mt-3 space-y-2">
          {duplicateResults.map((duplicate) => (
            <div
              key={`${duplicate.level}-${duplicate.referenceIds.join("-")}-${duplicate.reason}`}
              className="rounded-md bg-white/70 px-3 py-2 text-xs"
            >
              <p className="font-semibold">{duplicate.message}</p>
              <p className="mt-1 text-slate-700">{duplicate.reason}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DuplicateGroupsPanel({
  duplicateGroups,
  onRemoveReference,
}: {
  duplicateGroups: ReferenceItem[][];
  onRemoveReference: (referenceId: string) => void;
}) {
  if (duplicateGroups.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
      <h4 className="font-semibold">
        检测到 {duplicateGroups.length} 组可能重复文献
      </h4>
      <div className="mt-3 grid gap-3">
        {duplicateGroups.map((group, groupIndex) => (
          <div
            key={`duplicate-group-${groupIndex}-${group.map((item) => item.id).join("-")}`}
            className="rounded-md bg-white/80 p-3"
          >
            <p className="text-xs font-semibold text-slate-800">
              重复组 {groupIndex + 1}
            </p>
            <div className="mt-2 grid gap-2">
              {group.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-md border border-violet-100 bg-white p-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 text-xs text-slate-700">
                    <p className="break-words font-semibold text-slate-900">
                      {formatPreviewValue(item.sourceFileName)}
                    </p>
                    <p className="mt-1 break-words">
                      题名：{formatPreviewValue(item.title)}
                    </p>
                    <p className="mt-1 break-words">
                      DOI：{formatPreviewValue(item.doi)} · 年份：{formatPreviewValue(item.year)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveReference(item.id)}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 transition hover:bg-violet-100"
                  >
                    删除此条
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function removeRecordKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function hasParsedCitationFields(parsed: Partial<ReferenceItem>): boolean {
  return Boolean(
    parsed.title ||
      parsed.authors?.length ||
      parsed.year ||
      parsed.sourceTitle ||
      parsed.publisher,
  );
}

function hasCompleteReferenceFields(reference: ReferenceItem): boolean {
  return Boolean(
    reference.title &&
      reference.authors.length > 0 &&
      reference.year &&
      (reference.type !== "journal" || reference.sourceTitle),
  );
}

function mergeReferenceItem(
  current: ReferenceItem,
  parsed: Partial<ReferenceItem>,
  options: {
    confidence: number;
    matchedBy: NonNullable<ReferenceItem["matchedBy"]>;
    metadataSource: NonNullable<ReferenceItem["metadataSource"]>;
    needsReview: boolean;
    warnings: string[];
  },
): ReferenceItem {
  const next: ReferenceItem = {
    ...current,
    rawText: parsed.rawText ?? current.rawText,
    type: parsed.type ?? current.type,
    authors: parsed.authors && parsed.authors.length > 0 ? parsed.authors : current.authors,
    year: parsed.year ?? current.year,
    title: parsed.title ?? current.title,
    sourceTitle: parsed.sourceTitle ?? current.sourceTitle,
    volume: parsed.volume ?? current.volume,
    issue: parsed.issue ?? current.issue,
    pages: parsed.pages ?? current.pages,
    publisher: parsed.publisher ?? current.publisher,
    place: parsed.place ?? current.place,
    doi: parsed.doi ?? current.doi,
    url: parsed.url ?? current.url,
    accessDate: parsed.accessDate ?? current.accessDate,
    language: parsed.language ?? current.language,
    metadataSource: options.metadataSource,
    matchedBy: options.matchedBy,
    confidence: options.confidence,
    needsReview: options.needsReview,
    warnings: options.warnings,
  };

  return {
    ...next,
    extractionWarning: next.warnings.length > 0 ? next.warnings.join(" ") : undefined,
  };
}

function addTitleMissingWarning(reference: ReferenceItem): ReferenceItem {
  if (reference.title) {
    return reference;
  }

  const warnings = Array.from(
    new Set([...reference.warnings, "缺少题名，已按现有字段生成，请人工核对。"]),
  );

  return {
    ...reference,
    needsReview: true,
    extractionWarning: warnings.join(" "),
    warnings,
  };
}

function parseEditableAuthors(value: string): string[] {
  const separator = /[\u3400-\u9fff]/.test(value)
    ? /[\n,，;；、]+/g
    : /[\n;；]+/g;

  return value
    .split(separator)
    .map((author) => author.trim())
    .filter(Boolean);
}

function normalizeEditableValue(
  field: EditableReferenceField,
  value: string,
): string | ReferenceType | null {
  const trimmed = value.trim();

  if (field === "type") {
    return isReferenceType(trimmed) ? trimmed : "unknown";
  }

  return trimmed || null;
}

function getWarningsAfterEdit(
  reference: ReferenceItem,
  field: EditableReferenceField,
): string[] {
  const removePatterns: RegExp[] = [];

  if (field === "title" && reference.title) {
    removePatterns.push(/题名可能来自文件名|缺少题名|未能.*题名/);
  }

  if (field === "authors" && reference.authors.length > 0) {
    removePatterns.push(/未能自动识别作者|缺少作者/);
  }

  if (field === "year" && reference.year) {
    removePatterns.push(/年份识别结果不确定|缺少年份/);
  }

  if (field === "sourceTitle" && reference.sourceTitle) {
    removePatterns.push(/未能自动识别期刊名|缺少期刊名/);
  }

  if (field === "type" && reference.type !== "unknown") {
    removePatterns.push(/未能可靠识别.*文献类型|未知类型/);
  }

  if (removePatterns.length === 0) {
    return reference.warnings;
  }

  return reference.warnings.filter(
    (warning) => !removePatterns.some((pattern) => pattern.test(warning)),
  );
}

function isReferenceType(value: string): value is ReferenceType {
  return Object.prototype.hasOwnProperty.call(referenceTypeLabels, value);
}

function sanitizeStartIndexInputForDisplay(value: string): string {
  if (!value) {
    return "";
  }

  if (/^-?\d*(?:\.\d*)?$/.test(value)) {
    return value;
  }

  return extractStartIndexNumberText(value) ?? "";
}

function extractStartIndexNumberText(value: string): string | undefined {
  const match = value.match(/\d+(?:\.\d+)?/);

  if (!match) {
    return undefined;
  }

  return String(parseStartIndexInput(match[0]));
}

function parseStartIndexInput(value: string): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 1;
  }

  const roundedValue = Math.round(numberValue);
  return roundedValue >= 1 ? roundedValue : 1;
}

async function resolvePaperMetadataFromApi(input: {
  extractionError?: string;
  extractionSuccess: boolean;
  fileName: string;
  firstPagesText: string;
  fullText: string;
}): Promise<ResolvePaperMetadataResult> {
  try {
    const response = await fetch("/api/metadata/resolve-paper", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: input.fileName,
        firstPagesText: input.firstPagesText,
        fullText: input.fullText,
      }),
    });

    if (!response.ok) {
      return buildFailedMetadataResult(input.fileName, input.extractionError);
    }

    const payload = (await response.json()) as ResolvePaperMetadataResult;
    return payload.finalItem
      ? payload
      : buildFailedMetadataResult(input.fileName, input.extractionError);
  } catch {
    return buildFailedMetadataResult(input.fileName, input.extractionError);
  }
}

function buildFailedMetadataResult(
  fileName: string,
  extractionError?: string,
): ResolvePaperMetadataResult {
  const warnings = [
    extractionError ??
      "开放元数据查询失败，请检查网络连接。你仍可手动编辑字段后生成参考文献。",
  ];
  const finalItem: ReferenceItem = {
    id: `failed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rawText: "",
    sourceFileName: fileName,
    sourceFileType: "pdf",
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

  return {
    finalItem,
    candidates: [],
    localDraft: finalItem,
    status: "failed",
    warnings,
  };
}

function mapResolvedMetadataStatus(
  status: ResolvePaperMetadataResult["status"],
): UploadedSourceFile["metadataStatus"] {
  if (status === "success") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  return "review";
}

function _addCrossrefFallbackWarning(
  referenceItem: ReferenceItem,
  extractionSuccess: boolean,
): ReferenceItem {
  if (!extractionSuccess || !referenceItem.doi) {
    return referenceItem;
  }

  return {
    ...referenceItem,
    needsReview: true,
    extractionWarning:
      referenceItem.extractionWarning ??
      "已提取 DOI，但 Crossref 未返回元数据，已保留 PDF 本地识别结果。",
    warnings: Array.from(
      new Set([
        ...referenceItem.warnings,
        "已提取 DOI，但 Crossref 未返回元数据，已保留 PDF 本地识别结果。",
      ]),
    ),
  };
}

void _addCrossrefFallbackWarning;

function getManualMetadataStatus(
  reference: ReferenceItem,
): UploadedSourceFile["metadataStatus"] {
  return getMetadataStatus(reference, true);
}

function getMetadataStatus(
  reference: ReferenceItem,
  extractionSuccess: boolean,
): UploadedSourceFile["metadataStatus"] {
  if (!extractionSuccess) {
    return "failed";
  }

  const hasCoreFields =
    Boolean(reference.title) &&
    reference.authors.length > 0 &&
    Boolean(reference.year) &&
    (reference.type !== "journal" || Boolean(reference.sourceTitle));

  if (!hasCoreFields || reference.type === "unknown" || reference.warnings.length > 0) {
    return "review";
  }

  return "success";
}

function getQualityStatus(
  validationResult: ReferenceValidationResult | undefined,
  hasDuplicate: boolean,
): QualityStatus {
  if (hasDuplicate) {
    return "duplicate";
  }

  if (!validationResult) {
    return "review";
  }

  return validationResult.status;
}

function buildDuplicatesByReferenceId(
  duplicates: DuplicateReferenceResult[],
): Map<string, DuplicateReferenceResult[]> {
  const result = new Map<string, DuplicateReferenceResult[]>();

  for (const duplicate of duplicates) {
    for (const referenceId of duplicate.referenceIds) {
      result.set(referenceId, [...(result.get(referenceId) ?? []), duplicate]);
    }
  }

  return result;
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function PreviewField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-800">{value}</dd>
    </div>
  );
}
