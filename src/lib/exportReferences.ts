import type { ReferenceItem } from "./referenceTypes";

export function buildBibTeX(referenceItems: ReferenceItem[]): string {
  return referenceItems.map(formatBibTeXEntry).join("\n\n");
}

export function buildRis(referenceItems: ReferenceItem[]): string {
  return referenceItems.map(formatRisEntry).join("\n");
}

export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatBibTeXEntry(reference: ReferenceItem, index: number): string {
  const key = buildCitationKey(reference, index);
  const type = reference.type === "book" ? "book" : reference.type === "thesis" ? "phdthesis" : "article";
  const fields = [
    ["author", reference.authors.join(" and ")],
    ["title", reference.title],
    ["journal", reference.sourceTitle],
    ["year", reference.year],
    ["volume", reference.volume],
    ["number", reference.issue],
    ["pages", reference.pages],
    ["publisher", reference.publisher],
    ["address", reference.place],
    ["doi", reference.doi],
    ["url", reference.url],
  ].filter(([, value]) => Boolean(value));

  return [
    `@${type}{${key},`,
    ...fields.map(([field, value]) => `  ${field} = {${escapeBibTeX(value ?? "")}},`),
    "}",
  ].join("\n");
}

function formatRisEntry(reference: ReferenceItem): string {
  const type =
    reference.type === "book"
      ? "BOOK"
      : reference.type === "thesis"
        ? "THES"
        : reference.type === "conference"
          ? "CONF"
          : reference.type === "web"
            ? "ELEC"
            : "JOUR";
  const lines = [`TY  - ${type}`];

  for (const author of reference.authors) {
    lines.push(`AU  - ${author}`);
  }

  addRisLine(lines, "TI", reference.title);
  addRisLine(lines, "T2", reference.sourceTitle);
  addRisLine(lines, "PY", reference.year);
  addRisLine(lines, "VL", reference.volume);
  addRisLine(lines, "IS", reference.issue);
  addRisLine(lines, "SP", reference.pages?.split("-")[0]);
  addRisLine(lines, "EP", reference.pages?.split("-")[1]);
  addRisLine(lines, "DO", reference.doi);
  addRisLine(lines, "UR", reference.url);
  addRisLine(lines, "PB", reference.publisher);
  addRisLine(lines, "CY", reference.place);
  lines.push("ER  -");

  return lines.join("\n");
}

function addRisLine(lines: string[], tag: string, value: string | null | undefined): void {
  if (value?.trim()) {
    lines.push(`${tag}  - ${value.trim()}`);
  }
}

function buildCitationKey(reference: ReferenceItem, index: number): string {
  const author = reference.authors[0]?.replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "") ?? "ref";
  const year = reference.year ?? "nd";
  return `${author}${year}_${index + 1}`;
}

function escapeBibTeX(value: string): string {
  return value.replace(/[{}]/g, "").trim();
}
