type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfMetadataInfo = {
  Creator?: unknown;
  Producer?: unknown;
  Subject?: unknown;
  Title?: unknown;
};

export async function extractPdfText(file: File): Promise<{
  fullText: string;
  frontText: string;
  metadataTitle?: string;
  pdfMetadataText?: string;
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
  const metadata = await getPdfMetadata(pdf);
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = buildPageText(content.items as PdfTextItem[]);

    pageTexts.push(normalizeText(pageText));
  }

  return {
    fullText: normalizeText(pageTexts.join("\n\n")),
    frontText: normalizeText(pageTexts.slice(0, 2).join("\n\n")),
    metadataTitle: metadata.title,
    pdfMetadataText: metadata.metadataText,
    pageCount: pdf.numPages,
    warning: "???? PDF ????????????????????????",
  };
}

function buildPageText(items: PdfTextItem[]): string {
  const positionedItems = items
    .map((item, index) => ({
      index,
      text: (item.str ?? "").replace(/\s+/g, " ").trim(),
      x: Array.isArray(item.transform) ? Number(item.transform[4] ?? 0) : index,
      y: Array.isArray(item.transform) ? Number(item.transform[5] ?? 0) : -index,
    }))
    .filter((item) => item.text.length > 0);

  if (positionedItems.length === 0) {
    return "";
  }

  const lines: Array<{ y: number; items: typeof positionedItems }> = [];
  const yTolerance = 3;

  for (const item of positionedItems.sort((first, second) => second.y - first.y || first.x - second.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);

    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .sort((first, second) => second.y - first.y)
    .map((line) =>
      line.items
        .sort((first, second) => first.x - second.x || first.index - second.index)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

async function getPdfMetadata(pdf: {
  getMetadata?: () => Promise<{ info?: PdfMetadataInfo }>;
}): Promise<{ title?: string; metadataText?: string }> {
  try {
    const metadata = await pdf.getMetadata?.();
    const info = metadata?.info ?? {};
    const title = cleanMetadataString(info.Title);
    const metadataText = [info.Creator, info.Producer, info.Subject, info.Title]
      .map(cleanMetadataString)
      .filter(Boolean)
      .join("\n");

    return {
      title: title || undefined,
      metadataText: metadataText || undefined,
    };
  } catch {
    return {};
  }
}

function cleanMetadataString(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? normalizeText(value)
    : "";
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
