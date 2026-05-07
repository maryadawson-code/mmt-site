// mmt-mcp-federal — MCP server for federal data tools.
// Streamable HTTP, deployed to Fly.io.
//
// DM-101 / DM-102 / DM-103 / DM-104 (Sprint A1, 2026-05-07).

import { buildHttpApp } from "./transport.js";
import { ToolDefinition, ToolHandler } from "./types.js";
import {
  sam_search_opportunities,
  handleSamSearchOpportunities,
  sam_search_awards,
  handleSamSearchAwards,
} from "./tools/sam-gov.js";
import {
  usaspending_naics_summary,
  handleUsaspendingNaicsSummary,
  usaspending_recipient_awards,
  handleUsaspendingRecipientAwards,
} from "./tools/usaspending.js";
import {
  fedreg_search,
  handleFedregSearch,
  fedreg_document,
  handleFedregDocument,
} from "./tools/federal-register.js";
import { congress_search_bills, handleCongressSearchBills } from "./tools/congress.js";
import {
  grants_search_opportunities,
  handleGrantsSearchOpportunities,
} from "./tools/grants.js";
import { gao_recent_decisions, handleGaoRecentDecisions } from "./tools/gao.js";

const SERVER_NAME = "mmt-mcp-federal";
const VERSION = "1.0.0";
const DESCRIPTION =
  "Mission Meets Tech federal data MCP — SAM.gov opportunities + USASpending awards + Federal Register + Congress.gov + Grants.gov + GAO bid protests.";

function buildToolMap() {
  const tools = new Map<string, { def: ToolDefinition; handler: ToolHandler }>();
  const register = (def: ToolDefinition, handler: ToolHandler) => {
    tools.set(def.name, { def, handler });
  };
  register(sam_search_opportunities, handleSamSearchOpportunities);
  register(sam_search_awards, handleSamSearchAwards);
  register(usaspending_naics_summary, handleUsaspendingNaicsSummary);
  register(usaspending_recipient_awards, handleUsaspendingRecipientAwards);
  register(fedreg_search, handleFedregSearch);
  register(fedreg_document, handleFedregDocument);
  register(congress_search_bills, handleCongressSearchBills);
  register(grants_search_opportunities, handleGrantsSearchOpportunities);
  register(gao_recent_decisions, handleGaoRecentDecisions);
  return tools;
}

const tools = buildToolMap();

if (process.argv.includes("--check")) {
  const names = Array.from(tools.keys());
  console.log(`${SERVER_NAME} v${VERSION}`);
  console.log(`tools: ${names.length}`);
  for (const n of names) console.log(`  - ${n}`);
  process.exit(0);
}

const app = buildHttpApp({ serverName: SERVER_NAME, version: VERSION, description: DESCRIPTION, tools });
const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`${SERVER_NAME} listening on :${port} — ${tools.size} tools`);
});
