#!/usr/bin/env node
/**
 * seed-subscriber-context.js — Load seed subscriber_context records.
 *
 * Reads every *.json in data/subscriber-context/ and upserts it into
 * the subscriber_context table. Idempotent — run it as many times as
 * you want. Each run bumps context_version automatically via the DB
 * trigger in migrations/008_subscriber_context.sql.
 *
 * Usage:
 *   node scripts/seed-subscriber-context.js
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *
 * Before first run on a fresh environment, apply the migration:
 *   psql $SUPABASE_CONN -f migrations/008_subscriber_context.sql
 */

const fs = require("fs");
const path = require("path");

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("SUPABASE_URL + SUPABASE_SERVICE_KEY required");
    process.exit(1);
  }

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const seedDir = path.join(__dirname, "..", "data", "subscriber-context");
  if (!fs.existsSync(seedDir)) {
    console.error(`seed directory not found: ${seedDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No seed JSON files found — nothing to do.");
    return;
  }

  let ok = 0, fail = 0;
  for (const file of files) {
    const fullPath = path.join(seedDir, file);
    try {
      const body = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      if (!body.email || !body.entity_name) {
        console.warn(`[skip] ${file}: missing email or entity_name`);
        fail++;
        continue;
      }
      const { data, error } = await supabase
        .from("subscriber_context")
        .upsert({ ...body, email: body.email.toLowerCase() }, { onConflict: "email" })
        .select("email, entity_name, context_version, last_updated")
        .single();
      if (error) {
        console.error(`[fail] ${file}: ${error.message}`);
        fail++;
      } else {
        console.log(`[ok]   ${data.email} → ${data.entity_name} (v${data.context_version})`);
        ok++;
      }
    } catch (err) {
      console.error(`[fail] ${file}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone. Upserted ${ok}, failed ${fail}.`);
  if (fail > 0) process.exit(2);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}

module.exports = { main };
