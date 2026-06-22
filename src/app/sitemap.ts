import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: "https://ckwxsc.xyz/",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://ckwxsc.xyz/guide",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://ckwxsc.xyz/privacy",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://ckwxsc.xyz/about",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
