// validate.mjs — schema validation + index/manifest cross-check.
//
// Run by .github/workflows/validate.yml on every PR + push to main.
// Loads the two JSON Schemas from schemas/, parses index.yaml, walks
// every packs/<name>/helmdeck-pack.yaml, asserts:
//   1. Each YAML conforms to its schema (draft 2020-12 via ajv/dist/2020.js)
//   2. Every index entry has a matching on-disk manifest
//   3. Every on-disk manifest has a matching index entry
//   4. name + version + path agree across both sides
//
// Maintainable in source rather than a sprawling node -e block in YAML;
// also runnable locally for contributors before opening a PR.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repoRoot = process.cwd();
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const indexSchema = JSON.parse(readFileSync(join(repoRoot, 'schemas/index.schema.json'), 'utf8'));
const packSchema = JSON.parse(readFileSync(join(repoRoot, 'schemas/helmdeck-pack.schema.json'), 'utf8'));
const validateIndex = ajv.compile(indexSchema);
const validatePack = ajv.compile(packSchema);

let fail = 0;

// 1. index.yaml
const idx = yaml.load(readFileSync(join(repoRoot, 'index.yaml'), 'utf8'));
if (!validateIndex(idx)) {
  console.error('::error file=index.yaml::index.yaml failed schema validation');
  for (const e of validateIndex.errors) {
    console.error(`  ${e.instancePath || '(root)'}: ${e.message}`);
  }
  fail = 1;
} else {
  console.log(`index.yaml OK (${idx.packs.length} packs)`);
}

// 2. every pack manifest
const packsDir = join(repoRoot, 'packs');
const onDisk = new Map();

for (const dir of readdirSync(packsDir)) {
  const manifestPath = join(packsDir, dir, 'helmdeck-pack.yaml');
  if (!existsSync(manifestPath)) continue;
  const m = yaml.load(readFileSync(manifestPath, 'utf8'));
  onDisk.set(m.name, { manifest: m, dir });
  if (!validatePack(m)) {
    console.error(`::error file=packs/${dir}/helmdeck-pack.yaml::manifest failed schema validation`);
    for (const e of validatePack.errors) {
      console.error(`  ${e.instancePath || '(root)'}: ${e.message}`);
    }
    fail = 1;
  } else {
    console.log(`packs/${dir}/helmdeck-pack.yaml OK`);
  }
}

// 3. cross-check
const indexed = new Map((idx.packs || []).map((p) => [p.name, p]));
for (const [name, p] of indexed) {
  const entry = onDisk.get(name);
  if (!entry) {
    console.error(`::error file=index.yaml::index entry for ${name} has no matching packs/<name>/helmdeck-pack.yaml`);
    fail = 1;
    continue;
  }
  if (entry.manifest.version !== p.version) {
    console.error(`::error file=index.yaml::version mismatch for ${name}: index=${p.version} manifest=${entry.manifest.version}`);
    fail = 1;
  }
  const expectedPath = `packs/${entry.dir}`;
  if (p.path !== expectedPath && p.path !== expectedPath + '/') {
    console.error(`::error file=index.yaml::path mismatch for ${name}: index=${p.path} actual=${expectedPath}`);
    fail = 1;
  }
}
for (const [name] of onDisk) {
  if (!indexed.has(name)) {
    console.error(`::error::packs/${name}/helmdeck-pack.yaml exists but no entry in index.yaml`);
    fail = 1;
  }
}

if (fail) {
  console.error('\n::error::validation failed');
  process.exit(1);
}
console.log(`\nvalidation OK (${indexed.size} packs in sync)`);
