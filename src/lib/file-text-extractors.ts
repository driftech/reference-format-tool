import JSZip from "jszip";

const plainTextExtensions = new Set(["txt", "md", "tex", "latex"]);
const bestEffortBinaryExtensions = new Set(["doc", "caj"]);

export const supportedUploadExtensions = [
  "txt",
  "docx",
  "doc",
  "tex",
  "latex",
  "pdf",
  "rtf",
  "caj",
  "epub",
  "md",
] as const;

export const supportedUploadAccept = [
  ".txt",
  ".docx",
  ".doc",
  ".tex",
  ".latex",
  ".pdf",
  ".rtf",
  ".caj",
  ".epub",
  ".md",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/epub+zip",
].join(",");

export type SupportedUploadExtension =
  (typeof supportedUploadExtensions)[number];

export type FileExtractionResult = {
  extension: SupportedUploadExtension;
  note?: string;
  text: string;
};

type PdfTextItem = {
  str?: string;
};

export async function extractTextFromUpload(
  file: File,
): Promise<FileExtractionResult> {
  const extension = getSupportedExtension(file.name);

  if (!extension) {
    throw new Error(
      `暂不支持该文件格式。请上传 ${supportedUploadExtensions
        .map((item) => `.${item}`)
        .join("、")} 文件。`,
    );
  }

  if (plainTextExtensions.has(extension)) {
    return {
      extension,
      text: await file.text(),
    };
  }

  if (extension === "rtf") {
    return {
      extension,
      note: "已按 RTF 文本抽取，复杂排版会被简化。",
      text: extractTextFromRtf(await file.text()),
    };
  }

  if (extension === "docx") {
    return {
      extension,
      text: await extractTextFromDocx(await file.arrayBuffer()),
    };
  }

  if (extension === "epub") {
    return {
      extension,
      note: "已从 EPUB 正文文件中抽取文本，目录和样式已忽略。",
      text: await extractTextFromEpub(await file.arrayBuffer()),
    };
  }

  if (extension === "pdf") {
    return {
      extension,
      note: "已从 PDF 页面抽取文本，扫描版 PDF 可能无法读取。",
      text: await extractTextFromPdf(await file.arrayBuffer()),
    };
  }

  if (bestEffortBinaryExtensions.has(extension)) {
    return {
      extension,
      note:
        extension === "doc"
          ? "旧版 .doc 为二进制格式，本阶段仅做本地最佳努力抽取；建议另存为 .docx 后上传。"
          : ".caj 为专有格式，本阶段仅做本地最佳努力抽取；建议导出为 .txt、.docx 或 .pdf 后上传。",
      text: extractTextFromBinaryBestEffort(await file.arrayBuffer()),
    };
  }

  throw new Error("暂不支持该文件格式。");
}

function getSupportedExtension(
  fileName: string,
): SupportedUploadExtension | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return supportedUploadExtensions.find((item) => item === extension);
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTextFromRtf(rtf: string): string {
  const text = rtf
    .replace(/\\u(-?\d+)\??/g, (_match, code: string) => {
      const value = Number(code);
      return String.fromCharCode(value < 0 ? value + 65536 : value);
    })
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) =>
      String.fromCharCode(Number.parseInt(match.slice(2), 16)),
    )
    .replace(/\\(?:par|line)\b/g, "\n")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/\\[^a-zA-Z]/g, "")
    .replace(/[{}]/g, "");

  return normalizeExtractedText(text);
}

async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentPaths = [
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
  ];

  const parts = await Promise.all(
    documentPaths.map(async (path) => {
      const file = zip.file(path);
      if (!file) {
        return "";
      }

      const xml = await file.async("text");
      return extractTextFromWordXml(xml);
    }),
  );

  return normalizeExtractedText(parts.filter(Boolean).join("\n\n"));
}

function extractTextFromWordXml(xml: string): string {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(xml, "application/xml");
  const paragraphs = Array.from(documentXml.getElementsByTagNameNS("*", "p"));

  return paragraphs
    .map((paragraph) => normalizeInlineXmlText(paragraph))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeInlineXmlText(element: Element): string {
  let text = "";

  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const child = node as Element;

    if (child.localName === "t") {
      text += child.textContent ?? "";
      return;
    }

    if (child.localName === "tab") {
      text += "\t";
      return;
    }

    if (child.localName === "br" || child.localName === "cr") {
      text += "\n";
      return;
    }

    text += normalizeInlineXmlText(child);
  });

  return text;
}

async function extractTextFromEpub(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentPaths = await getEpubContentPaths(zip);

  const parts = await Promise.all(
    contentPaths.map(async (path) => {
      const file = zip.file(path);
      if (!file) {
        return "";
      }

      return extractTextFromHtml(await file.async("text"));
    }),
  );

  return normalizeExtractedText(parts.filter(Boolean).join("\n\n"));
}

async function getEpubContentPaths(zip: JSZip): Promise<string[]> {
  const container = zip.file("META-INF/container.xml");

  if (!container) {
    return getFallbackEpubHtmlPaths(zip);
  }

  const containerXml = await container.async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const rootFilePath = containerDoc
    .getElementsByTagNameNS("*", "rootfile")
    .item(0)
    ?.getAttribute("full-path");

  if (!rootFilePath) {
    return getFallbackEpubHtmlPaths(zip);
  }

  const opfFile = zip.file(rootFilePath);
  if (!opfFile) {
    return getFallbackEpubHtmlPaths(zip);
  }

  const opfXml = await opfFile.async("text");
  const opfDoc = parser.parseFromString(opfXml, "application/xml");
  const manifest = new Map<string, string>();
  const basePath = rootFilePath.includes("/")
    ? rootFilePath.slice(0, rootFilePath.lastIndexOf("/") + 1)
    : "";

  Array.from(opfDoc.getElementsByTagNameNS("*", "item")).forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") ?? "";

    if (
      id &&
      href &&
      (mediaType.includes("xhtml") || mediaType.includes("html"))
    ) {
      manifest.set(id, joinZipPath(basePath, href));
    }
  });

  const spinePaths = Array.from(opfDoc.getElementsByTagNameNS("*", "itemref"))
    .map((itemRef) => itemRef.getAttribute("idref"))
    .filter((idref): idref is string => Boolean(idref))
    .map((idref) => manifest.get(idref))
    .filter((path): path is string => Boolean(path));

  return spinePaths.length > 0 ? spinePaths : getFallbackEpubHtmlPaths(zip);
}

function getFallbackEpubHtmlPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /\.(xhtml|html?)$/i.test(path))
    .sort();
}

function joinZipPath(basePath: string, href: string): string {
  const segments = `${basePath}${href}`.split("/");
  const normalized: string[] = [];

  segments.forEach((segment) => {
    if (!segment || segment === ".") {
      return;
    }

    if (segment === "..") {
      normalized.pop();
      return;
    }

    normalized.push(segment);
  });

  return normalized.join("/");
}

function extractTextFromHtml(html: string): string {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, "text/html");
  htmlDoc.querySelectorAll("script, style, nav").forEach((node) => {
    node.remove();
  });

  return normalizeExtractedText(htmlDoc.body?.innerText ?? "");
}

async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const data = new Uint8Array(arrayBuffer);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if (typeof item === "object" && item && "str" in item) {
          return (item as PdfTextItem).str ?? "";
        }

        return "";
      })
      .join(" ");

    pages.push(pageText);
  }

  return normalizeExtractedText(pages.join("\n\n"));
}

function extractTextFromBinaryBestEffort(arrayBuffer: ArrayBuffer): string {
  const decoders = [new TextDecoder("utf-8"), new TextDecoder("utf-16le")];
  const candidates = decoders.map((decoder) =>
    cleanBinaryText(decoder.decode(arrayBuffer)),
  );

  return candidates.sort((first, second) => scoreText(second) - scoreText(first))[0];
}

function cleanBinaryText(text: string): string {
  const lines = text
    .replace(/\u0000/g, "\n")
    .replace(/[^\t\n\u0020-\u007e\u00a0-\uffff]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .split(/\n| {4,}/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4)
    .filter((line) => /[A-Za-z0-9\u3400-\u9fff]/.test(line));

  return normalizeExtractedText(lines.join("\n"));
}

function scoreText(text: string): number {
  const readableCharacters = text.match(/[A-Za-z0-9\u3400-\u9fff]/g)?.length ?? 0;
  return readableCharacters - text.length * 0.02;
}
