#!/usr/bin/env node

/**
 * docs-reminder.js
 * PostToolUse hook — reminds Claude to update docs/ when source files change.
 *
 * Claude Code passes tool-use data via stdin (JSON). This script reads the
 * modified file path, ignores irrelevant cases (docs/, tests, configs) and
 * prints a reminder to stdout. Claude Code injects stdout into the context.
 */

const fs = require("fs");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));

process.stdin.on("end", () => {
  let toolUse = {};

  try {
    toolUse = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath =
    toolUse?.tool_input?.path ||
    toolUse?.tool_input?.file_path ||
    "";

  if (!filePath) process.exit(0);

  // Skip docs changes themselves to avoid loops
  if (filePath.includes("/docs/") || filePath.startsWith("docs/")) {
    process.exit(0);
  }

  // Skip files that rarely impact public docs
  const IGNORED_PATTERNS = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_test\.go$/,
    /_spec\.rb$/,
    /\.lock$/,
    /\.log$/,
    /node_modules/,
    /\.env/,
    /\.git\//,
    /dist\//,
    /build\//,
    /target\//,
    /coverage\//,
    /\.claude\//,
    /\.github\//,
  ];

  if (IGNORED_PATTERNS.some((p) => p.test(filePath))) process.exit(0);

  const fileName = filePath.split("/").pop();

  const reminder = `
---
[hook: docs-reminder]
"${fileName}" (${filePath}) was modified.
Check whether anything under docs/ (specs, ADRs, OpenAPI, threat models, Diátaxis pages) needs to be updated to reflect this change. Update before continuing if so; otherwise ignore and proceed.
---
`.trim();

  process.stdout.write(reminder);
  process.exit(0);
});
