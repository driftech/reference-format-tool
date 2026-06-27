import type { ReferenceItem } from "./referenceTypes";

export type TargetReferenceFormat =
  | "gbt-7714"
  | "english-numbered"
  | "apa-7"
  | "ieee"
  | "mla-9"
  | "chicago-author-date"
  | "harvard"
  | string;

export type FormatReferenceOptions = {
  startIndex?: number;
};

type SanitizedReferenceItem = Omit<
  ReferenceItem,
  | "authors"
  | "rawText"
  | "title"
  | "sourceTitle"
  | "volume"
  | "issue"
  | "pages"
  | "articleNumber"
  | "edition"
  | "institution"
  | "publicationDate"
  | "publishedOnline"
  | "publishedPrint"
  | "publisher"
  | "place"
  | "doi"
  | "url"
  | "accessDate"
> & {
  authors: string[];
  rawText: string;
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
};

type PageLocation = {
  value: string;
  isRange: boolean;
  isArticleNumber: boolean;
};

type ParsedName = {
  family: string;
  given: string;
  original: string;
  isChinese: boolean;
  isOrganization: boolean;
};

const COMMON_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
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

  if (targetFormat === "mla-9") {
    return formatMLA9(references);
  }

  if (targetFormat === "chicago-author-date") {
    return formatChicagoAuthorDate(references);
  }

  if (targetFormat === "harvard") {
    return formatHarvard(references);
  }

  const startIndex = normalizeStartIndex(options.startIndex);
  return references
    .map((reference, index) => `[${startIndex + index}] ${sanitizeReference(reference).rawText}`)
    .join("\n");
}

export function formatGB7714(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((input, index) => {
      const reference = sanitizeReference(input);
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown") {
        return `${sequence} ${ensureFinalPeriod(reference.rawText)}`;
      }

      const formatted =
        reference.type === "journal"
          ? formatGbtJournal(reference)
          : reference.type === "book"
            ? formatGbtBook(reference)
            : reference.type === "thesis"
              ? formatGbtThesis(reference)
              : reference.type === "conference"
                ? formatGbtConference(reference)
                : reference.type === "web"
                  ? formatGbtWeb(reference)
                  : reference.rawText;

      return `${sequence} ${ensureFinalPeriod(formatted || reference.rawText)}`;
    })
    .join("\n");
}

export function formatEnglishNumbered(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((input, index) => {
      const reference = sanitizeReference(input);
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown" && reference.rawText) {
        return `${sequence} ${ensureFinalPeriod(reference.rawText)}`;
      }

      const body = joinSentenceParts([
        formatCompactAuthorList(reference.authors, { etAlAfter: Number.POSITIVE_INFINITY }),
        getReferenceTitle(reference),
        formatEnglishNumberedSource(reference),
        formatDoiOrUrl(reference, "url"),
      ]);

      return `${sequence} ${body || ensureFinalPeriod(reference.rawText)}`;
    })
    .join("\n");
}

export function formatAPA7(referenceItems: ReferenceItem[]): string {
  return referenceItems
    .map((input) => {
      const reference = sanitizeReference(input);
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

export function formatIEEE(
  referenceItems: ReferenceItem[],
  options: FormatReferenceOptions = {},
): string {
  const startIndex = normalizeStartIndex(options.startIndex);

  return referenceItems
    .map((input, index) => {
      const reference = sanitizeReference(input);
      const sequence = `[${startIndex + index}]`;

      if (reference.type === "unknown" && reference.rawText) {
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

export function formatMLA9(referenceItems: ReferenceItem[]): string {
  return referenceItems
    .map((input) => {
      const reference = sanitizeReference(input);
      if (reference.type === "unknown" && reference.rawText) {
        return ensureFinalPeriod(reference.rawText);
      }

      const authors = formatMlaAuthors(reference.authors);
      const title = quoteTitle(toSimpleTitleCase(getReferenceTitle(reference)), '"', true);
      const source = formatMlaSource(reference);
      const body = joinNonEmpty([authors ? ensureFinalPeriod(authors) : "", title, source], " ");

      return appendPlainDoiUrl(body || reference.rawText, reference, true);
    })
    .join("\n");
}

export function formatChicagoAuthorDate(referenceItems: ReferenceItem[]): string {
  return referenceItems
    .map((input) => {
      const reference = sanitizeReference(input);
      if (reference.type === "unknown" && reference.rawText) {
        return ensureFinalPeriod(reference.rawText);
      }

      const authors = formatChicagoAuthors(reference.authors);
      const title = quoteTitle(toSimpleTitleCase(getReferenceTitle(reference)), '"', true);
      const source = formatChicagoSource(reference);
      const lead = joinNonEmpty([authors, reference.year], ". ");
      const body = joinNonEmpty([lead ? ensureFinalPeriod(lead) : "", title, source], " ");

      return appendPlainDoiUrl(body || reference.rawText, reference, true);
    })
    .join("\n");
}

export function formatHarvard(referenceItems: ReferenceItem[]): string {
  return referenceItems
    .map((input) => {
      const reference = sanitizeReference(input);
      if (reference.type === "unknown" && reference.rawText) {
        return ensureFinalPeriod(reference.rawText);
      }

      const authors = formatHarvardAuthors(reference.authors);
      const year = reference.year ? `(${reference.year})` : "";
      const title = quoteTitle(getReferenceTitle(reference), "'", false);
      const source = formatHarvardSource(reference);
      const body = joinNonEmpty([joinNonEmpty([authors, year], " "), joinNonEmpty([title, source], ", ")], " ");

      return appendHarvardLink(body || reference.rawText, reference);
    })
    .join("\n");
}

function formatGbtJournal(reference: SanitizedReferenceItem): string {
  return joinSentenceParts([
    joinSentenceParts([
      formatCompactAuthorList(reference.authors, { etAlAfter: 3 }),
      `${getReferenceTitle(reference)}[J]`,
    ]),
    formatGbtJournalSource(reference),
    formatDoiOrUrl(reference, "gbt-doi"),
  ]);
}

function formatGbtBook(reference: SanitizedReferenceItem): string {
  return joinSentenceParts([
    joinSentenceParts([
      formatGbtAuthors(reference.authors),
      `${getReferenceTitle(reference)}[M]`,
    ]),
    formatPublication(reference.place, reference.publisher, reference.year),
    formatDoiOrUrl(reference, "gbt-doi"),
  ]);
}

function formatGbtThesis(reference: SanitizedReferenceItem): string {
  return joinSentenceParts([
    joinSentenceParts([
      formatGbtAuthors(reference.authors),
      `${getReferenceTitle(reference)}[D]`,
    ]),
    formatPublication(
      reference.place,
      reference.publisher ?? reference.institution ?? null,
      reference.year,
    ),
    formatDoiOrUrl(reference, "gbt-doi"),
  ]);
}

function formatGbtConference(reference: SanitizedReferenceItem): string {
  const conference = reference.sourceTitle ? `//${reference.sourceTitle}` : "";
  const publication = formatPublication(reference.place, reference.publisher, reference.year);
  const location = getReferenceLocation(reference);
  const details = publication && location.value
    ? `${publication}: ${toHyphenRange(location.value)}`
    : publication || (location.value ? toHyphenRange(location.value) : "");

  return joinSentenceParts([
    `${joinSentenceParts([formatGbtAuthors(reference.authors), `${getReferenceTitle(reference)}[C]`])}${conference}`,
    details,
    formatDoiOrUrl(reference, "gbt-doi"),
  ]);
}

function formatGbtWeb(reference: SanitizedReferenceItem): string {
  const releaseDate = reference.year ? `(${reference.year})` : "";
  const accessDate = reference.accessDate ? `[${reference.accessDate}]` : "";

  return joinSentenceParts([
    joinSentenceParts([formatGbtAuthors(reference.authors), `${getReferenceTitle(reference)}[EB/OL]`]),
    `${releaseDate}${accessDate}`,
    reference.url,
  ]);
}

function formatGbtJournalSource(reference: SanitizedReferenceItem): string {
  const yearVolumeIssue = formatGbtYearVolumeIssue(reference.year, reference.volume, reference.issue);
  const source = joinNonEmpty([reference.sourceTitle, yearVolumeIssue], ", ");
  const location = getReferenceLocation(reference);

  if (source && location.value) {
    return `${source}: ${toHyphenRange(location.value)}`;
  }

  return source || (location.value ? toHyphenRange(location.value) : "");
}

function formatGbtYearVolumeIssue(
  year: string | null,
  volume: string | null,
  issue: string | null,
): string {
  if (year && volume && issue) return `${year}, ${volume}(${issue})`;
  if (year && volume) return `${year}, ${volume}`;
  if (year && issue) return `${year}(${issue})`;
  if (volume && issue) return `${volume}(${issue})`;
  return year ?? volume ?? (issue ? `(${issue})` : "");
}

function formatApaJournal(reference: SanitizedReferenceItem): string {
  return appendApaLink(
    joinSentenceParts([
      formatApaLead(reference),
      getReferenceTitle(reference),
      formatApaJournalSource(reference),
    ]),
    reference,
  );
}

function formatApaBook(reference: SanitizedReferenceItem): string {
  return appendApaLink(
    joinSentenceParts([
      formatApaLead(reference),
      getReferenceTitle(reference),
      reference.publisher,
    ]),
    reference,
  );
}

function formatApaThesis(reference: SanitizedReferenceItem): string {
  const institution = reference.publisher ?? reference.institution ?? reference.sourceTitle;
  const thesisInfo = institution
    ? `${getReferenceTitle(reference)} [${getApaThesisLabel(reference)}, ${institution}]`
    : `${getReferenceTitle(reference)} [${getApaThesisLabel(reference)}]`;

  return appendApaLink(joinSentenceParts([formatApaLead(reference), thesisInfo]), reference);
}

function formatApaWeb(reference: SanitizedReferenceItem): string {
  return appendApaLink(
    joinSentenceParts([formatApaLead(reference), getReferenceTitle(reference), reference.sourceTitle]),
    reference,
  );
}

function formatApaLead(reference: SanitizedReferenceItem): string {
  const authors = formatApaAuthors(reference.authors);
  const year = reference.year ? `(${reference.year})` : "(n.d.)";
  return authors ? `${authors} ${year}` : year;
}

function formatApaJournalSource(reference: SanitizedReferenceItem): string {
  const volumeIssue = formatVolumeIssue(reference.volume, reference.issue);
  const source = joinNonEmpty([reference.sourceTitle, volumeIssue], ", ");
  const location = getReferenceLocation(reference);
  const locationText = location.value
    ? location.isRange
      ? toEnDashRange(location.value)
      : location.value
    : "";

  return source && locationText ? `${source}, ${locationText}` : source || locationText;
}

function formatIeeeJournal(reference: SanitizedReferenceItem): string {
  const lead = joinNonEmpty(
    [formatIeeeAuthors(reference.authors), quoteIeeeArticleTitle(getReferenceTitle(reference))],
    ", ",
  );
  const source = joinNonEmpty(
    [joinNonEmpty([reference.sourceTitle, formatIeeeJournalDetails(reference)], ", "), reference.year],
    ", ",
  );

  return appendIeeeDoi(
    joinNonEmpty([lead, source], " "),
    reference,
  );
}

function formatIeeeBook(reference: SanitizedReferenceItem): string {
  return appendIeeeDoi(
    joinNonEmpty(
      [
        formatIeeeAuthors(reference.authors),
        getReferenceTitle(reference),
        formatPublication(reference.place, reference.publisher, reference.year),
      ],
      ", ",
    ),
    reference,
  );
}

function formatIeeeConference(reference: SanitizedReferenceItem): string {
  const location = getReferenceLocation(reference);
  const pageText = formatIeeeLocation(location);

  return appendIeeeDoi(
    joinNonEmpty(
      [
        formatIeeeAuthors(reference.authors),
        quoteIeeeTitle(getReferenceTitle(reference)),
        reference.sourceTitle,
        reference.place,
        pageText,
        reference.year,
      ],
      ", ",
    ),
    reference,
  );
}

function formatIeeeThesis(reference: SanitizedReferenceItem): string {
  return appendIeeeDoi(
    joinNonEmpty(
      [
        formatIeeeAuthors(reference.authors),
        quoteIeeeTitle(getReferenceTitle(reference)),
        "thesis",
        reference.publisher ?? reference.institution ?? reference.sourceTitle,
        reference.place,
        reference.year,
      ],
      ", ",
    ),
    reference,
  );
}

function formatIeeeWeb(reference: SanitizedReferenceItem): string {
  return appendIeeeDoi(
    joinNonEmpty(
      [
        formatIeeeAuthors(reference.authors),
        quoteIeeeTitle(getReferenceTitle(reference)),
        reference.sourceTitle,
        reference.year,
        reference.url,
      ],
      ", ",
    ),
    reference,
  );
}

function formatIeeeJournalDetails(reference: SanitizedReferenceItem): string {
  const location = getReferenceLocation(reference);
  return joinNonEmpty(
    [
      reference.volume ? `vol. ${reference.volume}` : "",
      reference.issue ? `no. ${reference.issue}` : "",
      formatIeeeLocation(location),
    ],
    ", ",
  );
}

function formatIeeeLocation(location: PageLocation): string {
  if (!location.value) return "";
  return location.isRange ? `pp. ${toEnDashRange(location.value)}` : `Art. no. ${location.value}`;
}

function formatEnglishNumberedSource(reference: SanitizedReferenceItem): string {
  const volumeIssue = formatVolumeIssue(reference.volume, reference.issue);
  const location = getReferenceLocation(reference);
  const yearVolume = joinNonEmpty([reference.year, volumeIssue], ";");
  const suffix = yearVolume && location.value ? `${yearVolume}:${toHyphenRange(location.value)}` : yearVolume || "";

  if (reference.sourceTitle && suffix) return `${reference.sourceTitle}. ${suffix}`;
  if (reference.sourceTitle && location.value) return `${reference.sourceTitle}. ${toHyphenRange(location.value)}`;
  return reference.sourceTitle || suffix || (location.value ? toHyphenRange(location.value) : "");
}

function formatMlaSource(reference: SanitizedReferenceItem): string {
  const location = getReferenceLocation(reference);
  const locationText = location.value
    ? location.isRange
      ? `pp. ${toEnDashRange(location.value)}`
      : location.value
    : "";
  const details = joinNonEmpty(
    [
      reference.sourceTitle ?? reference.publisher,
      reference.volume ? `vol. ${reference.volume}` : "",
      reference.issue ? `no. ${reference.issue}` : "",
      reference.year,
      locationText,
    ],
    ", ",
  );

  return details ? ensureFinalPeriod(details) : "";
}

function formatChicagoSource(reference: SanitizedReferenceItem): string {
  const volumeIssue = reference.volume
    ? reference.issue
      ? `${reference.volume} (${reference.issue})`
      : reference.volume
    : reference.issue
      ? `(${reference.issue})`
      : "";
  const location = getReferenceLocation(reference);
  const sourceAndVolume = joinNonEmpty([reference.sourceTitle ?? reference.publisher, volumeIssue], " ");
  const details = sourceAndVolume && location.value
    ? `${sourceAndVolume}: ${toEnDashRange(location.value)}`
    : sourceAndVolume || (location.value ? toEnDashRange(location.value) : "");

  return details ? ensureFinalPeriod(details) : "";
}

function formatHarvardSource(reference: SanitizedReferenceItem): string {
  const volumeIssue = formatVolumeIssue(reference.volume, reference.issue);
  const location = getReferenceLocation(reference);
  const locationText = location.value
    ? location.isRange
      ? `pp. ${toEnDashRange(location.value)}`
      : location.value
    : "";

  return joinNonEmpty([reference.sourceTitle ?? reference.publisher, volumeIssue, locationText], ", ");
}

function formatApaAuthors(authors: string[]): string {
  return joinAuthorsWithFinal(
    authors.map(formatApaAuthor).filter(Boolean),
    "&",
    true,
  );
}

function formatApaAuthor(author: string): string {
  const parsed = parseAuthor(author);
  if (!parsed) return "";
  if (parsed.isChinese || parsed.isOrganization) return parsed.original;
  return joinNonEmpty([parsed.family, formatInitials(parsed.given, { dots: true, compact: false })], ", ");
}

function formatGbtAuthors(authors: string[]): string {
  return formatCompactAuthorList(authors, { etAlAfter: 3 });
}

function formatCompactAuthorList(
  authors: string[],
  options: { etAlAfter: number },
): string {
  const parsedAuthors = authors.map(parseAuthor).filter((author): author is ParsedName => Boolean(author));
  if (parsedAuthors.length === 0) return "";

  const displayed = options.etAlAfter > 0 && parsedAuthors.length > options.etAlAfter
    ? parsedAuthors.slice(0, options.etAlAfter)
    : parsedAuthors;
  const hasChinese = displayed.some((author) => author.isChinese);
  const suffix = displayed.length < parsedAuthors.length ? (hasChinese ? "等" : "et al") : "";
  const names = displayed.map((author) => {
    if (author.isChinese || author.isOrganization) return author.original;
    return joinNonEmpty([author.family, formatInitials(author.given, { dots: false, compact: true })], " ");
  });

  return joinNonEmpty([names.join(", "), suffix], ", ");
}

function formatIeeeAuthors(authors: string[]): string {
  const formatted = authors.map(formatIeeeAuthor).filter(Boolean);
  return joinAuthorsWithFinal(formatted, "and", true);
}

function formatIeeeAuthor(author: string): string {
  const parsed = parseAuthor(author);
  if (!parsed) return "";
  if (parsed.isChinese || parsed.isOrganization) return parsed.original;
  return joinNonEmpty([formatInitials(parsed.given, { dots: true, compact: false }), parsed.family], " ");
}

function formatMlaAuthors(authors: string[]): string {
  const parsed = authors.map(parseAuthor).filter((author): author is ParsedName => Boolean(author));
  if (parsed.length === 0) return "";
  const first = parsed[0];
  const firstAuthor = first.isChinese || first.isOrganization
    ? first.original
    : joinNonEmpty([first.family, first.given], ", ");
  return parsed.length > 1 ? `${firstAuthor}, et al` : firstAuthor;
}

function formatChicagoAuthors(authors: string[]): string {
  const parsed = authors.map(parseAuthor).filter((author): author is ParsedName => Boolean(author));
  const formatted = parsed.map((author, index) => {
    if (author.isChinese || author.isOrganization) return author.original;
    return index === 0
      ? joinNonEmpty([author.family, author.given], ", ")
      : joinNonEmpty([author.given, author.family], " ");
  });
  return joinAuthorsWithFinal(formatted, "and", true);
}

function formatHarvardAuthors(authors: string[]): string {
  const formatted = authors
    .map(parseAuthor)
    .filter((author): author is ParsedName => Boolean(author))
    .map((author) => {
      if (author.isChinese || author.isOrganization) return author.original;
      return joinNonEmpty([author.family, formatInitials(author.given, { dots: true, compact: false })], ", ");
    });

  return joinAuthorsWithFinal(formatted, "and", false);
}

function joinAuthorsWithFinal(authors: string[], finalWord: "&" | "and", serialComma: boolean): string {
  if (authors.length === 0) return "";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} ${finalWord} ${authors[1]}`;
  const comma = serialComma ? "," : "";
  return `${authors.slice(0, -1).join(", ")}${comma} ${finalWord} ${authors.at(-1)}`;
}

function parseAuthor(author: string): ParsedName | null {
  const cleaned = cleanText(author)
    .replace(/\bet al\.?/gi, "")
    .replace(/[,;\uFF0C\u3002\u3001]+$/g, "")
    .trim();

  if (!cleaned) return null;

  const isChinese = /[\u3400-\u9fff]/.test(cleaned);
  const isOrganization = looksLikeOrganizationAuthor(cleaned);

  if (isChinese || isOrganization) {
    return {
      family: cleaned,
      given: "",
      original: cleaned,
      isChinese,
      isOrganization,
    };
  }

  if (cleaned.includes(",")) {
    const [family, ...givenParts] = cleaned.split(",");
    return {
      family: cleanText(family),
      given: cleanText(givenParts.join(" ")),
      original: cleaned,
      isChinese: false,
      isOrganization: false,
    };
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return {
      family: tokens[0],
      given: "",
      original: cleaned,
      isChinese: false,
      isOrganization: false,
    };
  }

  if (tokens.slice(1).every(isInitialToken)) {
    return {
      family: tokens[0],
      given: tokens.slice(1).join(" "),
      original: cleaned,
      isChinese: false,
      isOrganization: false,
    };
  }

  return {
    family: tokens.at(-1) ?? "",
    given: tokens.slice(0, -1).join(" "),
    original: cleaned,
    isChinese: false,
    isOrganization: false,
  };
}

function formatInitials(
  value: string,
  options: { dots: boolean; compact: boolean },
): string {
  return value
    .replace(/-/g, " - ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "-")
    .map((part) => part.replace(/[^A-Za-z\u00C0-\u024F]/g, ""))
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${options.dots ? "." : ""}`)
    .join(options.compact ? "" : " ");
}

function isInitialToken(token: string): boolean {
  return /^[A-Z]\.?$/i.test(token) || /^[A-Z]{1,4}$/.test(token.replace(/\./g, ""));
}

function looksLikeOrganizationAuthor(author: string): boolean {
  return /\b(organization|university|institute|association|department|ministry|agency|center|centre|office|committee|council|foundation|society|laboratory|group|team)\b/i.test(author);
}

function getReferenceLocation(reference: SanitizedReferenceItem): PageLocation {
  const pageStart = getRawMetadataString(reference, ["pageStart", "firstPage", "first-page"]);
  const pageEnd = getRawMetadataString(reference, ["pageEnd", "lastPage", "last-page"]);

  if (pageStart && pageEnd) {
    return {
      value: `${pageStart}-${pageEnd}`,
      isRange: true,
      isArticleNumber: false,
    };
  }

  if (reference.pages) {
    return {
      value: reference.pages,
      isRange: isPageRange(reference.pages),
      isArticleNumber: isArticleNumber(reference.pages),
    };
  }

  if (pageStart) {
    return {
      value: pageStart,
      isRange: false,
      isArticleNumber: false,
    };
  }

  const articleNumber =
    reference.articleNumber ??
    getRawMetadataString(reference, ["article_number", "article-number", "elocationId", "eLocationID"]);

  return {
    value: articleNumber ?? "",
    isRange: false,
    isArticleNumber: Boolean(articleNumber),
  };
}

function isPageRange(value: string): boolean {
  return /[A-Za-z]?\d+\s*[-\u2013\u2014]\s*[A-Za-z]?\d+/.test(value);
}

function isArticleNumber(value: string): boolean {
  const cleaned = cleanText(value);
  if (!cleaned || isPageRange(cleaned)) return false;
  if (/^e\d+$/i.test(cleaned)) return true;
  if (/^\d{5,}$/.test(cleaned)) return true;
  return /^article\s+\w+/i.test(cleaned);
}

function formatVolumeIssue(volume: string | null, issue: string | null): string {
  if (volume && issue) return `${volume}(${issue})`;
  return volume ?? issue ?? "";
}

function formatPublication(
  place: string | null,
  publisher: string | null,
  year: string | null,
): string {
  const placePublisher = place && publisher ? `${place}: ${publisher}` : place || publisher || "";
  return placePublisher && year ? `${placePublisher}, ${year}` : placePublisher || year || "";
}

function getReferenceTitle(reference: SanitizedReferenceItem): string {
  return cleanReferenceMarker(reference.title || reference.rawText || "");
}

function getApaThesisLabel(reference: SanitizedReferenceItem): string {
  if (/doctoral|doctor|dissertation|博士/i.test(reference.rawText)) return "Doctoral dissertation";
  if (/master|硕士/i.test(reference.rawText)) return "Master's thesis";
  return "Thesis";
}

function formatDoiOrUrl(reference: SanitizedReferenceItem, mode: "url" | "gbt-doi"): string {
  if (reference.doi) {
    return mode === "gbt-doi" ? `DOI: ${reference.doi}` : formatDoiUrl(reference.doi);
  }
  return reference.url ?? "";
}

function appendApaLink(text: string, reference: SanitizedReferenceItem): string {
  return appendPlainDoiUrl(text, reference, false);
}

function appendPlainDoiUrl(
  text: string,
  reference: SanitizedReferenceItem,
  finalPeriod: boolean,
): string {
  const body = ensureFinalPeriod(text);
  const link = formatDoiOrUrl(reference, "url");
  const joined = link ? joinNonEmpty([body, link], " ") : body;
  return finalPeriod ? ensureFinalPeriod(joined) : joined;
}

function appendIeeeDoi(text: string, reference: SanitizedReferenceItem): string {
  const body = removeEmptyPunctuation(text);
  const doi = reference.doi ? `doi: ${reference.doi}` : "";
  const url = !doi && reference.url ? reference.url : "";
  return joinNonEmpty([body, doi || url], ", ");
}

function appendHarvardLink(text: string, reference: SanitizedReferenceItem): string {
  const body = ensureFinalPeriod(text);
  const link = formatDoiOrUrl(reference, "url");
  return link ? `${body} Available at: ${link}.` : body;
}

function normalizeDoi(value: string | null | undefined): string | null {
  const raw = cleanText(value);
  if (!raw) return null;

  const withoutPrefix = raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/^DOI\s*/i, "")
    .trim();
  const doi = withoutPrefix.match(/10\.\d{4,9}\/[^\s<>"']+/i)?.[0] ?? withoutPrefix;
  const cleaned = doi.replace(/[.,;)\]\u3002，；、\s]+$/g, "");

  return cleaned || null;
}

function formatDoiUrl(value: string): string {
  const doi = normalizeDoi(value);
  if (!doi) return "";
  return `https://doi.org/${doi}`;
}

function sanitizeReference(reference: ReferenceItem): SanitizedReferenceItem {
  return {
    ...reference,
    rawText: cleanText(reference.rawText),
    authors: reference.authors.map(cleanText).filter(Boolean),
    title: cleanOptionalText(reference.title),
    sourceTitle: normalizeSourceName(reference.sourceTitle),
    volume: cleanOptionalText(reference.volume),
    issue: cleanOptionalText(reference.issue),
    pages: cleanPages(reference.pages),
    articleNumber: cleanOptionalText(reference.articleNumber),
    edition: cleanOptionalText(reference.edition),
    institution: cleanOptionalText(reference.institution),
    publicationDate: cleanOptionalText(reference.publicationDate),
    publishedOnline: cleanOptionalText(reference.publishedOnline),
    publishedPrint: cleanOptionalText(reference.publishedPrint),
    publisher: normalizeSourceName(reference.publisher),
    place: cleanOptionalText(reference.place),
    doi: normalizeDoi(reference.doi),
    url: cleanOptionalText(reference.url),
    accessDate: cleanOptionalText(reference.accessDate),
  };
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function cleanPages(value: string | null | undefined): string | null {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  return cleaned
    .replace(/\s*[-\u2013\u2014]\s*/g, "-")
    .replace(/^pp?\.\s*/i, "")
    .replace(/^pages?\s*/i, "");
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtmlEntities(String(value))
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourceName(value: string | null | undefined): string | null {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  return cleaned.replace(/\s*&\s*/g, " and ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);?/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);?/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, entity: string) => COMMON_HTML_ENTITIES[entity.toLowerCase()] ?? match);
}

function cleanReferenceMarker(value: string): string {
  return cleanText(value)
    .replace(/^\s*\[[A-Za-z/]+\]\.?\s*/, "")
    .replace(/\s+\[[^[\]]*(?:thesis|dissertation)[^[\]]*\]\s*$/i, "")
    .replace(/\s*\[[A-Za-z/]+\]\s*$/i, "")
    .replace(/[.!?\u3002\uFF01\uFF1F]+$/g, "")
    .trim();
}

function quoteTitle(title: string, quote: '"' | "'", periodInsideQuote: boolean): string {
  const cleaned = cleanReferenceMarker(title);
  if (!cleaned) return "";
  return `${quote}${cleaned}${periodInsideQuote ? "." : ""}${quote}`;
}

function quoteIeeeTitle(title: string): string {
  const cleaned = cleanReferenceMarker(title);
  return cleaned ? `"${cleaned}"` : "";
}

function quoteIeeeArticleTitle(title: string): string {
  const cleaned = cleanReferenceMarker(title);
  return cleaned ? `"${cleaned},"` : "";
}

function toSimpleTitleCase(value: string): string {
  const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "with"]);
  let index = 0;
  return value.replace(/\b[\p{L}][\p{L}'-]*/gu, (word) => {
    index += 1;
    if (/[A-Z]{2,}|\d/.test(word)) return word;
    if (index > 1 && smallWords.has(word.toLowerCase())) return word.toLowerCase();
    return `${word[0].toLocaleUpperCase()}${word.slice(1)}`;
  });
}

function toHyphenRange(value: string): string {
  return cleanText(value).replace(/\s*[\u2013\u2014]\s*/g, "-").replace(/\s*-\s*/g, "-");
}

function toEnDashRange(value: string): string {
  return cleanText(value).replace(/\s*[-\u2014]\s*/g, "–").replace(/\s*\u2013\s*/g, "–");
}

function getRawMetadataString(
  reference: SanitizedReferenceItem,
  keys: string[],
): string | null {
  const raw = reference.rawMetadata;
  if (!raw || typeof raw !== "object") return null;
  const records = [
    raw,
    (raw as Record<string, unknown>).biblio,
    (raw as Record<string, unknown>).container,
    (raw as Record<string, unknown>).attributes,
    ((raw as Record<string, unknown>).attributes as Record<string, unknown> | undefined)?.container,
  ].filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!keySet.has(key.toLowerCase())) continue;
      if (typeof value === "string" || typeof value === "number") {
        const cleaned = cleanOptionalText(String(value));
        if (cleaned) return cleaned;
      }
    }
  }

  return null;
}

function joinSentenceParts(parts: Array<string | null | undefined>): string {
  return removeEmptyPunctuation(joinNonEmpty(parts, ". "));
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .map((part) => removeEmptyPunctuation(part ?? ""))
    .filter(Boolean)
    .join(separator);
}

function ensureFinalPeriod(text: string): string {
  const trimmed = removeEmptyPunctuation(text);
  if (!trimmed) return "";
  return /[.!?\u3002]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function removeEmptyPunctuation(value: string): string {
  return cleanText(value)
    .replace(/\b(?:undefined|null|NaN)\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s*:\s*\./g, ".")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/([,;:])\s*([.])/g, "$2")
    .replace(/,\s*$/g, "")
    .trim();
}

function normalizeStartIndex(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : 1;
}

export function formatPreviewValue(value: string | null | undefined): string {
  return cleanText(value) || "未识别";
}

export function formatAuthors(authors: string[]): string {
  const cleaned = authors.map(cleanText).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join("、") : "未识别";
}
