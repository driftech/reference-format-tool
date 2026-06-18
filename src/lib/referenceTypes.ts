export type ReferenceType =
  | "journal"
  | "book"
  | "thesis"
  | "conference"
  | "web"
  | "unknown";

export type ReferenceLanguage = "zh" | "en" | "unknown";

export type MetadataSource =
  | "pdf"
  | "crossref"
  | "datacite"
  | "openalex"
  | "local_zh"
  | "imported_bibliography"
  | "manual"
  | "unknown";

export type MetadataMatchMethod =
  | "doi"
  | "title"
  | "title_author_year"
  | "doi_unresolved"
  | "local_zh_parse"
  | "filename"
  | "manual"
  | "none";

export type MetadataCandidateSource = Exclude<MetadataSource, "unknown">;

export type MetadataCandidate = {
  id: string;
  source: MetadataCandidateSource;
  matchedBy: MetadataMatchMethod;
  confidence: number;
  item: ReferenceItem;
  raw?: unknown;
  warnings?: string[];
};

export type ReferenceItem = {
  id: string;
  rawText: string;
  sourceFileName?: string;
  sourceFileType?: string;
  originalFileName?: string;
  type: ReferenceType;
  authors: string[];
  year: string | null;
  title: string | null;
  sourceTitle: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  articleNumber?: string | null;
  edition?: string | null;
  institution?: string | null;
  publicationDate?: string | null;
  publishedOnline?: string | null;
  publishedPrint?: string | null;
  publisher: string | null;
  place: string | null;
  doi: string | null;
  url: string | null;
  accessDate: string | null;
  language: ReferenceLanguage;
  metadataSource?: MetadataSource;
  confidence?: number;
  matchedBy?: MetadataMatchMethod;
  needsReview?: boolean;
  extractionWarning?: string;
  rawMetadata?: unknown;
  candidates?: MetadataCandidate[];
  warnings: string[];
};

export const referenceTypeLabels: Record<ReferenceType, string> = {
  journal: "期刊论文",
  book: "图书",
  thesis: "学位论文",
  conference: "会议论文",
  web: "网页资料",
  unknown: "未知类型",
};

export const referenceLanguageLabels: Record<ReferenceLanguage, string> = {
  zh: "中文",
  en: "英文",
  unknown: "未知",
};
