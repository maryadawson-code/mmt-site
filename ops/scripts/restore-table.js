#!/usr/bin/env node
// restore-table.js — Restore a table from Supabase Storage backup
// Usage: node ops/scripts/restore-table.js <table> <date>
// Example: node ops/scripts/restore-table.js customer_profiles 2026-03-19

const { createClient } = require("@supabase/supabase-js");

const BUCKET = "mmt-backups";
const BATCH_SIZE = 100;

async function main() {
  const [, , table, date] = process.argv;
  if (!table || !date) {
    console.error("Usage: node ops/scripts/restore-table.js <table> <date>");
    console.error("Example: node ops/scripts/restore-table.js customer_profiles 2026-03-19");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    process.exit(1);
  }

  const sb = createClient(url, key);
  const path = `${date}/${table}.json`;

  console.log(`Downloading ${path} from ${BUCKET}...`);
  const { data: blob, error: downloadErr } = await sb.storage.from(BUCKET).download(path);
  if (downloadErr) {
    console.error("Download failed:", downloadErr.message);
    process.exit(1);
  }

  const text = await blob.text();
  const rows = JSON.parse(text);
  console.log(`Found ${rows.length} rows to restore`);

  if (rows.length === 0) {
    console.log("Nothing to restore");
    return;
  }

  let ok = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: false });
    if (error) {
      console.error(`Batch ${i}-${i + batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      ok += batch.length;
    }
  }

  console.log(`Restore complete: ${ok} restored, ${errors} errors`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
