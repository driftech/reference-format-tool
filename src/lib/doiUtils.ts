const DOI_CANDIDATE_PATTERN =
  /(?:https?:\/\/(?:dx\.)?doi\.org\/|d\s*o\s*i\s*[:：]?\s*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi;

export type DoiDevSample = {
  name: string;
  text: string;
  expectedCandidates: string[];
  expectedBest?: string;
};

export const doiUtilsDevSamples: DoiDevSample[] = [
  {
    name: "plain DOI",
    text: "10.1016/j.enbuild.2023.113245",
    expectedCandidates: ["10.1016/j.enbuild.2023.113245"],
    expectedBest: "10.1016/j.enbuild.2023.113245",
  },
  {
    name: "doi.org URL with trailing period",
    text: "https://doi.org/10.1016/j.enbuild.2023.113245.",
    expectedCandidates: ["10.1016/j.enbuild.2023.113245"],
    expectedBest: "10.1016/j.enbuild.2023.113245",
  },
  {
    name: "doi colon prefix",
    text: "doi:10.1080/09613218.2020.1710093",
    expectedCandidates: ["10.1080/09613218.2020.1710093"],
    expectedBest: "10.1080/09613218.2020.1710093",
  },
  {
    name: "Chinese full-width DOI prefix",
    text: "DOI：10.3969/j.issn.1000-1234.2023.02.001。",
    expectedCandidates: ["10.3969/j.issn.1000-1234.2023.02.001"],
    expectedBest: "10.3969/j.issn.1000-1234.2023.02.001",
  },
  {
    name: "Chinese DOI with PDF spaces",
    text: "DOI：10 . 14006 / j . jzjgxb . 2023 . 02 . 001",
    expectedCandidates: ["10.14006/j.jzjgxb.2023.02.001"],
    expectedBest: "10.14006/j.jzjgxb.2023.02.001",
  },
  {
    name: "Chinese DOI with spaced prefix",
    text: "D O I：10.19799/j.cnki.2095-4239.2023.0001",
    expectedCandidates: ["10.19799/j.cnki.2095-4239.2023.0001"],
    expectedBest: "10.19799/j.cnki.2095-4239.2023.0001",
  },
  {
    name: "Chinese DOI with full-width punctuation",
    text: "DOI：10．3969／j．issn．1000-0000．2023．01．001",
    expectedCandidates: ["10.3969/j.issn.1000-0000.2023.01.001"],
    expectedBest: "10.3969/j.issn.1000-0000.2023.01.001",
  },
  {
    name: "Chinese DOI split across lines",
    text: "DOI：10.3969/\nj.issn.1000-0000.2023.01.001",
    expectedCandidates: ["10.3969/j.issn.1000-0000.2023.01.001"],
    expectedBest: "10.3969/j.issn.1000-0000.2023.01.001",
  },
  {
    name: "DOI prefix with trailing right parenthesis",
    text: "DOI 10.1007/s12273-021-0810-5)",
    expectedCandidates: ["10.1007/s12273-021-0810-5"],
    expectedBest: "10.1007/s12273-021-0810-5",
  },
  {
    name: "multiple DOI candidates",
    text:
      "Article DOI: 10.1016/j.enbuild.2023.113245\nReferences\n[1] https://doi.org/10.1080/09613218.2020.1710093\n[2] DOI 10.1016/j.enbuild.2023.113245.",
    expectedCandidates: [
      "10.1016/j.enbuild.2023.113245",
      "10.1080/09613218.2020.1710093",
    ],
    expectedBest: "10.1016/j.enbuild.2023.113245",
  },
  {
    name: "no DOI",
    text: "This source has no digital object identifier.",
    expectedCandidates: [],
  },
];

export function extractDoi(text: string): string | null {
  return pickBestDoi(extractDoiCandidates(text), text) ?? null;
}

export function extractDois(text: string): string[] {
  return extractDoiCandidates(text);
}

export function extractDoiCandidates(text: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const searchableText = normalizeDoiSearchText(text);

  for (const match of searchableText.matchAll(DOI_CANDIDATE_PATTERN)) {
    const doi = cleanDoi(match[0]);
    const key = doi.toLowerCase();

    if (doi && !seen.has(key)) {
      seen.add(key);
      candidates.push(doi);
    }
  }

  return candidates;
}

export function cleanDoi(raw: string): string {
  const normalized = normalizeDoiSearchText(raw)
    .replace(/^\s*https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^\s*d\s*o\s*i\s*[:：]?\s*/i, "")
    .replace(/\s+/g, "")
    .trim();
  const match = normalized.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  const cleaned = (match?.[0] ?? "")
    .replace(/[.,;，。；、)\]\}>]+$/g, "")
    .toLowerCase();

  return /^10\.\d{4,9}\//.test(cleaned) ? cleaned : "";
}

export function pickBestDoi(
  candidates: string[],
  firstPagesText?: string,
): string | undefined {
  const uniqueCandidates = uniqueDois(candidates);

  if (uniqueCandidates.length <= 1) {
    return uniqueCandidates[0];
  }

  const firstPagesCandidates = firstPagesText
    ? extractDoiCandidates(firstPagesText)
    : [];
  const firstPagesSet = new Set(firstPagesCandidates.map((doi) => doi.toLowerCase()));
  const firstPagesMatch = uniqueCandidates.find((doi) =>
    firstPagesSet.has(doi.toLowerCase()),
  );

  if (firstPagesMatch) {
    return firstPagesMatch;
  }

  return uniqueCandidates[0];
}

export function normalizeDoi(value: string): string | null {
  const doi = cleanDoi(value);
  return doi || null;
}

export function runDoiUtilsDevSamples(): Array<{
  name: string;
  passed: boolean;
  candidates: string[];
  best?: string;
}> {
  return doiUtilsDevSamples.map((sample) => {
    const candidates = extractDoiCandidates(sample.text);
    const best = pickBestDoi(candidates, sample.text);
    const candidatesMatch =
      candidates.length === sample.expectedCandidates.length &&
      candidates.every((candidate, index) => candidate === sample.expectedCandidates[index]);
    const bestMatches = best === sample.expectedBest;

    return {
      name: sample.name,
      passed: candidatesMatch && bestMatches,
      candidates,
      best,
    };
  });
}

function normalizeDoiSearchText(text: string): string {
  let normalized = text
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\r?\n/g, " ")
    .replace(/\s*([./:_-])\s*/g, "$1")
    .replace(/\b(10)\.(\d{4,9})\/\s*/gi, "$1.$2/")
    .replace(/\s+/g, " ")
    .trim();

  for (let index = 0; index < 6; index += 1) {
    const next = normalized.replace(
      /([A-Z0-9])\s*([./:_-])\s*([A-Z0-9])/gi,
      "$1$2$3",
    );

    if (next === normalized) {
      break;
    }

    normalized = next;
  }

  return normalized;
}

function uniqueDois(candidates: string[]): string[] {
  const seen = new Set<string>();
  const uniqueCandidates: string[] = [];

  for (const candidate of candidates) {
    const doi = cleanDoi(candidate);
    const key = doi.toLowerCase();

    if (doi && !seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(doi);
    }
  }

  return uniqueCandidates;
}
