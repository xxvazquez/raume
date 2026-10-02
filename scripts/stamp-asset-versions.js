// Deploy-time cache-busting, one version per file.
//
// Run by .github/workflows/pages.yml before the commit SHA is stamped. Each
// `?v=__CACHEBUST__` asset URL in index.html becomes `?v=<hash of that file>`,
// and sw.js gets the same path -> hash map for its precache list. A deploy
// then changes the URL of only the files whose bytes changed, so a returning
// visitor downloads just those; everything else is still in their cache under
// the same URL. A checkout keeps the literal token (nothing is stamped).
//
//   node scripts/stamp-asset-versions.js        stamps index.html + sw.js in place
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MARKER = "/*__ASSET_VERSIONS__*/{}";

function hashOf(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

// Pure: (index.html source, sw.js source, path -> bytes) -> stamped sources.
function stamp(indexHtml, swSource, readFile) {
  const versions = {};
  const versionOf = (p) => (versions[p] = versions[p] || hashOf(readFile(p)));
  const html = indexHtml.replace(/(["'])([^"'\s]+)\?v=__CACHEBUST__/g, (m, q, p) => q + p + "?v=" + versionOf(p));
  // Every precached versioned path gets one too, even one index.html doesn't
  // reference, so the worker never precaches a URL the page won't ask for.
  const list = swSource.match(/const VERSIONED = \[([\s\S]*?)\];/);
  if (!list) throw new Error("sw.js: VERSIONED list not found");
  for (const m of list[1].matchAll(/'([^']+)'/g)) versionOf(m[1]);
  if (!swSource.includes(MARKER)) throw new Error("sw.js: " + MARKER + " marker not found");
  return { html, sw: swSource.replace(MARKER, JSON.stringify(versions)), versions };
}

module.exports = { stamp, hashOf };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const read = (p) => fs.readFileSync(path.join(root, p));
  const out = stamp(read("index.html").toString(), read("sw.js").toString(), read);
  fs.writeFileSync(path.join(root, "index.html"), out.html);
  fs.writeFileSync(path.join(root, "sw.js"), out.sw);
  console.log("Stamped " + Object.keys(out.versions).length + " asset versions.");
}
