import "server-only";

import { cleanDoi } from "../doiUtils";
import type { MetadataCandidate } from "../referenceTypes";
import {
  mapDataCiteDoiToCandidate,
  type DataCiteDoi,
} from "./metadataMapping";

const DATACITE_DOIS_ENDPOINT = "https://api.datacite.org/dois";
const DATACITE_TIMEOUT_MS = 10_000;

type DataCiteResponse = {
  data?: DataCiteDoi;
};

export async function resolveDataCiteByDoi(
  doi: string,
): Promise<MetadataCandidate | null> {
  const cleanedDoi = cleanDoi(doi);

  if (!cleanedDoi) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DATACITE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${DATACITE_DOIS_ENDPOINT}/${encodeURIComponent(cleanedDoi)}`,
      {
        headers: {
          Accept: "application/vnd.api+json, application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as DataCiteResponse;
    if (!payload.data) {
      return null;
    }

    return mapDataCiteDoiToCandidate(payload.data, cleanedDoi);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
