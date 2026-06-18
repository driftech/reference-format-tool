import { cleanDoi } from "../doiUtils";
import type { MetadataCandidate } from "../referenceTypes";
import {
  mapCrossrefWorkToCandidate,
  type CrossrefWork,
} from "./metadataMapping";

const CROSSREF_WORKS_ENDPOINT = "https://api.crossref.org/works";
const CROSSREF_TIMEOUT_MS = 10_000;

type CrossrefWorkResponse = {
  status?: string;
  message?: CrossrefWork;
};

export async function resolveCrossrefByDoi(
  doi: string,
): Promise<MetadataCandidate | null> {
  const cleanedDoi = cleanDoi(doi);

  if (!cleanedDoi) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CROSSREF_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${CROSSREF_WORKS_ENDPOINT}/${encodeURIComponent(cleanedDoi)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "reference-format-tool/0.1 (mailto:anonymous@example.com)",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as CrossrefWorkResponse;
    if (!payload.message) {
      return null;
    }

    return mapCrossrefWorkToCandidate(payload.message, cleanedDoi);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
