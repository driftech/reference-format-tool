export type SourceFileType =
  | "pdf"
  | "docx"
  | "doc"
  | "tex"
  | "latex"
  | "md"
  | "txt"
  | "rtf"
  | "epub"
  | "caj"
  | "unsupported";

export const maxSourceFileSizeBytes = 10 * 1024 * 1024;
export const maxSourceFileCount = 10;

export const allowedSourceFileExtensions = [
  "pdf",
  "docx",
  "doc",
  "tex",
  "latex",
  "md",
  "txt",
  "rtf",
  "epub",
  "caj",
] as const;

export const forbiddenSourceFileExtensions = [
  "exe",
  "msi",
  "bat",
  "cmd",
  "sh",
  "php",
  "js",
  "html",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "dll",
  "bin",
] as const;

const allowedSourceFileTypeSet = new Set<SourceFileType>(
  allowedSourceFileExtensions,
);
const forbiddenExtensionSet = new Set<string>(forbiddenSourceFileExtensions);

export const unsupportedSourceFileTypeMessage =
  "暂不支持该文件类型。请上传 PDF、DOCX、TXT、MD、TEX、RTF 等论文或文献文件。";

export const sourceFileAccept = [
  ".pdf",
  ".docx",
  ".tex",
  ".latex",
  ".md",
  ".txt",
  ".rtf",
  ".epub",
  ".doc",
  ".caj",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
  "text/x-tex",
  "application/rtf",
  "application/epub+zip",
].join(",");

const extensionTypes: Record<string, SourceFileType> = {
  pdf: "pdf",
  docx: "docx",
  doc: "doc",
  tex: "tex",
  latex: "latex",
  md: "md",
  markdown: "md",
  txt: "txt",
  rtf: "rtf",
  epub: "epub",
  caj: "caj",
};

const mimeTypes: Record<string, SourceFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/x-tex": "tex",
  "application/x-tex": "tex",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "application/epub+zip": "epub",
};

export function detectFileType(file: File): SourceFileType {
  const extension = getFileExtension(file.name);

  if (extension && extensionTypes[extension]) {
    return extensionTypes[extension];
  }

  const mimeType = file.type.toLowerCase();
  return mimeTypes[mimeType] ?? "unsupported";
}

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase().trim() ?? "";
}

export function isAllowedSourceFile(file: File): boolean {
  const extension = getFileExtension(file.name);

  if (!extension || forbiddenExtensionSet.has(extension)) {
    return false;
  }

  return allowedSourceFileTypeSet.has(detectFileType(file));
}
