import { cleanDoi } from "../doiUtils";
import type {
  MetadataCandidate,
  MetadataCandidateSource,
  ReferenceItem,
  ReferenceLanguage,
  ReferenceType,
} from "../referenceTypes";

export type CrossrefDate = {
  "date-parts"?: Array<Array<number | string>>;
};

export type CrossrefAuthor = {
  given?: string;
  family?: string;
  name?: string;
  affiliation?: unknown;
};

export type CrossrefWork = {
  DOI?: string;
  URL?: string;
  type?: string;
  title?: string[];
  "container-title"?: string[];
  author?: CrossrefAuthor[];
  issued?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "published-online"?: CrossrefDate;
  volume?: string;
  issue?: string;
  page?: string;
  "article-number"?: string;
  publisher?: string;
  language?: string;
};

export type DataCiteCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
};

export type DataCiteAttributes = {
  doi?: string;
  url?: string;
  titles?: Array<{ title?: string }>;
  creators?: DataCiteCreator[];
  publisher?: string;
  publicationYear?: number | string;
  types?: {
    resourceType?: string;
    resourceTypeGeneral?: string;
  };
  container?: {
    title?: string;
    volume?: string;
    issue?: string;
    firstPage?: string;
    lastPage?: string;
  };
  language?: string;
};

export type DataCiteDoi = {
  id?: string;
  attributes?: DataCiteAttributes;
};

export type OpenAlexAuthor = {
  author?: {
    display_name?: string;
  };
};

export type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  type_crossref?: string;
  host_venue?: {
    display_name?: string;
    url?: string;
  };
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
    };
  };
  locations?: Array<{
    landing_page_url?: string;
    source?: {
      display_name?: string;
    };
  }>;
  authorships?: OpenAlexAuthor[];
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
};

type BuildCandidateInput = {
  articleNumber?: string | null;
  authors: string[];
  confidence: number;
  doi: string | null;
  issue?: string | null;
  language?: ReferenceLanguage;
  pages?: string | null;
  publisher?: string | null;
  raw: unknown;
  requestedDoi: string;
  source: MetadataCandidateSource;
  sourceTitle?: string | null;
  title?: string | null;
  type: ReferenceType;
  url?: string | null;
  volume?: string | null;
  warnings?: string[];
  year?: string | null;
};

export function mapCrossrefWorkToCandidate(
  work: CrossrefWork,
  requestedDoi: string,
): MetadataCandidate {
  const title = firstString(work.title);
  const sourceTitle = firstString(work["container-title"]);
  const authors = mapPersonList(work.author, "given", "family", "name");
  const year =
    extractYearFromCrossrefDate(work["published-print"]) ??
    extractYearFromCrossrefDate(work["published-online"]) ??
    extractYearFromCrossrefDate(work.issued);
  const doi = cleanDoi(work.DOI ?? requestedDoi) || cleanDoi(requestedDoi) || null;
  const type = mapCrossrefType(work.type);

  return buildMetadataCandidate({
    articleNumber: cleanOptionalString(work["article-number"]),
    authors,
    confidence: 0.95,
    doi,
    issue: cleanOptionalString(work.issue),
    pages: cleanOptionalString(work.page),
    publisher: cleanOptionalString(work.publisher),
    raw: work,
    requestedDoi,
    source: "crossref",
    sourceTitle,
    title,
    type,
    url: cleanOptionalString(work.URL),
    volume: cleanOptionalString(work.volume),
    year,
  });
}

export function mapDataCiteDoiToCandidate(
  data: DataCiteDoi,
  requestedDoi: string,
): MetadataCandidate {
  const attributes = data.attributes ?? {};
  const container = attributes.container;
  const firstPage = cleanOptionalString(container?.firstPage);
  const lastPage = cleanOptionalString(container?.lastPage);
  const doi = cleanDoi(attributes.doi ?? data.id ?? requestedDoi) || cleanDoi(requestedDoi) || null;
  const title = firstString(attributes.titles?.map((item) => item.title ?? ""));
  const sourceTitle = cleanOptionalString(container?.title);
  const authors = mapPersonList(attributes.creators, "givenName", "familyName", "name");
  const resourceTypeGeneral = cleanOptionalString(attributes.types?.resourceTypeGeneral);

  return buildMetadataCandidate({
    authors,
    confidence: 0.9,
    doi,
    issue: cleanOptionalString(container?.issue),
    pages: joinPages(firstPage, lastPage),
    publisher: cleanOptionalString(attributes.publisher),
    raw: data,
    requestedDoi,
    source: "datacite",
    sourceTitle,
    title,
    type: mapDataCiteType(resourceTypeGeneral),
    url: cleanOptionalString(attributes.url),
    volume: cleanOptionalString(container?.volume),
    year: attributes.publicationYear ? String(attributes.publicationYear) : null,
  });
}

export function mapOpenAlexWorkToCandidate(
  work: OpenAlexWork,
  requestedDoi: string,
): MetadataCandidate {
  const firstPage = cleanOptionalString(work.biblio?.first_page);
  const lastPage = cleanOptionalString(work.biblio?.last_page);
  const sourceTitle =
    cleanOptionalString(work.primary_location?.source?.display_name) ??
    cleanOptionalString(work.host_venue?.display_name) ??
    firstString(work.locations?.map((location) => location.source?.display_name ?? ""));
  const url =
    cleanOptionalString(work.doi) ??
    cleanOptionalString(work.primary_location?.landing_page_url) ??
    cleanOptionalString(work.host_venue?.url);
  const doi = cleanDoi(work.doi ?? requestedDoi) || cleanDoi(requestedDoi) || null;

  return buildMetadataCandidate({
    authors: (work.authorships ?? [])
      .map((authorship) => cleanOptionalString(authorship.author?.display_name) ?? "")
      .filter(Boolean),
    confidence: 0.85,
    doi,
    issue: cleanOptionalString(work.biblio?.issue),
    pages: joinPages(firstPage, lastPage),
    publisher: null,
    raw: work,
    requestedDoi,
    source: "openalex",
    sourceTitle,
    title: cleanOptionalString(work.title ?? work.display_name),
    type: mapOpenAlexType(work.type, work.type_crossref),
    url,
    volume: cleanOptionalString(work.biblio?.volume),
    year: work.publication_year ? String(work.publication_year) : null,
  });
}

export function isCandidateComplete(candidate: MetadataCandidate): boolean {
  const item = candidate.item;

  return Boolean(
    item.title &&
      item.authors.length > 0 &&
      item.year &&
      (item.type !== "journal" || item.sourceTitle),
  );
}

export function scoreCandidate(candidate: MetadataCandidate): number {
  const item = candidate.item;
  let score = candidate.confidence;

  if (item.title) {
    score += 0.04;
  }

  if (item.authors.length > 0) {
    score += 0.04;
  }

  if (item.year) {
    score += 0.03;
  }

  if (item.sourceTitle) {
    score += 0.03;
  }

  if (item.volume) {
    score += 0.01;
  }

  if (item.pages || item.articleNumber) {
    score += 0.01;
  }

  return score;
}

function buildMetadataCandidate(input: BuildCandidateInput): MetadataCandidate {
  const warnings = [
    ...(input.warnings ?? []),
    ...buildMissingFieldWarnings(input),
  ];
  const language =
    input.language ??
    detectReferenceLanguage(
      [input.title, input.sourceTitle, input.authors.join(" ")].filter(Boolean).join(" "),
    );
  const needsReview = warnings.length > 0;
  const item: ReferenceItem = {
    id: `${input.source}-${input.doi ?? input.requestedDoi}`,
    rawText: buildRawText(input),
    type: input.type,
    authors: input.authors,
    year: input.year ?? null,
    title: input.title ?? null,
    sourceTitle: input.sourceTitle ?? null,
    volume: input.volume ?? null,
    issue: input.issue ?? null,
    pages: input.pages ?? null,
    articleNumber: input.articleNumber ?? null,
    publisher: input.publisher ?? null,
    place: null,
    doi: input.doi,
    url: input.url ?? null,
    accessDate: null,
    language,
    metadataSource: input.source,
    confidence: input.confidence,
    matchedBy: "doi",
    needsReview,
    extractionWarning: needsReview ? warnings.join(" ") : undefined,
    rawMetadata: input.raw,
    warnings,
  };

  return {
    id: `${input.source}-candidate-${input.doi ?? input.requestedDoi}`,
    source: input.source,
    matchedBy: "doi",
    confidence: input.confidence,
    item,
    raw: input.raw,
    warnings,
  };
}

function buildMissingFieldWarnings(input: BuildCandidateInput): string[] {
  const label = getSourceLabel(input.source);
  const warnings: string[] = [];

  if (!input.title) {
    warnings.push(`${label} 未返回题名，建议人工核对。`);
  }

  if (input.authors.length === 0) {
    warnings.push(`${label} 未返回作者，建议人工核对。`);
  }

  if (!input.year) {
    warnings.push(`${label} 未返回出版年份，建议人工核对。`);
  }

  if (input.type === "journal" && !input.sourceTitle) {
    warnings.push(`${label} 未返回期刊名，建议人工核对。`);
  }

  return warnings;
}

function getSourceLabel(source: MetadataCandidateSource): string {
  return source === "crossref"
    ? "Crossref"
    : source === "datacite"
      ? "DataCite"
      : source === "openalex"
        ? "OpenAlex"
        : "元数据源";
}

function mapPersonList<T extends Record<string, unknown>>(
  people: T[] | undefined,
  givenKey: keyof T,
  familyKey: keyof T,
  nameKey: keyof T,
): string[] {
  if (!Array.isArray(people)) {
    return [];
  }

  return people
    .map((person) => {
      const given = cleanOptionalString(person[givenKey]);
      const family = cleanOptionalString(person[familyKey]);
      const name = cleanOptionalString(person[nameKey]);

      return given && family ? `${given} ${family}` : name ?? family ?? given ?? "";
    })
    .filter(Boolean);
}

function mapCrossrefType(type: string | undefined): ReferenceType {
  if (type === "journal-article") {
    return "journal";
  }

  if (type === "book" || type === "monograph" || type === "book-chapter") {
    return "book";
  }

  if (type === "dissertation") {
    return "thesis";
  }

  if (type === "proceedings-article" || type === "proceedings") {
    return "conference";
  }

  return "unknown";
}

function mapDataCiteType(type: string | null): ReferenceType {
  if (!type) {
    return "unknown";
  }

  if (/journalarticle|article/i.test(type)) {
    return "journal";
  }

  if (/book|bookchapter/i.test(type)) {
    return "book";
  }

  if (/dissertation|thesis/i.test(type)) {
    return "thesis";
  }

  if (/conference|conferencepaper|proceeding/i.test(type)) {
    return "conference";
  }

  return "unknown";
}

function mapOpenAlexType(type: string | undefined, crossrefType: string | undefined): ReferenceType {
  const value = `${type ?? ""} ${crossrefType ?? ""}`;

  if (/journal-article|article/i.test(value)) {
    return "journal";
  }

  if (/book|book-chapter|monograph/i.test(value)) {
    return "book";
  }

  if (/dissertation|thesis/i.test(value)) {
    return "thesis";
  }

  if (/proceedings|conference/i.test(value)) {
    return "conference";
  }

  return "unknown";
}

function extractYearFromCrossrefDate(date: CrossrefDate | undefined): string | null {
  const year = date?.["date-parts"]?.[0]?.[0];
  return typeof year === "number" || typeof year === "string" ? String(year) : null;
}

function detectReferenceLanguage(text: string): ReferenceLanguage {
  const chineseCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;

  if (chineseCount >= 6 && chineseCount >= latinCount / 4) {
    return "zh";
  }

  if (latinCount > 0) {
    return "en";
  }

  return "unknown";
}

function firstString(values: Array<string | null | undefined> | undefined): string | null {
  return Array.isArray(values)
    ? cleanOptionalString(values.find((value) => Boolean(cleanOptionalString(value))))
    : null;
}

function cleanOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function joinPages(firstPage: string | null, lastPage: string | null): string | null {
  if (firstPage && lastPage) {
    return firstPage === lastPage ? firstPage : `${firstPage}-${lastPage}`;
  }

  return firstPage ?? lastPage;
}

function buildRawText(input: BuildCandidateInput): string {
  return [
    input.authors.join(", "),
    input.title,
    input.sourceTitle,
    input.year,
    input.doi ? `DOI: ${input.doi}` : null,
  ]
    .filter(Boolean)
    .join(". ");
}
