import {
  resolvePaperMetadata,
  type ResolvePaperMetadataResult,
} from "@/lib/metadataResolvers/resolvePaperMetadata";

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
      ...result,
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: "论文元数据识别失败，已建议保留本地草稿并人工核对。",
      },
      { status: 502 },
    );
  }
}

