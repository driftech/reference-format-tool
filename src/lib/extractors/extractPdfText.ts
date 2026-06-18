type PdfTextItem = {
  str?: string;
};

export async function extractPdfText(file: File): Promise<{
  fullText: string;
  frontText: string;
  metadataTitle?: string;
  pageCount: number;
  warning?: string;
}> {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const metadataTitle = await getPdfMetadataTitle(pdf);
  const pageTexts: string[] = [];

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

    pageTexts.push(normalizeText(pageText));
  }

  return {
    fullText: normalizeText(pageTexts.join("\n\n")),
    frontText: normalizeText(pageTexts.slice(0, 2).join("\n\n")),
    metadataTitle,
    pageCount: pdf.numPages,
    warning: "复杂排版 PDF 可能导致文字顺序异常，后续识别结果需要人工核对。",
  };
}

async function getPdfMetadataTitle(pdf: {
  getMetadata?: () => Promise<{ info?: { Title?: unknown } }>;
}): Promise<string | undefined> {
  try {
    const metadata = await pdf.getMetadata?.();
    const title = metadata?.info?.Title;

    return typeof title === "string" && title.trim()
      ? normalizeText(title)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
