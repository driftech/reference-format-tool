import { detectFileType, type SourceFileType } from "./fileTypes";
import type { ExtractTextFromFileResult } from "./extractTextFromFile";
import type { ReferenceItem } from "./referenceTypes";

export type UploadedSourceFileStatus =
  | "supported"
  | "later"
  | "convert_required"
  | "unsupported"
  | "error";

export type TextExtractionStatus = "idle" | "extracting" | "success" | "failed";

export type MetadataExtractionStatus = "idle" | "success" | "review" | "failed";

export type UploadedSourceFile = {
  id: string;
  file: File;
  fileName: string;
  fileType: SourceFileType;
  size: number;
  status: UploadedSourceFileStatus;
  message: string;
  createdAt: number;
  textExtractionStatus: TextExtractionStatus;
  textExtractionResult?: ExtractTextFromFileResult;
  metadataStatus: MetadataExtractionStatus;
  referenceItem?: ReferenceItem;
};

export const sourceFileStatusLabels: Record<UploadedSourceFileStatus, string> = {
  supported: "当前支持",
  later: "后续支持",
  convert_required: "建议先转换",
  unsupported: "暂不支持",
  error: "处理异常",
};

export const sourceFileStatusClassNames: Record<UploadedSourceFileStatus, string> = {
  supported: "bg-emerald-100 text-emerald-800",
  later: "bg-sky-100 text-sky-800",
  convert_required: "bg-amber-100 text-amber-800",
  unsupported: "bg-rose-100 text-rose-800",
  error: "bg-rose-100 text-rose-800",
};

const typeStatus: Record<SourceFileType, UploadedSourceFileStatus> = {
  pdf: "supported",
  docx: "supported",
  tex: "supported",
  latex: "supported",
  md: "supported",
  txt: "supported",
  rtf: "later",
  epub: "later",
  doc: "convert_required",
  caj: "convert_required",
  unsupported: "unsupported",
};

const typeMessages: Record<SourceFileType, string> = {
  pdf: "当前支持，将尝试提取文本并识别文献信息。",
  docx: "当前支持，将尝试提取文本并识别文献信息。",
  tex: "当前支持，将读取源码文本并识别 title、author、date 等信息。",
  latex: "当前支持，将读取源码文本并识别 title、author、date 等信息。",
  md: "当前支持，将读取 Markdown 文本并识别标题和元数据。",
  txt: "当前支持，将读取纯文本并尝试识别文献信息。",
  rtf: "后续支持，当前建议先转换为 DOCX、PDF 或 TXT。",
  epub: "后续支持，当前建议先转换为 PDF、DOCX 或 TXT。",
  doc: "旧版 DOC 暂不支持浏览器端稳定解析，建议先另存为 DOCX 或 PDF。",
  caj: "CAJ 暂不支持直接解析，建议先转换为 PDF 或 DOCX。",
  unsupported: "暂不支持该文件格式。",
};

export function getSourceFileStatus(
  fileType: SourceFileType,
): UploadedSourceFileStatus {
  return typeStatus[fileType];
}

export function getSourceFileMessage(fileType: SourceFileType): string {
  return typeMessages[fileType];
}

export function createUploadedSourceFile(file: File): UploadedSourceFile {
  const fileType = detectFileType(file);
  const createdAt = Date.now();
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${createdAt}-${Math.random().toString(36).slice(2)}`;

  return {
    id: randomId,
    file,
    fileName: file.name,
    fileType,
    size: file.size,
    status: getSourceFileStatus(fileType),
    message: getSourceFileMessage(fileType),
    createdAt,
    textExtractionStatus: "idle",
    metadataStatus: "idle",
  };
}
