// ============================================================
// contract-intel.js — Netlify Function (GET Endpoint)
//
// Returns contract intelligence from Supabase contract_intel table.
// GET ?contract=MHS%20GENESIS%20(Electronic%20Health%20Record)
// → { intel, black_hat, sources, last_updated }
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const contractName = event.queryStringParameters?.contract;
  if (!contractName || contractName.length > 200) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Missing or invalid contract parameter" }),
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  // Map new contract names to old Supabase names (for data populated before name updates)
  const NAME_ALIASES = {
    "HCDS - Health Care Delivery Solutions (MHS GENESIS Follow-On)": "MHS GENESIS (Electronic Health Record)",
    "MHS GENESIS (DHMSM Bridge)": "MHS GENESIS (Electronic Health Record)",
    "VA EHRM (Electronic Health Record Modernization)": "VA EHR Modernization (EHRM)",
    "Community Care Network Next Gen (CCN NG)": "Community Care Network (CCN) Next Gen",
    "T4NG2 (VA IT Services)": "T4NG / T4NG2 (VA IT Services)",
    "TRICARE Managed Care Support - T-5 (MCS)": "TRICARE Managed Care Support — T-5 (MCS)",
    "DHA Telehealth Programs": "Defense Health Agency Telehealth Programs",
    "VA Enterprise Imaging (NEIS + Multi-VISN PACS + Bi-Directional)": "Military Health System Enterprise Imaging",
    "JOMIS / OMEIS (Operational Medicine Systems)": "JOMIS (MHS GENESIS Theater)",
    "PEO DHMS CSO (Competitive Solutions Opening)": "PEO DHMS CSO (Competitive Solutions Opening)",
    "Federal Electronic Health Record Modernization (FEHRM)": "Federal Electronic Health Record Modernization (FEHRM)",
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Try exact match first
    let { data: record, error: fetchErr } = await supabase
      .from("contract_intel")
      .select("intel, black_hat, sources, last_updated")
      .eq("contract_name", contractName)
      .single();

    // If no exact match, try alias (old name)
    if ((fetchErr || !record) && NAME_ALIASES[contractName]) {
      const aliasResult = await supabase
        .from("contract_intel")
        .select("intel, black_hat, sources, last_updated")
        .eq("contract_name", NAME_ALIASES[contractName])
        .single();
      if (!aliasResult.error && aliasResult.data) {
        record = aliasResult.data;
        fetchErr = null;
      }
    }

    // If still no match, try partial match
    if (fetchErr || !record) {
      const shortName = contractName.split("(")[0].trim().split(" - ")[0].trim();
      if (shortName.length >= 4) {
        const { data: fuzzyRecords } = await supabase
          .from("contract_intel")
          .select("intel, black_hat, sources, last_updated")
          .ilike("contract_name", `%${shortName}%`)
          .limit(1);
        if (fuzzyRecords && fuzzyRecords.length > 0) {
          record = fuzzyRecords[0];
          fetchErr = null;
        }
      }
    }

    if (fetchErr || !record) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "No intel available yet for this contract" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify({
        intel: record.intel,
        black_hat: record.black_hat,
        sources: record.sources,
        last_updated: record.last_updated,
      }),
    };
  } catch (err) {
    console.error("Contract intel error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
