import { maxTotalUploadSizeBytes } from "@/lib/fileTypes";
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
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > maxTotalUploadSizeBytes) {
    return Response.json(
      {
        success: false,
        error: "\u8bf7\u6c42\u5185\u5bb9\u8fc7\u5927\uff0c\u8bf7\u51cf\u5c11\u4e0a\u4f20\u6587\u4ef6\u6570\u91cf\u6216\u7f29\u77ed\u5f85\u8bc6\u522b\u6587\u672c\u540e\u91cd\u8bd5\u3002",
      },
      { status: 413 },
    );
  }

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
