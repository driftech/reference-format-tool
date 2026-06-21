import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "参考文献生成器 - 论文文件自动识别与格式转换",
  description:
    "在线参考文献生成器，支持上传论文文件自动识别题名、作者、期刊、年份和 DOI，生成 GB/T 7714、英文数字编号制、APA 7th 等参考文献格式，适合论文写作、投稿和文献整理。",
  keywords: [
    "参考文献生成器",
    "论文参考文献格式",
    "GB/T 7714",
    "英文参考文献",
    "APA 7th",
    "论文格式工具",
    "文献格式转换",
    "DOI识别",
  ],
  alternates: {
    canonical: "https://ckwxsc.xyz/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
