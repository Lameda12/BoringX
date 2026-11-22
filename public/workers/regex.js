// Worker for user-supplied regular expressions (Regex Tester, Sandbox Regex and Find and replace blocks).
// Runs off the main thread so a catastrophic-backtracking pattern can be terminated by the page.
// Served with the same /workers/ CSP as custom-js.js (connect-src 'none').
function badRegex(e) {
  return new Error("Invalid regex: " + (e instanceof Error ? e.message : e));
}

function runRegexJob(job) {
  const input = job.input;
  if (job.kind === "replace") {
    const re = (() => {
      try { return new RegExp(job.find, (job.all ? "g" : "") + (job.ignoreCase ? "i" : "")); } catch (e) { throw badRegex(e); }
    })();
    return input.replace(re, String(job.with));
  }
  const pattern = String(job.pattern);
  if (!pattern) throw new Error("Enter a pattern.");
  const flags = String(job.flags);
  let re;
  try { re = new RegExp(pattern, flags); } catch (e) { throw badRegex(e); }
  if (job.mode === "replace") return input.replace(re, String(job.replacement));
  if (job.mode === "test") {
    const r = new RegExp(pattern, flags.replace(/[gy]/g, ""));
    return input.split("\n").filter((l) => r.test(l)).join("\n");
  }
  const all = re.global ? [...input.matchAll(re)] : ((m) => (m ? [m] : []))(re.exec(input));
  if (!all.length) return "No matches.";
  return `${all.length} match${all.length === 1 ? "" : "es"}\n\n` + all.slice(0, 500).map((m, i) => {
    const groups = m.slice(1).map((g, j) => `    $${j + 1} = ${g === undefined ? "(unset)" : JSON.stringify(g)}`);
    const named = m.groups ? Object.entries(m.groups).map(([k, v]) => `    ${k} = ${JSON.stringify(v)}`) : [];
    return [`#${i + 1} at ${m.index}: ${JSON.stringify(m[0])}`, ...groups, ...named].join("\n");
  }).join("\n");
}

if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof module === "undefined") {
  self.onmessage = (e) => {
    try {
      self.postMessage({ ok: true, out: runRegexJob(e.data) });
    } catch (err) {
      self.postMessage({ ok: false, error: String((err && err.message) || err) });
    }
  };
}
// Under Node (unit tests) there is no worker global scope; export the core instead.
if (typeof module !== "undefined") module.exports = { runRegexJob };
