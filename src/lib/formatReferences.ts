import type { ReferenceItem } from "./referenceTypes";

export type TargetReferenceFormat =
  | "gbt-7714"
  | "english-numbered"
  | "apa-7"
  | "ieee"
  | string;

export type FormatReferenceOptions = {
  startIndex?: number;
};

export function formatReferences(
  references: ReferenceItem[],
  targetFormat: TargetReferenceFormat,
  options: FormatReferenceOptions = {},
): string {
  if (targetFormat === "gbt-7714") {
    return formatGB7714(references, options);
  }

  if (targetFormat === "english-numbered") {
    return formatEnglishNumbered(references, options);
  }

  if (targetFormat === "apa-7") {
    return formatAPA7(references);
  }

  if (targetFormat === "ieee") {
    return formatIEEE(references, options);
  }

  return references
    .map((reference, index) => `[${index + 1}] ${reference.rawText}`)
    .join("\n");
}

export function formatGB7714(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((reference, index) => {
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown") {
        return `${sequence} ${reference.rawText}`;
      }

      const formatted =
        reference.type === "journal"
          ? formatJournal(reference)
          : reference.type === "book"
            ? formatBook(reference)
            : reference.type === "thesis"
              ? formatThesis(reference)
              : reference.type === "conference"
                ? formatConference(reference)
                : reference.type === "web"
                  ? formatWeb(reference)
                  : reference.rawText;

      return `${sequence} ${ensureFinalPeriod(formatted)}`;
    })
    .join("\n");
}

export function formatAPA7(referenceItems: ReferenceItem[]): string {
  return referenceItems
    .map((reference) => {
      if (reference.type === "unknown") {
        return reference.rawText;
      }

      const formatted =
        reference.type === "journal"
          ? formatApaJournal(reference)
          : reference.type === "book"
            ? formatApaBook(reference)
            : reference.type === "thesis"
              ? formatApaThesis(reference)
              : reference.type === "web"
                ? formatApaWeb(reference)
                : reference.rawText;

      return formatted || reference.rawText;
    })
    .join("\n");
}

export function formatEnglishNumbered(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((reference, index) => {
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown" && reference.rawText.trim()) {
        return `${sequence} ${ensureFinalPeriod(reference.rawText)}`;
      }

      const authors = formatEnglishNumberedAuthors(reference.authors);
      const title = cleanReferenceMarker(getReferenceTitle(reference));
      const source = formatEnglishNumberedSource(reference);
      const link = formatEnglishNumberedLink(reference);
      const body = joinSentenceParts([authors, title, source, link]);

      return `${sequence} ${ensureFinalPeriod(body || reference.rawText)}`;
    })
    .join("\n");
}

export function formatIEEE(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((reference, index) => {
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown" && reference.rawText.trim()) {
        return `${sequence} ${ensureFinalPeriod(reference.rawText)}`;
      }

      const formatted =
        reference.type === "journal"
          ? formatIeeeJournal(reference)
          : reference.type === "book"
            ? formatIeeeBook(reference)
            : reference.type === "conference"
              ? formatIeeeConference(reference)
              : reference.type === "thesis"
                ? formatIeeeThesis(reference)
                : reference.type === "web"
                  ? formatIeeeWeb(reference)
                  : reference.rawText;

      return `${sequence} ${ensureFinalPeriod(formatted || reference.rawText)}`;
    })
    .join("\n");
}

function formatJournal(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const lead = joinSentenceParts([formatAuthorList(reference.authors), `${title}[J]`]);
  const source = formatJournalSource(reference);
  return joinSentenceParts([lead, source, formatGbDoi(reference.doi)]);
}

function formatBook(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const lead = joinSentenceParts([formatAuthorList(reference.authors), `${title}[M]`]);
  const publication = formatPublication(reference.place, reference.publisher, reference.year);
  return joinSentenceParts([lead, publication]);
}

function formatThesis(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const lead = joinSentenceParts([formatAuthorList(reference.authors), `${title}[D]`]);
  const school = formatPublication(
    reference.place,
    reference.publisher ?? reference.institution ?? null,
    reference.year,
  );
  return joinSentenceParts([lead, school]);
}

function formatConference(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const lead = joinSentenceParts([formatAuthorList(reference.authors), `${title}[C]`]);
  const conference = reference.sourceTitle
    ? `//${cleanReferenceMarker(reference.sourceTitle)}`
    : "";
  const publication = formatPublication(reference.place, reference.publisher, reference.year);
  const details = publication
    ? reference.pages
      ? `${publication}: ${reference.pages}`
      : publication
    : reference.year && reference.pages
      ? `${reference.year}: ${reference.pages}`
      : reference.year || reference.pages || "";
  return joinSentenceParts([`${lead}${conference}`, details]);
}

function formatWeb(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const authorOrOrg = formatAuthorList(reference.authors);
  const releaseDate = reference.year ? `(${reference.year})` : "";
  const accessDate = reference.accessDate ? `[${reference.accessDate}]` : "";
  const url = reference.url ?? "";

  return joinSentenceParts([
    joinSentenceParts([authorOrOrg, `${title}[EB/OL]`]),
    `${releaseDate}${accessDate}`,
    url,
  ]);
}

function formatApaJournal(reference: ReferenceItem): string {
  const lead = formatApaLead(reference);
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const source = formatApaJournalSource(reference);

  return appendApaLink(joinSentenceParts([lead, title, source]), reference);
}

function formatApaBook(reference: ReferenceItem): string {
  const lead = formatApaLead(reference);
  const title = cleanReferenceMarker(getReferenceTitle(reference));

  return appendApaLink(
    joinSentenceParts([lead, title, reference.publisher]),
    reference,
  );
}

function formatApaThesis(reference: ReferenceItem): string {
  const lead = formatApaLead(reference);
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const degreeLabel = getApaThesisLabel(reference);
  const institution = reference.publisher ?? reference.institution ?? reference.sourceTitle;
  const thesisInfo = institution
    ? `${title} [${degreeLabel}, ${institution}]`
    : `${title} [${degreeLabel}]`;

  return appendApaLink(joinSentenceParts([lead, thesisInfo]), reference);
}

function formatApaWeb(reference: ReferenceItem): string {
  const lead = formatApaLead(reference);
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const siteName = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";

  return appendApaLink(joinSentenceParts([lead, title, siteName]), reference);
}

function formatIeeeJournal(reference: ReferenceItem): string {
  const authors = formatIeeeAuthors(reference.authors);
  const title = formatIeeeQuotedTitle(reference);
  const sourceTitle = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";
  const details = formatIeeeJournalDetails(reference);

  return appendIeeeLink(
    joinNonEmpty(
      [
        authors,
        title,
        joinNonEmpty([sourceTitle, details], ", "),
        reference.year,
      ],
      ", ",
    ),
    reference,
  );
}

function formatIeeeBook(reference: ReferenceItem): string {
  const authors = formatIeeeAuthors(reference.authors);
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  const publication = formatPublication(
    reference.place,
    reference.publisher,
    reference.year,
  );

  return appendIeeeLink(joinNonEmpty([authors, title, publication], ", "), reference);
}

function formatIeeeConference(reference: ReferenceItem): string {
  const authors = formatIeeeAuthors(reference.authors);
  const title = formatIeeeQuotedTitle(reference);
  const conference = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";
  const location = reference.place ?? "";
  const pages = reference.pages ? `pp. ${reference.pages}` : "";

  return appendIeeeLink(
    joinNonEmpty([authors, title, conference, location, reference.year, pages], ", "),
    reference,
  );
}

function formatIeeeThesis(reference: ReferenceItem): string {
  const authors = formatIeeeAuthors(reference.authors);
  const title = formatIeeeQuotedTitle(reference);
  const institution = reference.publisher ?? reference.institution ?? reference.sourceTitle;
  const location = reference.place ?? "";

  return appendIeeeLink(
    joinNonEmpty([authors, title, "thesis", institution, location, reference.year], ", "),
    reference,
  );
}

function formatIeeeWeb(reference: ReferenceItem): string {
  const authors = formatIeeeAuthors(reference.authors);
  const title = formatIeeeQuotedTitle(reference);
  const siteName = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";

  return appendIeeeLink(
    joinNonEmpty([authors, title, siteName, reference.year], ", "),
    reference,
  );
}

function formatApaLead(reference: ReferenceItem): string {
  const authors = formatApaAuthors(reference.authors);
  const year = reference.year ? `(${reference.year})` : "(n.d.)";
  if (!authors) {
    return year;
  }

  const separator = /[.。]$/.test(authors) ? " " : ". ";
  return `${authors}${separator}${year}`;
}

function formatApaAuthors(authors: string[]): string {
  const formattedAuthors = authors
    .map((author) => formatApaAuthor(author))
    .filter(Boolean);

  if (formattedAuthors.length === 0) {
    return "";
  }

  if (formattedAuthors.length === 1) {
    return formattedAuthors[0];
  }

  if (formattedAuthors.length === 2) {
    return `${formattedAuthors[0]}, & ${formattedAuthors[1]}`;
  }

  if (formattedAuthors.length > 20) {
    return `${formattedAuthors.slice(0, 19).join(", ")}, ... ${formattedAuthors.at(-1)}`;
  }

  return `${formattedAuthors.slice(0, -1).join(", ")}, & ${formattedAuthors.at(-1)}`;
}

function formatApaAuthor(author: string): string {
  const cleaned = author
    .replace(/\bet al\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[，,;；.。]+$/g, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (/[\u3400-\u9fff]/.test(cleaned)) {
    return cleaned;
  }

  if (looksLikeOrganizationAuthor(cleaned)) {
    return cleaned;
  }

  if (cleaned.includes(",")) {
    const [lastName, ...givenParts] = cleaned.split(",");
    const initials = formatApaInitials(givenParts.join(" "));
    return initials ? `${lastName.trim()}, ${initials}` : lastName.trim();
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return tokens[0];
  }

  const givenTokens = tokens.slice(1);
  if (givenTokens.every(isInitialToken)) {
    return `${tokens[0]}, ${formatApaInitials(givenTokens.join(" "))}`;
  }

  const lastName = tokens.at(-1) ?? "";
  const initials = formatApaInitials(tokens.slice(0, -1).join(" "));
  return initials ? `${lastName}, ${initials}` : lastName;
}

function formatApaInitials(value: string): string {
  return value
    .replace(/[，,]/g, " ")
    .split(/\s+/)
    .flatMap((part) => part.split(/(?=[A-Z]\.?$)/))
    .map((part) => part.replace(/[^A-Za-z-]/g, ""))
    .filter(Boolean)
    .map((part) => {
      if (part.includes("-")) {
        return part
          .split("-")
          .filter(Boolean)
          .map((segment) => `${segment[0].toUpperCase()}.`)
          .join("-");
      }

      return `${part[0].toUpperCase()}.`;
    })
    .join(" ");
}

function isInitialToken(token: string): boolean {
  return /^[A-Z](?:\.|[A-Z]\.)?$/.test(token) || /^[A-Z]{1,3}$/.test(token);
}

function looksLikeOrganizationAuthor(author: string): boolean {
  return /\b(organization|university|institute|association|department|ministry|agency|center|centre|office|committee|council|foundation|society|laboratory|group)\b/i.test(author);
}

function formatApaJournalSource(reference: ReferenceItem): string {
  const sourceTitle = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";
  const volumeIssue = formatVolumeIssue(reference.volume, reference.issue);
  const sourceParts = [sourceTitle, volumeIssue].filter(Boolean);
  const source = sourceParts.join(", ");
  const pagesOrArticle = reference.pages
    ? reference.pages
    : reference.articleNumber
      ? `Article ${reference.articleNumber}`
      : "";

  if (source && pagesOrArticle) {
    return `${source}, ${pagesOrArticle}`;
  }

  return source || pagesOrArticle || "";
}

function getApaThesisLabel(reference: ReferenceItem): string {
  if (/doctoral|doctor|dissertation|博士/i.test(reference.rawText)) {
    return "Doctoral dissertation";
  }

  if (/master|硕士/i.test(reference.rawText)) {
    return "Master's thesis";
  }

  return "Thesis";
}

function formatJournalSource(reference: ReferenceItem): string {
  const sourceTitle = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";
  const yearAndVolume = formatGbYearVolumeIssue(
    reference.year,
    reference.volume,
    reference.issue,
  );
  const source = joinNonEmpty([sourceTitle, yearAndVolume], ", ");
  const pagesOrArticle = reference.pages ?? reference.articleNumber ?? "";

  if (source && pagesOrArticle) {
    return `${source}: ${pagesOrArticle}`;
  }

  return source || pagesOrArticle;
}

function formatGbYearVolumeIssue(
  year: string | null,
  volume: string | null,
  issue: string | null,
): string {
  if (year && volume && issue) {
    return `${year}, ${volume}(${issue})`;
  }

  if (year && volume) {
    return `${year}, ${volume}`;
  }

  if (year && issue) {
    return `${year}(${issue})`;
  }

  if (volume && issue) {
    return `${volume}(${issue})`;
  }

  return year ?? volume ?? (issue ? `(${issue})` : "");
}

function formatVolumeIssue(
  volume: string | null,
  issue: string | null,
): string {
  if (volume && issue) {
    return `${volume}(${issue})`;
  }

  return volume ?? issue ?? "";
}

function formatPublication(
  place: string | null,
  publisher: string | null,
  year: string | null,
): string {
  const placePublisher =
    place && publisher
      ? `${place}: ${publisher}`
      : place
        ? place
        : publisher
          ? publisher
          : "";

  if (placePublisher && year) {
    return `${placePublisher}, ${year}`;
  }

  return placePublisher || year || "";
}

function formatGbDoi(doi: string | null): string {
  return doi ? `DOI: ${doi}` : "";
}

function formatAuthorList(authors: string[]): string {
  const cleanedAuthors = authors.map((author) => author.trim()).filter(Boolean);

  if (cleanedAuthors.length <= 3) {
    return cleanedAuthors.join(", ");
  }

  const suffix = cleanedAuthors.some((author) => /[\u3400-\u9fff]/.test(author))
    ? "等"
    : "et al";

  return `${cleanedAuthors.slice(0, 3).join(", ")}, ${suffix}`;
}

function cleanReferenceMarker(value: string): string {
  return value
    .replace(/^\s*\[[A-Za-z/]+\]\.?\s*/, "")
    .replace(/\s+\[[^[\]]*(?:thesis|dissertation)[^[\]]*\]\s*$/i, "")
    .replace(/\s*\[[A-Za-z/]+\]\s*$/i, "")
    .trim();
}

function appendApaLink(text: string, reference: ReferenceItem): string {
  const body = ensureFinalPeriod(text);
  const link = formatApaLink(reference);

  if (!link) {
    return body;
  }

  return body ? `${body} ${link}` : link;
}

function formatApaLink(reference: ReferenceItem): string {
  if (reference.doi) {
    return `https://doi.org/${reference.doi}`;
  }

  return reference.url ?? "";
}

function appendIeeeLink(text: string, reference: ReferenceItem): string {
  const body = ensureFinalPeriod(text);
  const link = formatEnglishNumberedLink(reference);

  if (!link) {
    return body;
  }

  return body ? `${body} ${link}` : link;
}

function formatIeeeQuotedTitle(reference: ReferenceItem): string {
  const title = cleanReferenceMarker(getReferenceTitle(reference));
  return title ? `"${title}"` : "";
}

function formatIeeeJournalDetails(reference: ReferenceItem): string {
  return joinNonEmpty(
    [
      reference.volume ? `vol. ${reference.volume}` : "",
      reference.issue ? `no. ${reference.issue}` : "",
      reference.pages
        ? `pp. ${reference.pages}`
        : reference.articleNumber
          ? `Art. no. ${reference.articleNumber}`
          : "",
    ],
    ", ",
  );
}

function formatEnglishNumberedSource(reference: ReferenceItem): string {
  const sourceTitle = reference.sourceTitle
    ? cleanReferenceMarker(reference.sourceTitle)
    : "";
  const year = reference.year ?? "";
  const volumeIssue = formatVolumeIssue(reference.volume, reference.issue);
  const pagesOrArticle = reference.pages ?? reference.articleNumber ?? "";
  const yearVolume = [year, volumeIssue].filter(Boolean).join(";");

  if (sourceTitle && yearVolume && pagesOrArticle) {
    return `${sourceTitle}. ${yearVolume}:${pagesOrArticle}`;
  }

  if (sourceTitle && yearVolume) {
    return `${sourceTitle}. ${yearVolume}`;
  }

  if (sourceTitle && pagesOrArticle) {
    return `${sourceTitle}. ${pagesOrArticle}`;
  }

  return sourceTitle || yearVolume || pagesOrArticle;
}

function formatEnglishNumberedLink(reference: ReferenceItem): string {
  if (reference.doi) {
    return normalizeDoiUrl(reference.doi);
  }

  return reference.url ?? "";
}

function normalizeDoiUrl(doi: string): string {
  const trimmed = doi.trim().replace(/[.。,\s]+$/g, "");

  if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }

  const normalizedDoi = trimmed.replace(/^doi:\s*/i, "");
  return `https://doi.org/${normalizedDoi}`;
}

function formatEnglishNumberedAuthors(authors: string[]): string {
  return authors
    .map((author) => formatEnglishNumberedAuthor(author))
    .filter(Boolean)
    .join(", ");
}

function formatEnglishNumberedAuthor(author: string): string {
  const cleaned = author
    .replace(/\bet al\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[，,;；.。]+$/g, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (/[\u3400-\u9fff]/.test(cleaned) || looksLikeOrganizationAuthor(cleaned)) {
    return cleaned;
  }

  if (cleaned.includes(",")) {
    const [familyName, ...givenParts] = cleaned.split(",");
    const initials = formatCompactInitials(givenParts.join(" "));
    return [familyName.trim(), initials].filter(Boolean).join(" ");
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return cleaned;
  }

  if (tokens.slice(1).every(isInitialToken)) {
    return `${tokens[0]} ${formatCompactInitials(tokens.slice(1).join(" "))}`;
  }

  const familyName = tokens.at(-1) ?? "";
  const initials = formatCompactInitials(tokens.slice(0, -1).join(" "));
  return [familyName, initials].filter(Boolean).join(" ");
}

function formatCompactInitials(value: string): string {
  return value
    .replace(/[，,]/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z-]/g, ""))
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .filter(Boolean)
        .map((segment) => segment[0].toUpperCase())
        .join("-"),
    )
    .join("");
}

function formatIeeeAuthors(authors: string[]): string {
  const formattedAuthors = authors
    .map((author) => formatIeeeAuthor(author))
    .filter(Boolean);

  if (formattedAuthors.length === 0) {
    return "";
  }

  if (formattedAuthors.length === 1) {
    return formattedAuthors[0];
  }

  if (formattedAuthors.length === 2) {
    return `${formattedAuthors[0]} and ${formattedAuthors[1]}`;
  }

  return `${formattedAuthors.slice(0, -1).join(", ")}, and ${formattedAuthors.at(-1)}`;
}

function formatIeeeAuthor(author: string): string {
  const cleaned = author
    .replace(/\bet al\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[，,;；.。]+$/g, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (/[\u3400-\u9fff]/.test(cleaned) || looksLikeOrganizationAuthor(cleaned)) {
    return cleaned;
  }

  if (cleaned.includes(",")) {
    const [familyName, ...givenParts] = cleaned.split(",");
    const initials = formatIeeeInitials(givenParts.join(" "));
    return [initials, familyName.trim()].filter(Boolean).join(" ");
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return cleaned;
  }

  if (tokens.slice(1).every(isInitialToken)) {
    const initials = formatIeeeInitials(tokens.slice(1).join(" "));
    return [initials, tokens[0]].filter(Boolean).join(" ");
  }

  const familyName = tokens.at(-1) ?? "";
  const initials = formatIeeeInitials(tokens.slice(0, -1).join(" "));
  return [initials, familyName].filter(Boolean).join(" ");
}

function formatIeeeInitials(value: string): string {
  return value
    .replace(/[，,]/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z-]/g, ""))
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .filter(Boolean)
        .map((segment) => `${segment[0].toUpperCase()}.`)
        .join("-"),
    )
    .join(" ");
}

function getReferenceTitle(reference: ReferenceItem): string {
  return reference.title?.trim() || "题名缺失";
}

function joinSentenceParts(parts: Array<string | null | undefined>): string {
  return removeEmptyPunctuation(joinNonEmpty(parts, ". "));
}

function ensureFinalPeriod(text: string): string {
  const trimmed = removeEmptyPunctuation(text);
  if (!trimmed) {
    return "";
  }

  return /[.。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinNonEmpty(
  parts: Array<string | null | undefined>,
  separator: string,
): string {
  return parts
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean)
    .join(separator);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeEmptyPunctuation(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\b(?:undefined|null)\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s*:\s*\./g, ".")
    .replace(/\(\)\s*:/g, "")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/([,;:])\s*([.。])/g, "$2")
    .replace(/[，,]\s*$/g, "")
    .trim();
}

function normalizeStartIndex(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : 1;
}

export function formatPreviewValue(value: string | null | undefined): string {
  return value?.trim() ? value : "未识别";
}

export function formatAuthors(authors: string[]): string {
  return authors.length > 0 ? authors.join("；") : "未识别";
}
