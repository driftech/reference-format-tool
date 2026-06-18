import { searchMetadataByTitle } from "@/lib/metadataResolvers/searchByTitle";
import { serializeMetadataCandidates } from "@/lib/metadataResolvers/apiSerialization";
import { scoreMetadataCandidate } from "@/lib/metadataResolvers/scoring";
import type { MetadataCandidate } from "@/lib/referenceTypes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();
  const authors = parseListParam(searchParams.get("authors"));
  const year = (searchParams.get("year") ?? "").trim() || undefined;

  if (!title) {
    return Response.json(
      {
        success: false,
        candidates: [],
        warnings: [],
        error: "缺少 title 参数。",
      },
      { status: 400 },
    );
  }

  try {
    const candidates = serializeMetadataCandidates((await searchMetadataByTitle({
      title,
      authors,
      year,
    })).map((candidate) =>
      rescoreTitleCandidate(candidate, {
        authors,
        title,
        year,
      }),
    ));

    return Response.json({
      success: candidates.length > 0,
      candidates,
      warnings:
        candidates.length > 0
          ? []
          : ["未找到可用开放元数据候选，建议手动编辑字段。"],
    });
  } catch {
    return Response.json(
      {
        success: false,
        candidates: [],
        warnings: [],
        error: "英文开放元数据查询失败。请稍后重试，或手动编辑字段。",
      },
      { status: 502 },
    );
  }
}

function parseListParam(value: string | null): string[] {
  return (value ?? "")
    .split(/[,，;；|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rescoreTitleCandidate(
  candidate: MetadataCandidate,
  extracted: {
    authors: string[];
    title: string;
    year?: string;
  },
): MetadataCandidate {
  const confidence = scoreMetadataCandidate({
    candidate: candidate.item,
    extracted: {
      titleCandidates: [extracted.title],
      authorCandidates: extracted.authors,
      yearCandidates: extracted.year ? [extracted.year] : [],
      sourceTitleCandidates: [],
    },
  });
  const warnings = [
    ...(candidate.warnings ?? []),
    ...(confidence < 0.9 ? ["题名检索候选需要用户确认。"] : []),
  ];

  return {
    ...candidate,
    confidence,
    matchedBy:
      extracted.authors.length > 0 || extracted.year
        ? "title_author_year"
        : "title",
    item: {
      ...candidate.item,
      confidence,
      matchedBy:
        extracted.authors.length > 0 || extracted.year
          ? "title_author_year"
          : "title",
      needsReview: confidence < 0.9 || candidate.item.needsReview,
      extractionWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
      warnings,
    },
    warnings,
  };
}
