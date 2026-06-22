import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 - 参考文献生成器",
  description:
    "说明参考文献生成器对上传文件、元数据查询和生成结果的处理方式与注意事项。",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <a className="inline-flex text-sm font-semibold text-slate-600 transition hover:text-slate-950" href="/">
          ← 返回首页
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal text-slate-950">
          隐私政策 - 参考文献生成器
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          本页面说明参考文献生成器对上传文件、元数据查询和生成结果的处理方式。语言尽量保持清楚和克制，便于用户判断是否适合上传自己的材料。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">文件处理</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
          <li>本工具用于辅助识别论文文件中的参考文献信息。</li>
          <li>上传文件仅用于本次识别处理，当前主要在浏览器端读取和解析，不会长期保存上传文件。</li>
          <li>如果后续系统使用服务器临时处理文件，临时文件仅用于解析，并会尽量在处理完成后自动清理。</li>
        </ul>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">不建议上传的材料</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          请勿上传涉密文件、未发表论文、商业机密、个人敏感信息或其他不适合公开处理的材料。对于重要论文和投稿材料，建议先确认文件内容是否适合使用在线工具处理。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">公开元数据查询</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          本工具可能会基于 DOI、题名等公开信息查询 Crossref、DataCite、OpenAlex 等公开元数据来源，以补全文献题名、作者、期刊、年份、卷期页码等字段。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">结果准确性</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          生成结果仅供用户参考。用户应自行核对最终参考文献，特别是作者顺序、题名大小写、期刊名、年份、卷期、页码和 DOI。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">政策更新</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          如后续接入统计工具、账号系统或付费系统，应同步更新隐私政策，说明新增的数据处理方式。
        </p>
      </article>
    </main>
  );
}
