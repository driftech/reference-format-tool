import { cleanDoi } from "@/lib/doiUtils";
import { resolveCrossrefByDoi } from "@/lib/metadataResolvers/crossref";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = cleanDoi(searchParams.get("doi") ?? "");

  if (!doi) {
    return Response.json(
      {
        success: false,
        error: "缺少有效 DOI 参数。",
      },
      { status: 400 },
    );
  }

  try {
    const candidate = await resolveCrossrefByDoi(doi);

    if (!candidate) {
      return Response.json(
        {
          success: false,
          error: "Crossref 未找到该 DOI 的元数据，或该 DOI 不属于 Crossref。",
        },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      candidate,
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: "Crossref 查询失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
