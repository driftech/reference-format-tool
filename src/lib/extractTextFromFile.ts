import { detectFileType, type SourceFileType } from "./fileTypes";
import { extractDocxText } from "./extractors/extractDocxText";
import { extractPdfText } from "./extractors/extractPdfText";
import { extractPlainText } from "./extractors/extractPlainText";

export type ExtractTextFromFileResult = {
  fileName: string;
  fileType: string;
  fullText: string;
  frontText: string;
  metadataTitle?: string;
  pdfMetadataText?: string;
  pageCount?: number;
  success: boolean;
  warning?: string;
  error?: string;
};

const frontTextLength = 3000;

const unsupportedFormatMessages: Partial<Record<SourceFileType, string>> = {
  doc: "旧版 DOC 格式暂不支持浏览器端稳定解析。请先另存为 DOCX 或 PDF 后上传。",
  caj: "CAJ 格式暂不支持直接解析。请先使用 CAJViewer 或其他工具转换为 PDF 或 DOCX 后上传。",
  rtf: "RTF 格式将在后续阶段支持。当前请先转换为 DOCX、PDF 或 TXT。",
  epub: "EPUB 格式将在后续阶段支持。当前请先转换为 PDF、DOCX 或 TXT。",
  unsupported: "暂不支持该文件格式。",
};

export async function extractTextFromFile(
  file: File,
): Promise<ExtractTextFromFileResult> {
  const fileType = detectFileType(file);

  try {
    if (fileType === "pdf") {
      const result = await extractPdfText(file);
      return buildResult(file, fileType, result.fullText, result.frontText, {
        metadataTitle: result.metadataTitle,
        pdfMetadataText: result.pdfMetadataText,
        pageCount: result.pageCount,
        warning: result.warning,
      });
    }

    if (fileType === "docx") {
      const result = await extractDocxText(file);
      return buildResult(file, fileType, result.fullText, getFrontText(result.fullText), {
        error:
          "DOCX 文件读取失败，请检查文件是否损坏，或尝试另存为新的 DOCX 后重新上传。",
        warning: result.warning,
      });
    }

    if (isPlainTextType(fileType)) {
      const fullText = normalizeText(await extractPlainText(file));
      return buildResult(file, fileType, fullText, getFrontText(fullText));
    }

    return buildUnsupportedResult(file, fileType);
  } catch {
    return {
      fileName: file.name,
      fileType,
      fullText: "",
      frontText: "",
      success: false,
      error:
        fileType === "pdf"
          ? "PDF 文件读取失败，请检查文件是否损坏。"
          : fileType === "docx"
          ? "DOCX 文件读取失败，请检查文件是否损坏，或尝试另存为新的 DOCX 后重新上传。"
          : "文件读取失败，请检查文件是否损坏或转换为 PDF、DOCX、TXT 后重新上传。",
    };
  }
}

function buildResult(
  file: File,
  fileType: SourceFileType,
  fullText: string,
  frontText: string,
  options: {
    error?: string;
    metadataTitle?: string;
    pdfMetadataText?: string;
    pageCount?: number;
    warning?: string;
  } = {},
): ExtractTextFromFileResult {
  const textLength = fullText.trim().length;

  if (textLength === 0 && fileType === "pdf") {
    return {
      fileName: file.name,
      fileType,
      fullText: "",
      frontText: "",
      metadataTitle: options.metadataTitle,
      pdfMetadataText: options.pdfMetadataText,
      pageCount: options.pageCount,
      success: false,
      error:
        "该 PDF 可能是扫描版或不含可提取文本，暂不支持自动识别。请手动补充该文献信息。",
    };
  }

  if (textLength === 0) {
    return {
      fileName: file.name,
      fileType,
      fullText: "",
      frontText: "",
      metadataTitle: options.metadataTitle,
      pdfMetadataText: options.pdfMetadataText,
      pageCount: options.pageCount,
      success: false,
      error: options.error ?? "未提取到可用文本，请检查文件内容。",
    };
  }

  return {
    fileName: file.name,
    fileType,
    fullText,
    frontText,
    metadataTitle: options.metadataTitle,
    pdfMetadataText: options.pdfMetadataText,
    pageCount: options.pageCount,
    success: true,
    warning:
      textLength < 80
        ? "提取到的文本较短，后续识别结果可能需要人工核对。"
        : options.warning,
  };
}

function buildUnsupportedResult(
  file: File,
  fileType: SourceFileType,
): ExtractTextFromFileResult {
  return {
    fileName: file.name,
    fileType,
    fullText: "",
    frontText: "",
    success: false,
    error: unsupportedFormatMessages[fileType] ?? unsupportedFormatMessages.unsupported,
  };
}

function isPlainTextType(fileType: SourceFileType): boolean {
  return ["txt", "md", "tex", "latex"].includes(fileType);
}

function getFrontText(text: string): string {
  return text.slice(0, frontTextLength).trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
