# 部署说明

## 推荐部署方式

建议将 `reference-format-tool` 部署到香港服务器或对 Crossref、DataCite、OpenAlex 访问稳定的 Node.js 环境。

推荐架构：

1. 同一套服务同时承载 Next.js 前端页面和 `/api/metadata/*` 后端接口。
2. 用户浏览器只访问本站接口，例如 `/api/metadata/resolve-doi`、`/api/metadata/search-title`、`/api/metadata/resolve-paper`。
3. 英文元数据查询由服务器端代理请求 Crossref、DataCite、OpenAlex。
4. 用户本机是否开启 VPN 不应影响英文 DOI 元数据查询，因为浏览器不会直接访问这些国外元数据 API。
5. 中文文献不做后台数据库抓取，继续使用本地解析、搜索跳转、单条题录粘贴和批量题录导入。

## 为什么推荐香港服务器

香港服务器通常同时具备：

- 对海外开放元数据源访问较稳定；
- 对国内用户访问延迟相对可控；
- 不要求用户浏览器直接访问 Crossref、DataCite、OpenAlex。

因此英文文献识别请求会变成：

```text
用户浏览器 -> 本站 /api/metadata/resolve-doi -> 服务器端请求 Crossref / DataCite / OpenAlex
```

而不是：

```text
用户浏览器 -> Crossref / DataCite / OpenAlex
```

这可以降低用户本机网络、浏览器环境和 VPN 状态对英文文献识别的影响。

## 中文文献边界

中文文献功能保持以下方式：

- 中文 DOI 增强识别；
- 中文论文首页本地草稿解析；
- 知网、万方、维普、PubScholar 搜索辅助链接；
- 用户粘贴单条中文引用格式进行字段补全；
- 用户批量导入中文题录并与上传文件匹配。

系统不会在后台爬取知网、万方、维普、Google Scholar、百度学术、Elsevier 等网页。

## 本地检查

部署前建议运行：

```bash
npm run build
npm start
```

然后检查：

```text
http://localhost:3000
http://localhost:3000/api/metadata/resolve-doi?doi=10.1016/j.enbuild.2023.113245
```

