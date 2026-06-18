import { cleanDoi } from "@/lib/doiUtils";
import { resolveByDoi } from "@/lib/metadataResolvers/resolveByDoi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = cleanDoi(searchParams.get("doi") ?? "");

  if (!doi) {
    return Response.json(
      {
        success: false,
        candidates: [],
        warnings: [],
        error: "缺少有效 DOI 参数。",
      },
      { status: 400 },
    );
  }

  try {
    const result = await resolveByDoi(doi);

    if (!result.bestCandidate) {
      return Response.json(
        {
          success: false,
          bestCandidate: null,
          candidates: result.candidates,
          warnings: result.warnings,
          error: "开放元数据源未找到该 DOI 的可用记录。",
        },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      bestCandidate: result.bestCandidate,
      candidates: result.candidates,
      warnings: result.warnings,
    });
  } catch {
    return Response.json(
      {
        success: false,
        candidates: [],
        warnings: [],
        error: "DOI 查询失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
