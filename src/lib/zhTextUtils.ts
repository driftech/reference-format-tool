const fullWidthStart = 0xff01;
const fullWidthEnd = 0xff5e;
const halfWidthOffset = 0xfee0;

const noiseLinePattern =
  /收稿日期|修回日期|录用日期|基金项目|资助项目|作者简介|通讯作者|通信作者|电子邮箱|邮箱|E-mail|Email|中图分类号|文献标识码|文章编号|参考文献|References|Bibliography|DOI\s*[:：]?$/i;

const affiliationPattern =
  /大学|学院|研究院|研究所|公司|中心|实验室|重点实验室|Department|University|Institute|College|School|Laboratory/i;

export function normalizeChineseAcademicText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - halfWidthOffset),
    )
    .replace(/\u3000/g, " ")
    .replace(/[﹣－–—~～]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[；]/g, ";")
    .replace(/[：]/g, ":")
    .replace(/[／]/g, "/")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/([A-Za-z0-9])\s*\n\s*([A-Za-z0-9])/g, "$1$2")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeFullWidthAscii(text: string): string {
  return text.replace(/[\uff01-\uff5e]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= fullWidthStart && code <= fullWidthEnd) {
      return String.fromCharCode(code - halfWidthOffset);
    }
    return char;
  });
}

export function isLikelyChinesePaper(text: string): boolean {
  const normalized = normalizeChineseAcademicText(text).slice(0, 6000);
  const chineseCount = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const englishCount = normalized.match(/[A-Za-z]/g)?.length ?? 0;

  if (chineseCount < 12) {
    return false;
  }

  if (chineseCount >= 80) {
    return true;
  }

  return chineseCount / Math.max(1, chineseCount + englishCount) >= 0.28;
}

export function removeCommonZhNoiseLines(lines: string[]): string[] {
  return lines
    .map((line) => normalizeChineseAcademicText(line).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isCommonZhNoiseLine(line));
}

export function isCommonZhNoiseLine(line: string): boolean {
  if (!line) {
    return true;
  }

  if (line.length > 220) {
    return true;
  }

  if (noiseLinePattern.test(line)) {
    return true;
  }

  if (/^\d+$/.test(line) || /^第?\s*\d+\s*页$/.test(line)) {
    return true;
  }

  if (/\S+@\S+/.test(line)) {
    return true;
  }

  if (affiliationPattern.test(line) && line.length > 8) {
    return true;
  }

  return false;
}

export function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.\\/]+$/, "").trim();
}

export function normalizeZhComparable(text: string): string {
  return normalizeChineseAcademicText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
    .trim();
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = normalizeChineseAcademicText(value).trim();
    const key = normalizeZhComparable(cleaned);

    if (!cleaned || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}
