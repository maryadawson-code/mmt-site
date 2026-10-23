#!/usr/bin/env node
// validate-node-version.js
//
// Build-time gate: the Node.js running this build is at or above the security
// floor in netlify/functions/lib/node-floor.js. Runs first in the netlify.toml
// build command and in `npm run build` (the Deploy Gate), so a build image or
// CI runner that resolved an unpatched Node cannot ship.
//
// Exit 1 with the version, the floor and the fix. Exit 0 says nothing but one
// line, so the build log shows which Node produced the deploy.
//
//   NODE_VERSION_UNDER_TEST=22.22.0  checks that string instead (tests only)

const path = require("path");
const { checkNodeVersion } = require(path.join(__dirname, "..", "netlify", "functions", "lib", "node-floor.js"));

const version = process.env.NODE_VERSION_UNDER_TEST || process.versions.node;
const verdict = checkNodeVersion(version);

if (verdict.status === "ok") {
  console.log(`validate-node-version: Node ${verdict.version} meets the floor ${verdict.floor}`);
  process.exit(0);
}

console.error(
  `validate-node-version: Node ${verdict.version || "<unreadable>"} does not meet the security floor ${verdict.floor} (${verdict.reason}).\n` +
    `  Fix: raise the Node the build runs on. .nvmrc, netlify.toml NODE_VERSION and package.json engines all name ${verdict.floor};\n` +
    `  locally: nvm install ${verdict.floor}. If a newer Node security release moved the floor, edit netlify/functions/lib/node-floor.js first.`
);
process.exit(1);
