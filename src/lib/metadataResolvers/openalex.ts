import "server-only";

import { cleanDoi } from "../doiUtils";
import type { MetadataCandidate } from "../referenceTypes";
import {
  mapOpenAlexWorkToCandidate,
  type OpenAlexWork,
} from "./metadataMapping";

const OPENALEX_WORKS_ENDPOINT = "https://api.openalex.org/works";
const OPENALEX_TIMEOUT_MS = 10_000;

export async function resolveOpenAlexByDoi(
  doi: string,
): Promise<MetadataCandidate | null> {
  const cleanedDoi = cleanDoi(doi);

  if (!cleanedDoi) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENALEX_TIMEOUT_MS);

  try {
    const url = new URL(`${OPENALEX_WORKS_ENDPOINT}/doi:${cleanedDoi}`);
    const apiKey = process.env.OPENALEX_API_KEY;

    if (apiKey) {
      url.searchParams.set("api_key", apiKey);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const work = (await response.json()) as OpenAlexWork;
    return mapOpenAlexWorkToCandidate(work, cleanedDoi);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
