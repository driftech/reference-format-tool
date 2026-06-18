export type ChineseSearchProvider = "cnki" | "wanfang" | "cqvip" | "pubscholar";

export type ChineseSearchLink = {
  provider: ChineseSearchProvider;
  label: string;
  url: string;
};

export function buildChineseSearchLinks(input: {
  title?: string | null;
  authors?: string[];
  year?: string | null;
}): ChineseSearchLink[] {
  const title = input.title?.trim();

  if (!title) {
    return [];
  }

  const query = [title, input.authors?.[0], input.year]
    .filter(Boolean)
    .join(" ");
  const encodedTitle = encodeURIComponent(title);
  const encodedQuery = encodeURIComponent(query);

  return [
    {
      provider: "cnki",
      label: "去知网搜索",
      url: `https://kns.cnki.net/kns8s/defaultresult/index?kw=${encodedTitle}`,
    },
    {
      provider: "wanfang",
      label: "去万方搜索",
      url: `https://s.wanfangdata.com.cn/paper?q=${encodedQuery}`,
    },
    {
      provider: "cqvip",
      label: "去维普搜索",
      url: `https://www.cqvip.com/search?k=${encodedTitle}`,
    },
    {
      provider: "pubscholar",
      label: "去 PubScholar 搜索",
      url: `https://pubscholar.cn/search?q=${encodedQuery}`,
    },
  ];
}
