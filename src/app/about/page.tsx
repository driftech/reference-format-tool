import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于本站 - 参考文献生成器",
  description:
    "参考文献生成器是一个面向论文写作者的文献格式整理工具，支持论文文件识别与多种参考文献格式输出。",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <a className="inline-flex text-sm font-semibold text-slate-600 transition hover:text-slate-950" href="/">
          ← 返回首页
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal text-slate-950">
          关于本站 - 参考文献生成器
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          本站是一个面向论文写作者的参考文献格式整理工具，目标是减少论文写作中整理参考文献格式的重复劳动。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">本站能提供什么</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
          <li>支持从论文文件中提取题名、作者、期刊、年份、DOI 等元数据。</li>
          <li>支持 GB/T 7714、英文数字编号制、APA 7th 等输出格式。</li>
          <li>支持用户对识别结果进行编辑、核对、排序和导出。</li>
        </ul>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">持续完善中</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          参考文献格式和论文元数据来源本身都很复杂，本站仍处于持续完善阶段。自动生成结果需要人工核对，尤其是在正式投稿、毕业论文提交或期刊排版前。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">反馈渠道</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          后续将开放反馈渠道，用于收集识别错误、格式建议和使用问题。
        </p>
      </article>
    </main>
  );
}
