// Cloudflare Worker "powerstation-data-cron": starts the GitHub Actions workflow
// "Hourly data update" (.github/workflows/data-hourly.yml) once an hour.
// Why: GitHub did not fire the workflow's own schedule, but manual starts work.
// The data code stays in GitHub Actions; this Worker only presses "Run workflow".
// It skips the start when any run of the workflow began in the last 50 minutes,
// so it does not double up if GitHub's own schedule starts to work.
// Secret GH_DISPATCH_TOKEN: a fine-grained GitHub token for this repo only,
// permission "Actions: Read and write". Set in the Cloudflare dashboard, never in the repo.

/* global console, fetch */

const REPO = "dsecareanu/powerstation.ai";
const WORKFLOW = "data-hourly.yml";
const SKIP_IF_RUN_WITHIN_MINUTES = 50;

export default {
  async scheduled(_controller, env) {
    if (!env.GH_DISPATCH_TOKEN) {
      console.log("GH_DISPATCH_TOKEN is not set: no run started");
      return;
    }
    const headers = {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "powerstation-data-cron",
    };
    const base = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

    const since = new Date(Date.now() - SKIP_IF_RUN_WITHIN_MINUTES * 60_000).toISOString();
    const list = await fetch(
      `${base}/runs?per_page=1&created=${encodeURIComponent(`>=${since}`)}`,
      {
        headers,
      },
    );
    if (!list.ok) throw new Error(`List runs failed: HTTP ${list.status}`);
    const { total_count: recent } = await list.json();
    if (recent > 0) {
      console.log(`Skipped: a run started after ${since}`);
      return;
    }

    const res = await fetch(`${base}/dispatches`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: "main" }),
    });
    if (res.status !== 204)
      throw new Error(`Dispatch failed: HTTP ${res.status} ${await res.text()}`);
    console.log("Started the Hourly data update workflow");
  },
};
