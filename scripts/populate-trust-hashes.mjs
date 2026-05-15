#!/usr/bin/env node
// populate-trust-hashes.mjs — maintainer-run script that computes the
// deterministic SHA256 of every pack directory's non-manifest files
// and writes it into the pack's helmdeck-pack.yaml `trust.sha256`
// field. Sets `trust.signed_by` to the configured identity at the
// same time so signing + hashing happen as one logical "release"
// step.
//
// Algorithm
//   Mirrors helmdeck's internal/marketplace/install.go computePackHash:
//     - walk pack dir, skip dirs AND helmdeck-pack.yaml itself
//     - for each remaining file in lexical-by-rel-path order, append
//         <forward-slash-rel-path> \0 <file_sha256_hex> \n
//       to a rolling SHA256
//     - hex-encode the final digest
//
//   Manifest is excluded because it carries the hash field — including
//   it would create a chicken-and-egg. Same pattern Helm/Cargo/npm
//   solve for their respective manifest formats.
//
// Usage
//   node scripts/populate-trust-hashes.mjs [--signed-by <identity>] [--check]
//
//   --signed-by   Identity to write into trust.signed_by. Default: tosin2013.
//   --check       Don't modify files; just verify the existing trust.sha256
//                 fields match the computed hashes. Exits non-zero on mismatch.
//                 Used in CI before the cosign-sign step to catch maintainers
//                 who forgot to re-run the populate step after editing a pack.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import yaml from 'js-yaml';

const args = process.argv.slice(2);
const signedBy = (() => {
  const i = args.indexOf('--signed-by');
  return i >= 0 ? args[i + 1] : 'tosin2013';
})();
const checkOnly = args.includes('--check');

const repoRoot = process.cwd();
const packsDir = join(repoRoot, 'packs');

function computePackHash(packDir) {
  const outer = createHash('sha256');
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(packDir, full).split(sep).join('/');
      if (rel === 'helmdeck-pack.yaml') continue;
      const body = readFileSync(full);
      const inner = createHash('sha256').update(body).digest('hex');
      outer.update(rel + '\x00' + inner + '\n');
    }
  }
  walk(packDir);
  return outer.digest('hex');
}

if (!existsSync(packsDir)) {
  console.error(`packs/ directory not found at ${packsDir}`);
  process.exit(1);
}

let fail = 0;
let updated = 0;

for (const entry of readdirSync(packsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const packDir = join(packsDir, entry.name);
  const manifestPath = join(packDir, 'helmdeck-pack.yaml');
  if (!existsSync(manifestPath)) {
    console.warn(`skipping ${entry.name}: no helmdeck-pack.yaml`);
    continue;
  }

  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = yaml.load(manifestText);
  const hash = computePackHash(packDir);

  if (checkOnly) {
    const current = manifest?.trust?.sha256;
    if (current !== hash) {
      console.error(`::error file=${relative(repoRoot, manifestPath)}::trust.sha256 mismatch — manifest says ${current ?? '(unset)'}, computed ${hash}. Run scripts/populate-trust-hashes.mjs to update.`);
      fail = 1;
    } else {
      console.log(`${entry.name}: trust.sha256 OK (${hash.slice(0, 12)})`);
    }
    continue;
  }

  manifest.trust = manifest.trust ?? {};
  manifest.trust.signed_by = signedBy;
  manifest.trust.sha256 = hash;

  const newText = yaml.dump(manifest, { lineWidth: 120, noRefs: true });
  if (newText !== manifestText) {
    writeFileSync(manifestPath, newText);
    console.log(`updated ${relative(repoRoot, manifestPath)}: trust.sha256 = ${hash}`);
    updated++;
  } else {
    console.log(`${entry.name}: already up to date`);
  }
}

if (checkOnly) {
  if (fail) {
    console.error('\n::error::trust hash check failed. Run scripts/populate-trust-hashes.mjs and commit.');
    process.exit(1);
  }
  console.log('\nall manifests up to date');
} else {
  console.log(`\n${updated} manifest(s) updated. signed_by=${signedBy}`);
  console.log('next: git add packs/ && git commit + push, then tag the merged commit; sign.yml will cosign-sign the tarballs.');
}
