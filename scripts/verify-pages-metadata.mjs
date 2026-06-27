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


const crossrefWithNestedReferencePage = metadataMapping.mapCrossrefWorkToCandidate(
  {
    title: [
      "Towards urban LCA: examining densification alternatives for a residential neighbourhood",
    ],
    "container-title": ["Buildings and Cities"],
    author: [{ given: "Malin", family: "Moisio" }],
    "published-print": { "date-parts": [[2024]] },
    volume: "5",
    issue: "1",
    DOI: "10.5334/bc.472",
    type: "journal-article",
    "reference-count": 152,
    "is-referenced-by-count": 152,
    reference: [
      {
        "first-page": "152",
        DOI: "10.1080/13556207.2018.1493664",
        "article-title": "Life cycle assessment and historic buildings",
      },
    ],
  },
  "10.5334/bc.472",
);

assert(
  crossrefWithNestedReferencePage.item.pages === null,
  "Nested Crossref reference first-page/count value was incorrectly mapped to pages",
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


const openAlexWithCounts = metadataMapping.mapOpenAlexWorkToCandidate(
  {
    title:
      "Towards urban LCA: examining densification alternatives for a residential neighbourhood",
    publication_year: 2024,
    type: "article",
    doi: "https://doi.org/10.5334/bc.472",
    cited_by_count: 152,
    referenced_works_count: 152,
    biblio: {
      volume: "5",
      issue: "1",
    },
  },
  "10.5334/bc.472",
);

assert(
  openAlexWithCounts.item.pages === null,
  "OpenAlex count fields were incorrectly mapped to pages",
);



const scientificDataCandidate = metadataMapping.mapCrossrefWorkToCandidate(
  {
    title: [
      "Building material stocks and embodied carbon dataset for two urban agglomerations in China from 2000 to 2020",
    ],
    "container-title": ["Scientific Data"],
    author: [
      { given: "Hanwei", family: "Liang" },
      { given: "Baizhe", family: "Zhang" },
      { given: "Xuepeng", family: "Qian" },
      { given: "Ying", family: "Chen" },
    ],
    "published-online": { "date-parts": [[2025]] },
    volume: "12",
    issue: "1",
    "article-number": "930",
    DOI: "10.1038/s41597-025-05258-4",
    type: "journal-article",
  },
  "10.1038/s41597-025-05258-4",
);

assert(scientificDataCandidate.item.pages === null, "Scientific Data article number leaked into pages");
assert(scientificDataCandidate.item.articleNumber === "930", "Scientific Data article number was not preserved");
assert(scientificDataCandidate.item.issue === null, "Scientific Data article-number record should not keep issue=1");

const buildingEnvironmentCandidate = metadataMapping.mapCrossrefWorkToCandidate(
  {
    title: [
      "LCA and scenario analysis of a Norwegian net-zero GHG emission neighbourhood: The importance of mobility and surplus energy from PV technologies",
    ],
    "container-title": ["Building and Environment"],
    author: [
      { given: "C.", family: "Lausselet" },
      { given: "K.M.", family: "Lund" },
      { given: "H.", family: "Bratteb\u00f8" },
    ],
    "published-print": { "date-parts": [[2021]] },
    volume: "189",
    page: "107528",
    "article-number": "107528",
    DOI: "10.1016/j.buildenv.2020.107528",
    type: "journal-article",
  },
  "10.1016/j.buildenv.2020.107528",
);

assert(buildingEnvironmentCandidate.item.pages === null, "Building and Environment article number leaked into pages");
assert(buildingEnvironmentCandidate.item.articleNumber === "107528", "Building and Environment article number was not preserved");
assert(buildingEnvironmentCandidate.item.issue === null, "Building and Environment issue should stay empty");

const frontPageCitation =
  "Moisio, M., Salmio, E., Kaasalainen, T., Huuhka, S., R\\u00e4s\\u00e4nen, A., Lahdensivu, J., Lepp\\u00e4nen, M., & Kuula, P. (2024). Towards urban LCA: examining densification alternatives for a residential neighbourhood. Buildings and Cities, 5(1), pp. 581-600. DOI: https://doi.org/10.5334/bc.472";
const pagesFromText = pageMetadata.extractPagesFromText(frontPageCitation);

assert(
  pagesFromText.pages === "581-600",
  "PDF front-page citation page range was not extracted",
);

const isolatedTextNumber = pageMetadata.extractPagesFromText("152");

assert(
  isolatedTextNumber.pages === null && isolatedTextNumber.articleNumber === null,
  "Isolated text number was incorrectly extracted as pages",
);

const articleNumber = pageMetadata.extractPagesFromMetadata({
  biblio: {
    volume: "181",
    first_page: "106582",
  },
});

assert(
  articleNumber.pages === null && articleNumber.articleNumber === "106582",
  "Article number fallback was not preserved separately from pages",
);


const formatReferencesModule = loadTsModule("src/lib/formatReferences.ts");
const fixedSamples = [scientificDataCandidate.item, buildingEnvironmentCandidate.item, crossrefCandidate.item];
const fixedSampleOutput = formatReferencesModule.formatReferences(fixedSamples, "gbt-7714", { startIndex: 1 });
assert(fixedSampleOutput.includes("Scientific Data, 2025, 12: 930"), "Scientific Data GB/T output is wrong");
assert(!fixedSampleOutput.includes("Scientific Data, 2025, 12(1): 32-34"), "Scientific Data false issue/pages output leaked");
assert(fixedSampleOutput.includes("Building and Environment, 2021, 189: 107528"), "Building and Environment GB/T output is wrong");
assert(!fixedSampleOutput.includes("pp. 107528"), "Article number was formatted as pp.");
assert(fixedSampleOutput.includes("Buildings and Cities, 2024, 5(1): 581-600"), "Buildings and Cities GB/T output is wrong");
assert(!fixedSampleOutput.includes("152"), "Invalid 152 leaked into fixed sample output");

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
