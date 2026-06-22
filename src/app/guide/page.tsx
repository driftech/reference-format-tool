import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用说明 - 参考文献生成器",
  description:
    "了解如何上传论文文件并生成 GB/T 7714、英文数字编号制、APA 7th 等参考文献格式。",
};

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <a className="inline-flex text-sm font-semibold text-slate-600 transition hover:text-slate-950" href="/">
          ← 返回首页
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal text-slate-950">
          使用说明 - 参考文献生成器
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          本工具用于辅助论文写作者整理参考文献格式。你可以上传论文文件，检查系统识别出的题名、作者、期刊、年份、DOI 等信息，再选择需要的参考文献格式并复制或导出结果。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">1. 这个工具能做什么</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          它会尝试从论文文件本身识别文献信息，并为每个上传文件生成一条参考文献记录。它不会把论文文末的 References 章节拆成多条参考文献。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">2. 支持哪些文件格式</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
          <li>支持 PDF、DOCX、DOC、TXT、MD、TEX、LATEX、RTF、EPUB、CAJ 等当前白名单内的论文或文献文件。</li>
          <li>旧版 DOC、CAJ、EPUB 等格式的自动解析能力有限，必要时建议先转换为 PDF、DOCX 或 TXT。</li>
          <li>暂不支持可执行文件、压缩包、网页脚本和其他与文献整理无关的文件类型。</li>
        </ul>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">3. 如何上传论文文件</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          在首页的上传区域选择或拖入论文文件。单个文件限制为 10MB，一次最多上传 10 个文件。文件加入队列后，点击“提取并识别全部”即可开始处理。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">4. 如何检查识别结果</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          系统会显示识别状态、置信度、作者、题名、来源、年份、卷期页码和 DOI 等字段。置信度较低或字段不完整的记录需要重点检查，你也可以直接编辑字段。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">5. 如何选择参考文献格式</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          在输出设置中选择 GB/T 7714、英文数字编号制、APA 7th 或其他已支持格式。编号制格式支持自定义起始编号，APA 7th 通常不使用顺序编号。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">6. 为什么需要人工核对</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          不同 PDF 的排版、元数据和 DOI 质量差异很大，开放数据库也可能缺少卷、期、页码等字段。本工具是辅助工具，不保证所有元数据完全准确，正式投稿前应按目标期刊或学校要求核对。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">7. 中文文献和英文文献的区别</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          英文文献通常可以通过 DOI 查询 Crossref、DataCite、OpenAlex 等公开元数据来源。中文文献由于数据库开放程度不同，可能需要用户通过本地草稿解析、搜索辅助链接或题录粘贴来人工补全。
        </p>

        <h2 className="mt-7 text-lg font-semibold text-slate-900">8. 常见问题</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
          <li>扫描版 PDF 可能无法提取文本，需要手动补充文献信息。</li>
          <li>识别出的作者顺序、期刊名和页码应在投稿前核对原文。</li>
          <li>如果没有 DOI，系统会尝试题名检索，但结果更需要人工确认。</li>
        </ul>
      </article>
    </main>
  );
}
