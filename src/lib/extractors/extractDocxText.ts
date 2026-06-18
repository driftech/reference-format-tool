import mammoth from "mammoth/mammoth.browser";

export async function extractDocxText(file: File): Promise<{
  fullText: string;
  warning?: string;
}> {
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });

  return {
    fullText: normalizeText(result.value),
    warning:
      result.messages.length > 0
        ? "DOCX 文本已提取，但复杂排版、脚注或特殊对象可能需要人工核对。"
        : undefined,
  };
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
