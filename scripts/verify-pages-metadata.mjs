import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const pageMetadata = loadTsModule("src/lib/pageMetadata.ts");
const metadataMapping = loadTsModule("src/lib/metadataResolvers/metadataMapping.ts", (id) => {
  if (id === "../pageMetadata") return pageMetadata;
  if (id === "../doiUtils") {
    return {
      cleanDoi(value) {
        return String(value ?? "")
          .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
          .replace(/^doi:\s*/i, "")
          .replace(/[.,;)\]\s]+$/g, "");
      },
    };
  }

  return {};
});

const crossrefCandidate = metadataMapping.mapCrossrefWorkToCandidate(
  {
    title: [
      "Towards urban LCA: examining densification alternatives for a residential neighbourhood",
    ],
    "container-title": ["Buildings and Cities"],
    author: [
      { given: "Malin", family: "Moisio" },
      { given: "Emmi", family: "Salmio" },
    ],
    "published-print": { "date-parts": [[2024]] },
    volume: "5",
    issue: "1",
    page: "581-600",
    DOI: "10.5334/bc.472",
    type: "journal-article",
  },
  "10.5334/bc.472",
);

assert(
  crossrefCandidate.item.pages === "581-600",
  "Crossref raw page was not mapped to ReferenceItem.pages",
);

const openAlexCandidate = metadataMapping.mapOpenAlexWorkToCandidate(
  {
    title:
      "Towards urban LCA: examining densification alternatives for a residential neighbourhood",
    publication_year: 2024,
    type: "article",
    doi: "https://doi.org/10.5334/bc.472",
    biblio: {
      volume: "5",
      issue: "1",
      first_page: "581",
      last_page: "600",
    },
  },
  "10.5334/bc.472",
);

assert(
  openAlexCandidate.item.pages === "581-600",
  "OpenAlex first_page/last_page was not mapped to ReferenceItem.pages",
);

const frontPageCitation =
  "Moisio, M., Salmio, E., Kaasalainen, T., Huuhka, S., R\\u00e4s\\u00e4nen, A., Lahdensivu, J., Lepp\\u00e4nen, M., & Kuula, P. (2024). Towards urban LCA: examining densification alternatives for a residential neighbourhood. Buildings and Cities, 5(1), pp. 581-600. DOI: https://doi.org/10.5334/bc.472";
const pagesFromText = pageMetadata.extractPagesFromText(frontPageCitation);

assert(
  pagesFromText.pages === "581-600",
  "PDF front-page citation page range was not extracted",
);

const articleNumber = pageMetadata.extractPagesFromMetadata({
  biblio: {
    volume: "181",
    first_page: "106582",
  },
});

assert(
  articleNumber.pages === "106582",
  "Article number page fallback was not preserved",
);

console.log("page metadata verification passed");

function loadTsModule(file, customRequire = () => ({})) {
  const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const sandbox = { exports: {}, require: customRequire, console };
  vm.runInNewContext(compiled, sandbox, { filename: file });
  return sandbox.exports;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
