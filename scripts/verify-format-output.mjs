import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs
  .readFileSync("src/lib/formatReferences.ts", "utf8")
  .replace(/^import type .*\n/m, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const sandbox = { exports: {}, console, require };
vm.runInNewContext(compiled, sandbox, { filename: "formatReferences.ts" });

const sample = {
  id: "format-sample",
  rawText: "",
  type: "journal",
  authors: [
    "Malin Moisio",
    "Emmi Salmio",
    "Tapio Kaasalainen",
    "Satu Huuhka",
    "Aapo R\u00e4s\u00e4nen",
    "Jukka Lahdensivu",
    "Minna Lepp\u00e4nen",
    "Pirjo Kuula",
  ],
  year: "2024",
  title: "Towards urban LCA: examining densification alternatives for a residential neighbourhood",
  sourceTitle: "Buildings &amp; Cities",
  volume: "5",
  issue: "1",
  pages: "581-600",
  articleNumber: null,
  publisher: null,
  place: null,
  doi: "https://doi.org/10.5334/bc.472",
  url: null,
  accessDate: null,
  language: "en",
  warnings: [],
};

const articleNumberSample = {
  ...sample,
  id: "article-number-sample",
  sourceTitle: "Automation in Construction",
  volume: "181",
  issue: null,
  pages: null,
  articleNumber: "106582",
  doi: "10.1016/j.autcon.2025.106582",
};

const missingFieldsSample = {
  ...sample,
  id: "missing-fields-sample",
  volume: null,
  issue: null,
  pages: null,
  articleNumber: null,
  doi: null,
};

const formats = [
  "gbt-7714",
  "english-numbered",
  "apa-7",
  "ieee",
  "mla-9",
  "chicago-author-date",
  "harvard",
];

for (const format of formats) {
  const output = sandbox.exports.formatReferences([sample], format, { startIndex: 1 });
  assert(!/undefined|null|NaN|&amp;/.test(output), `${format} contains dirty output`);
  assert(output.includes("581"), `${format} did not output page range`);
  assert(
    output.includes("10.5334/bc.472"),
    `${format} did not output normalized DOI`,
  );
}

const allFormatOutput = formats
  .map((format) => sandbox.exports.formatReferences([sample], format, { startIndex: 1 }))
  .join("\n");
assert(allFormatOutput.includes("R\u00e4s\u00e4nen"), "special characters were not preserved");

for (const format of formats) {
  const output = sandbox.exports.formatReferences(
    [articleNumberSample, missingFieldsSample],
    format,
    { startIndex: 24 },
  );
  assert(!/undefined|null|NaN|\(\)|https:\/\/doi\.org\/https:\/\/doi\.org/.test(output), `${format} failed fallback cleanup`);
  assert(!/pp\. 106582/.test(output), `${format} treated article number as page range`);
}

console.log("format output verification passed");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
