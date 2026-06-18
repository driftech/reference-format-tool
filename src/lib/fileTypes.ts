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
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && extensionTypes[extension]) {
    return extensionTypes[extension];
  }

  const mimeType = file.type.toLowerCase();
  return mimeTypes[mimeType] ?? "unsupported";
}
