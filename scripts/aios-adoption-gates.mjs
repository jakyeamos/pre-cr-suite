#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const mode = process.argv[2] || "help";
const skipDirs = new Set([
  ".agents",
  ".claude",
  ".expo",
  ".git",
  ".github",
  ".next",
  ".planning",
  ".quality-runner",
  ".turbo",
  "AIOS-backfill",
  "build",
  "coverage",
  "dist",
  "ios",
  "node_modules",
  "out",
]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const textExtensions = new Set([...sourceExtensions, ".json", ".md", ".css", ".scss", ".html", ".yml", ".yaml"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function ext(path) {
  const match = path.match(/(\.[^.]+)$/);
  return match ? match[1] : "";
}

function isGeneratedOrTest(path) {
  const name = rel(path);
  return (
    name.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) ||
    name.endsWith(".d.ts") ||
    name.includes("database.types.ts") ||
    name.includes("generated")
  );
}

function rel(path) {
  return relative(root, path);
}

function fail(title, issues) {
  console.error(`${title}: ${issues.length} issue(s)`);
  for (const issue of issues.slice(0, 40)) console.error(`- ${issue}`);
  if (issues.length > 40) console.error(`- ... ${issues.length - 40} more`);
  process.exit(1);
}

function pass(title, details = []) {
  console.log(`${title}: pass`);
  for (const detail of details) console.log(`- ${detail}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageScripts() {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) return {};
  return readJson(packagePath).scripts || {};
}

function formatCheck() {
  const issues = [];
  for (const file of walk(root)) {
    if (!textExtensions.has(ext(file))) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes("\r\n")) issues.push(`${rel(file)} uses CRLF line endings`);
    if (/[ \t]+$/m.test(text)) issues.push(`${rel(file)} has trailing whitespace`);
    if (text.length > 0 && !text.endsWith("\n")) issues.push(`${rel(file)} is missing a final newline`);
  }
  if (issues.length) fail("format-check", issues);
  pass("format-check");
}

function validationCheck() {
  const issues = [];
  const scripts = packageScripts();
  for (const file of ["package.json", "README.md", ".aios-quality-gate.json"]) {
    if (!existsSync(join(root, file))) issues.push(`${file} is missing`);
  }
  for (const script of ["lint", "test"]) {
    if (!scripts[script]) issues.push(`package.json missing script: ${script}`);
  }
  if (!existsSync(join(root, "pnpm-lock.yaml")) && !existsSync(join(root, "package-lock.json"))) {
    issues.push("no canonical JS lockfile found");
  }
  if (issues.length) fail("validation-check", issues);
  pass("validation-check", ["project metadata and required script surfaces exist"]);
}

function packageCheck() {
  const issues = [];
  if (!existsSync(join(root, "app.json")) && !existsSync(join(root, "package.json"))) {
    issues.push("no package/app manifest found");
  }
  if (!existsSync(join(root, "README.md"))) issues.push("README.md is missing");
  if (issues.length) fail("package-check", issues);
  pass("package-check", ["package/app manifests are present"]);
}

function e2eSmokeCheck() {
  const scripts = packageScripts();
  const evidence = [];
  for (const key of ["web", "ios", "android", "start", "build"]) {
    if (scripts[key]) evidence.push(`script:${key}`);
  }
  if (!evidence.length) fail("e2e-smoke-check", ["no launch/build scripts available for smoke proof"]);
  pass("e2e-smoke-check", evidence);
}

function deadCodeAudit() {
  const issues = [];
  for (const file of walk(root)) {
    if (!sourceExtensions.has(ext(file))) continue;
    const name = rel(file).toLowerCase();
    if (/\b(unused|dead|obsolete|old|backup|bak)\b/.test(name)) issues.push(`${rel(file)} has stale/dead-code naming`);
    const text = readFileSync(file, "utf8");
    if (/TODO\s*:\s*(remove|delete|dead|unused)/i.test(text)) issues.push(`${rel(file)} has removal/dead-code TODO marker`);
  }
  if (issues.length) fail("dead-code-audit", issues);
  pass("dead-code-audit", ["no stale filenames or removal/dead-code TODO markers found"]);
}

function complexityCheck() {
  const issues = [];
  const largest = [];
  for (const file of walk(root)) {
    if (!sourceExtensions.has(ext(file)) || isGeneratedOrTest(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n").length;
    largest.push([lines, rel(file)]);
    if (lines > 900) issues.push(`${rel(file)} has ${lines} lines, above 900-line adoption budget`);
  }
  largest.sort((a, b) => b[0] - a[0]);
  if (issues.length) fail("complexity-check", issues);
  pass("complexity-check", largest.slice(0, 10).map(([lines, file]) => `${file}: ${lines} lines`));
}

function thermoAudit() {
  const files = walk(root).filter((file) => sourceExtensions.has(ext(file)) && !isGeneratedOrTest(file));
  const largest = files
    .map((file) => [readFileSync(file, "utf8").split("\n").length, rel(file)])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 15);
  const issues = largest.filter(([lines]) => lines > 1200).map(([lines, file]) => `${file} has ${lines} lines and needs simplification planning`);
  if (issues.length) fail("thermo-nuclear-simplification", issues);
  pass("thermo-nuclear-simplification", largest.map(([lines, file]) => `${file}: ${lines} lines`));
}

switch (mode) {
  case "format":
    formatCheck();
    break;
  case "validation":
    validationCheck();
    break;
  case "package":
    packageCheck();
    break;
  case "e2e-smoke":
    e2eSmokeCheck();
    break;
  case "dead-code":
    deadCodeAudit();
    break;
  case "complexity":
    complexityCheck();
    break;
  case "thermo":
    thermoAudit();
    break;
  default:
    console.error("Usage: node scripts/aios-adoption-gates.mjs <format|validation|package|e2e-smoke|dead-code|complexity|thermo>");
    process.exit(2);
}
