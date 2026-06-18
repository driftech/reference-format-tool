import { cleanDoi } from "../doiUtils";
import type { MetadataCandidate } from "../referenceTypes";
import { resolveCrossrefByDoi } from "./crossref";
import { resolveDataCiteByDoi } from "./datacite";
import { isCandidateComplete, scoreCandidate } from "./metadataMapping";
import { resolveOpenAlexByDoi } from "./openalex";

export type ResolveByDoiResult = {
  bestCandidate: MetadataCandidate | null;
  candidates: MetadataCandidate[];
  warnings: string[];
};

export async function resolveByDoi(doi: string): Promise<ResolveByDoiResult> {
  const cleanedDoi = cleanDoi(doi);
  const candidates: MetadataCandidate[] = [];
  const warnings: string[] = [];

  if (!cleanedDoi) {
    return {
      bestCandidate: null,
      candidates,
      warnings: ["DOI 无效，无法查询开放元数据源。"],
    };
  }

  const crossrefCandidate = await safeResolve(
    "Crossref",
    () => resolveCrossrefByDoi(cleanedDoi),
    warnings,
  );

  if (crossrefCandidate) {
    candidates.push(crossrefCandidate);

    if (isCandidateComplete(crossrefCandidate)) {
      return {
        bestCandidate: crossrefCandidate,
        candidates,
        warnings,
      };
    }

    warnings.push("Crossref 返回结果不完整，继续查询 DataCite 和 OpenAlex。");
  } else {
    warnings.push("Crossref 未返回该 DOI 的元数据。");
  }

  const dataCiteCandidate = await safeResolve(
    "DataCite",
    () => resolveDataCiteByDoi(cleanedDoi),
    warnings,
  );

  if (dataCiteCandidate) {
    candidates.push(dataCiteCandidate);
  } else {
    warnings.push("DataCite 未返回该 DOI 的元数据。");
  }

  const openAlexCandidate = await safeResolve(
    "OpenAlex",
    () => resolveOpenAlexByDoi(cleanedDoi),
    warnings,
  );

  if (openAlexCandidate) {
    candidates.push(openAlexCandidate);
  } else {
    warnings.push("OpenAlex 未返回该 DOI 的元数据。");
  }

  return {
    bestCandidate: chooseBestCandidate(candidates),
    candidates,
    warnings,
  };
}

async function safeResolve(
  sourceName: string,
  resolver: () => Promise<MetadataCandidate | null>,
  warnings: string[],
): Promise<MetadataCandidate | null> {
  try {
    return await resolver();
  } catch {
    warnings.push(`${sourceName} 查询失败，已继续尝试其他数据源。`);
    return null;
  }
}

function chooseBestCandidate(
  candidates: MetadataCandidate[],
): MetadataCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((first, second) => {
    const firstComplete = isCandidateComplete(first) ? 1 : 0;
    const secondComplete = isCandidateComplete(second) ? 1 : 0;

    if (firstComplete !== secondComplete) {
      return secondComplete - firstComplete;
    }

    return scoreCandidate(second) - scoreCandidate(first);
  })[0];
}
