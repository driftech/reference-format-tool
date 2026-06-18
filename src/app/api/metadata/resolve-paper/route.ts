import {
  resolvePaperMetadata,
  type ResolvePaperMetadataResult,
} from "@/lib/metadataResolvers/resolvePaperMetadata";
import {
  serializeMetadataCandidates,
  serializeReferenceItem,
} from "@/lib/metadataResolvers/apiSerialization";

export const dynamic = "force-dynamic";

type ResolvePaperRequestBody = {
  fileName?: string;
  firstPagesText?: string;
  fullText?: string;
};

export async function POST(request: Request) {
  let body: ResolvePaperRequestBody;

  try {
    body = (await request.json()) as ResolvePaperRequestBody;
  } catch {
    return Response.json(
      {
        success: false,
        error: "请求内容不是有效 JSON。",
      },
      { status: 400 },
    );
  }

  if (!body.fileName) {
    return Response.json(
      {
        success: false,
        error: "缺少 fileName 参数。",
      },
      { status: 400 },
    );
  }

  try {
    const result: ResolvePaperMetadataResult = await resolvePaperMetadata({
      fileName: body.fileName,
      firstPagesText: body.firstPagesText ?? "",
      fullText: body.fullText ?? "",
    });

    return Response.json({
      success: result.status !== "failed",
      finalItem: serializeReferenceItem(result.finalItem),
      candidates: serializeMetadataCandidates(result.candidates),
      localDraft: serializeReferenceItem(result.localDraft),
      status: result.status,
      warnings: result.warnings,
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: "英文开放元数据查询失败。请稍后重试，或手动编辑字段。",
      },
      { status: 502 },
    );
  }
}
