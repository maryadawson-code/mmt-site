/**
 * contract-schema.js — Target data model for federal health IT contracts.
 *
 * Documents the full BD (business development) schema that the intel
 * pipeline aims to populate over time. Not all fields are populated
 * today; this serves as the target state for data collection.
 *
 * @module contract-schema
 */

const CONTRACT_SCHEMA = {
  // Core identity
  name: { type: "string", required: true, description: "Contract name or program title" },
  slug: { type: "string", required: true, description: "URL-safe identifier" },
  agency: { type: "string", required: true, description: "Issuing federal agency" },
  vendor: { type: "string", required: false, description: "Current incumbent or awardee(s)" },
  value: { type: "string", required: false, description: "Contract value or ceiling" },
  status: { type: "enum", required: true, values: ["Active", "Upcoming", "Awarded", "Protested", "Bridge", "Cancelled", "Resuming"], description: "Current contract status" },
  naics: { type: "string", required: false, description: "Primary NAICS code" },

  // Small business
  sbEligible: { type: "boolean", required: false, description: "Small business eligible" },

  // Timeline
  periodOfPerformance: { type: "string", required: false, description: "Period of performance (start–end)" },
  optionYears: { type: "number", required: false, description: "Number of option years remaining" },

  // Competitive landscape
  incumbents: { type: "array", items: "string", required: false, description: "Current incumbent vendor(s)" },
  subNetwork: { type: "array", items: "string", required: false, description: "Known subcontractors" },
  protestHistory: { type: "array", items: "object", required: false, description: "GAO/COFC protest records" },

  // Political/budget
  congressionalInterest: { type: "string", required: false, description: "Congressional oversight or earmark notes" },
  budgetLineItem: { type: "string", required: false, description: "Budget line item / PPA" },

  // Personnel
  keyPersonnel: { type: "array", items: "object", required: false, description: "Key decision-makers (CO, PM, COR)" },

  // Analytics
  historicalWinRate: { type: "number", required: false, description: "Historical win rate for vehicle/agency (0-1)" },
  cparsSignals: { type: "string", required: false, description: "CPARS performance signals" },

  // Metadata
  lastVerified: { type: "string", format: "date", required: true, description: "ISO date of last verification" },
  sources: { type: "array", items: "string", required: true, description: "Source URLs" },
  confidence: { type: "object", required: false, description: "Confidence scoring metadata", properties: {
    level: { type: "enum", values: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] },
    score: { type: "number", description: "Effective confidence score (0-1)" },
    source_reliability: { type: "number", description: "Source domain reliability (0-1)" },
  }},
};

module.exports = { CONTRACT_SCHEMA };
