#!/usr/bin/env node
// ============================================================
// scripts/test-premium-tools-frontend.js — frontend smoke test
//
// Loads each premium tool page through jsdom, executes the inline
// scripts, and verifies critical top-level vars + functions are
// defined. Catches the class of bug where a JS error early in a
// <script> tag silently halts execution and leaves later vars
// undefined (e.g. the 2026-04-30 dash-email TypeError that left
// SC_LOADING_MESSAGES undefined and stuck Signal Chain at "Running…"
// on every click).
//
// Run before deploy:
//   node scripts/test-premium-tools-frontend.js
// Exits 0 on full pass, 1 on any failure (use as a CI gate).
// ============================================================

const fs = require("fs");
const path = require("path");

let JSDOM;
try {
  JSDOM = require("jsdom").JSDOM;
} catch (err) {
  console.error("❌ jsdom not installed. Run: npm install --save-dev jsdom");
  console.error("   then re-run this script.");
  process.exit(2);
}

// Each spec: file path + critical globals that MUST be defined after
// inline-script execution. If any global is missing, the page has a
// JS error early in script execution and the tool will be broken in
// the browser (the user sees "Running…" forever or no response).
const SPECS = [
  {
    path: "dist/premium/signal-chain.html",
    must_define: [
      "SC_LOADING_MESSAGES", "SC_CHIPS", "scLoadingTimer",
      "scStartLoading", "scStopLoading", "runChain", "renderResult",
    ],
    must_call_safely: [],
  },
  {
    path: "dist/premium/pursuit-score.html",
    must_define: ["startLoading", "stopLoading"],
    must_call_safely: [],
  },
  {
    path: "dist/premium/compliance-check.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/ask-mmt.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/calendar.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/dashboard.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/briefings.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/monthly-briefs.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/profile.html",
    must_define: [],
    must_call_safely: [],
  },
  {
    path: "dist/premium/settings.html",
    must_define: [],
    must_call_safely: [],
  },
];

function loadAndCheck(spec) {
  const fullPath = path.join(__dirname, "..", spec.path);
  if (!fs.existsSync(fullPath)) {
    return { spec, status: "skip", reason: "file_missing", path: fullPath };
  }
  const html = fs.readFileSync(fullPath, "utf8");

  const errors = [];
  let dom;
  try {
    dom = new JSDOM(html, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: "https://missionmeetstech.com" + spec.path.replace(/^dist/, ""),
      virtualConsole: new (require("jsdom").VirtualConsole)()
        .on("jsdomError", (err) => errors.push({ type: "jsdomError", msg: err.message })),
      beforeParse(window) {
        // Mary's localStorage state — premium auth set
        window.localStorage.setItem("mmt_email", "maryadawson@gmail.com");
        window.localStorage.setItem("mmt_premium", "true");
        // Capture uncaught errors
        window.__caught = [];
        window.addEventListener("error", (e) => {
          window.__caught.push({ type: "error", msg: e.message, at: e.filename + ":" + e.lineno });
        });
        window.addEventListener("unhandledrejection", (e) => {
          window.__caught.push({ type: "rejection", msg: String(e.reason && e.reason.message || e.reason) });
        });
        // Stub fetch so any network calls don't actually fire
        window.fetch = () => new Promise((resolve) => resolve(new window.Response('{"ok":true}', { status: 200 })));
      },
    });
  } catch (err) {
    return { spec, status: "fail", reason: "jsdom_load_error", error: err.message };
  }

  const win = dom.window;
  const undef = spec.must_define.filter((g) => typeof win[g] === "undefined");
  const caught = win.__caught || [];

  if (caught.length > 0 || undef.length > 0) {
    return {
      spec,
      status: "fail",
      caught,
      undefined_globals: undef,
    };
  }
  return { spec, status: "pass" };
}

function main() {
  const results = SPECS.map(loadAndCheck);
  const passes = results.filter((r) => r.status === "pass").length;
  const skips = results.filter((r) => r.status === "skip").length;
  const fails = results.filter((r) => r.status === "fail");

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Premium Tools Frontend Smoke Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  for (const r of results) {
    if (r.status === "pass") {
      console.log(`  ✓  ${r.spec.path}`);
    } else if (r.status === "skip") {
      console.log(`  ~  ${r.spec.path}  (${r.reason})`);
    } else {
      console.log(`  ✗  ${r.spec.path}`);
      if (r.error) console.log(`        ${r.error}`);
      if (r.undefined_globals && r.undefined_globals.length) {
        console.log(`        Undefined globals: ${r.undefined_globals.join(", ")}`);
      }
      if (r.caught && r.caught.length) {
        for (const c of r.caught.slice(0, 5)) {
          console.log(`        [${c.type}] ${c.msg}${c.at ? "  @" + c.at : ""}`);
        }
      }
    }
  }

  console.log("");
  console.log(`  ${passes} passed · ${skips} skipped · ${fails.length} failed (out of ${results.length})`);
  console.log("");

  if (fails.length > 0) {
    console.log("FAIL — see errors above.");
    process.exit(1);
  }
  console.log("PASS — all premium tool pages execute cleanly with no JS errors.");
  process.exit(0);
}

main();
