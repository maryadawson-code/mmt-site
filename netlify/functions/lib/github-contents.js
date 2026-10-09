// ============================================================
// lib/github-contents.js — read and write one repo file on main through
// the GitHub Contents API, the way pursuit-calendar-seed-refresh has
// committed the weekly seed since MMT-PC-01.
//
// Why a lib (2026-10-09): the Contract Tracker re-verify needs the same
// three calls (GET with sha, PUT with sha, build hook). A scheduled
// function that writes a hand-maintained file to main is how a dataset
// stops waiting for a person; the write is small, validated by the
// build the commit triggers, and visible in git history.
//
// Env: GITHUB_TOKEN (fine-grained PAT, contents:write on the repo),
// GITHUB_REPO ("owner/name", default maryadawson-code/mmt-site),
// NETLIFY_BUILD_HOOK_URL (optional; the git push already deploys).
// ============================================================

const DEFAULT_REPO = "maryadawson-code/mmt-site";

function repoName(env = process.env) {
  return env.GITHUB_REPO || DEFAULT_REPO;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** @returns {Promise<{sha: string|null, content: string|null}>} */
async function githubGetFile(repo, path, token, { ref = "main", fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
  const res = await doFetch(url, { headers: headers(token) });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) throw new Error(`github GET ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content = Buffer.from(json.content || "", "base64").toString("utf8");
  return { sha: json.sha, content };
}

/** PUT one file. `sha` is the blob sha from githubGetFile (required to update). */
async function githubPutFile(repo, path, token, { content, sha, message, branch, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: branch || "main",
  };
  if (sha) body.sha = sha;
  const res = await doFetch(url, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`github PUT ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function triggerNetlifyBuild({ env = process.env, fetchImpl } = {}) {
  const hook = env.NETLIFY_BUILD_HOOK_URL;
  if (!hook) return { skipped: "no_build_hook" };
  const doFetch = fetchImpl || globalThis.fetch;
  const res = await doFetch(hook, { method: "POST" });
  if (!res.ok) throw new Error(`netlify build hook: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { triggered: true, status: res.status };
}

module.exports = { DEFAULT_REPO, repoName, githubGetFile, githubPutFile, triggerNetlifyBuild };
