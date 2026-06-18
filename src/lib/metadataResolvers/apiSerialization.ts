import "server-only";

import type { MetadataCandidate, ReferenceItem } from "../referenceTypes";

export function serializeMetadataCandidate(
  candidate: MetadataCandidate,
): MetadataCandidate {
  return {
    ...candidate,
    item: serializeReferenceItem(candidate.item),
    raw: undefined,
  };
}

export function serializeMetadataCandidates(
  candidates: MetadataCandidate[],
): MetadataCandidate[] {
  return candidates.map(serializeMetadataCandidate);
}

export function serializeReferenceItem(item: ReferenceItem): ReferenceItem {
  return {
    ...item,
    candidates: item.candidates
      ? serializeMetadataCandidates(item.candidates)
      : undefined,
    rawMetadata: undefined,
  };
}
