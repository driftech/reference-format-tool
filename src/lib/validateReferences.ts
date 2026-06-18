import type { TargetReferenceFormat } from "./formatReferences";
import type { ReferenceItem } from "./referenceTypes";

export type ReferenceValidationStatus = "passed" | "review" | "missing";

export type ReferenceValidationIssue = {
  field?: keyof ReferenceItem;
  message: string;
  scope: "通用检查" | "GB/T 7714" | "APA 7th";
};

export type ReferenceValidationResult = {
  referenceId: string;
  referenceLabel: string;
  status: ReferenceValidationStatus;
  issues: ReferenceValidationIssue[];
};

const doiPattern = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

export function validateReferences(
  referenceItems: ReferenceItem[],
  targetStyle: TargetReferenceFormat,
): ReferenceValidationResult[] {
  return referenceItems.map((reference, index) => {
    const issues = [
      ...validateCommonFields(reference),
      ...(targetStyle === "apa-7"
        ? validateApa7Fields(reference)
        : validateGb7714Fields(reference)),
    ];
    const uniqueIssues = dedupeIssues(issues);

    return {
      referenceId: reference.id,
      referenceLabel: getReferenceLabel(reference, index),
      status: getValidationStatus(uniqueIssues),
      issues: uniqueIssues,
    };
  });
}

function validateCommonFields(
  reference: ReferenceItem,
): ReferenceValidationIssue[] {
  const issues: ReferenceValidationIssue[] = [];

  if (reference.authors.length === 0) {
    issues.push({
      field: "authors",
      message: "缺少作者信息，建议补充。",
      scope: "通用检查",
    });
  }

  if (!reference.year) {
    issues.push({
      field: "year",
      message: "缺少年份，已按现有信息输出，但建议补充后再投稿。",
      scope: "通用检查",
    });
  }

  if (!reference.title) {
    issues.push({
      field: "title",
      message: "缺少题名，建议检查原始文献信息。",
      scope: "通用检查",
    });
  }

  if (reference.type === "journal" && !reference.sourceTitle) {
    issues.push({
      field: "sourceTitle",
      message: "缺少期刊名，建议人工补充。",
      scope: "通用检查",
    });
  }

  if (reference.doi && !doiPattern.test(reference.doi.trim())) {
    issues.push({
      field: "doi",
      message: "DOI 格式可能异常，建议核对。",
      scope: "通用检查",
    });
  }

  if (reference.type === "unknown") {
    issues.push({
      field: "type",
      message: "未能可靠识别文献类型，建议人工核对。",
      scope: "通用检查",
    });
  }

  if (
    reference.warnings.some((warning) => warning.includes("题名可能来自文件名")) ||
    titleLooksDerivedFromFileName(reference)
  ) {
    issues.push({
      field: "title",
      message: "题名可能来自文件名，建议人工核对。",
      scope: "通用检查",
    });
  }

  return issues;
}

function titleLooksDerivedFromFileName(reference: ReferenceItem): boolean {
  if (!reference.title || !reference.sourceFileName) {
    return false;
  }

  const normalizedTitle = normalizeComparableText(reference.title);
  const normalizedFileName = normalizeComparableText(
    reference.sourceFileName.replace(/\.[^.\\/]+$/, ""),
  );

  return Boolean(
    normalizedTitle &&
      normalizedFileName &&
      (normalizedTitle === normalizedFileName ||
        normalizedFileName.includes(normalizedTitle) ||
        normalizedTitle.includes(normalizedFileName)),
  );
}

function validateGb7714Fields(
  reference: ReferenceItem,
): ReferenceValidationIssue[] {
  const issues: ReferenceValidationIssue[] = [];

  if (
    reference.type === "journal" &&
    hasMissing(reference, ["authors", "title", "sourceTitle", "year"])
  ) {
    issues.push({
      message: "GB/T 7714 期刊论文缺少作者、题名、期刊名或年份，投稿前请核对。",
      scope: "GB/T 7714",
    });
  }

  if (
    reference.type === "book" &&
    hasMissing(reference, ["authors", "title", "publisher", "year"])
  ) {
    issues.push({
      message: "GB/T 7714 图书缺少作者、书名、出版社或年份，投稿前请核对。",
      scope: "GB/T 7714",
    });
  }

  if (
    reference.type === "thesis" &&
    hasMissing(reference, ["authors", "title", "publisher", "year"])
  ) {
    issues.push({
      message: "GB/T 7714 学位论文缺少作者、题名、学校或年份，投稿前请核对。",
      scope: "GB/T 7714",
    });
  }

  if (reference.type === "web" && (!reference.title || !reference.url)) {
    issues.push({
      message: "GB/T 7714 网页资料缺少题名或 URL，投稿前请核对。",
      scope: "GB/T 7714",
    });
  }

  return issues;
}

function validateApa7Fields(reference: ReferenceItem): ReferenceValidationIssue[] {
  const issues: ReferenceValidationIssue[] = [];

  if (
    reference.type === "journal" &&
    hasMissing(reference, ["authors", "year", "title", "sourceTitle"])
  ) {
    issues.push({
      message: "APA 7th 期刊论文缺少作者、年份、题名或期刊名，投稿前请核对。",
      scope: "APA 7th",
    });
  }

  if (
    reference.type === "book" &&
    hasMissing(reference, ["authors", "year", "title", "publisher"])
  ) {
    issues.push({
      message: "APA 7th 图书缺少作者、年份、书名或出版社，投稿前请核对。",
      scope: "APA 7th",
    });
  }

  if (
    reference.type === "web" &&
    hasMissing(reference, ["authors", "year", "title", "url"])
  ) {
    issues.push({
      message: "APA 7th 网页资料缺少作者或机构、年份、网页标题或 URL，投稿前请核对。",
      scope: "APA 7th",
    });
  }

  if (!reference.year) {
    issues.push({
      field: "year",
      message: "年份缺失时 APA 7th 会使用 n.d.，请确认是否符合投稿要求。",
      scope: "APA 7th",
    });
  }

  return issues;
}

function hasMissing(
  reference: ReferenceItem,
  fields: Array<"authors" | keyof ReferenceItem>,
): boolean {
  return fields.some((field) => {
    if (field === "authors") {
      return reference.authors.length === 0;
    }

    return !reference[field];
  });
}

function getValidationStatus(
  issues: ReferenceValidationIssue[],
): ReferenceValidationStatus {
  if (
    issues.some(
      (issue) =>
        ["authors", "year", "title", "sourceTitle"].includes(issue.field ?? "") &&
        issue.message.includes("缺少"),
    )
  ) {
    return "missing";
  }

  return issues.length > 0 ? "review" : "passed";
}

function getReferenceLabel(reference: ReferenceItem, index: number): string {
  return reference.title || reference.sourceFileName || `第 ${index + 1} 条`;
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "");
}

function dedupeIssues(
  issues: ReferenceValidationIssue[],
): ReferenceValidationIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.scope}:${issue.field ?? ""}:${issue.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
