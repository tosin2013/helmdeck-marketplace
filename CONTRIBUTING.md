# Contributing a pack to the helmdeck marketplace

This guide walks you through adding a new capability pack to the community catalog. The same path applies whether your pack wraps an existing SaaS API, glues helmdeck's built-in packs into a new workflow, or ships a binary you wrote yourself.

For the *design rationale* behind the marketplace (trust model, handler types, install flow), see **[helmdeck ADR 034](https://github.com/tosin2013/helmdeck/blob/main/docs/adrs/034-pack-marketplace.md)**.

## TL;DR

1. Fork this repo.
2. Create `packs/<your-pack-name>/`.
3. Add `helmdeck-pack.yaml` describing the pack (schema in [`schemas/helmdeck-pack.schema.json`](schemas/helmdeck-pack.schema.json), worked example in [`packs/cmd.upper/`](packs/cmd.upper/)).
4. Add your handler (executable script for `command`-type packs; not needed for `composite`-type).
5. Append an entry to [`index.yaml`](index.yaml).
6. Open a PR. The validation workflow checks the manifest against the schema.
7. Merged PRs become installable from every helmdeck deployment on the next catalog refresh.

## Pack naming

Pack names use `<family>.<verb>` (e.g. `slack.post_message`, `gitlab.create_issue`, `cmd.upper`). The family is the service or domain; the verb is the action.

Reserved namespaces (built-in core packs — don't reuse these in marketplace packs):

- `browser.*`, `web.*`, `fs.*`, `cmd.*` (built-in `cmd.run` only — `cmd.<your-pack>` is fine for subprocess packs), `git.*`, `repo.*`, `http.*`, `slides.*`, `doc.*`, `desktop.*`, `vision.*`, `python.*`, `node.*`, `github.*`, `blog.*`, `podcast.*`, `image.*`, `hyperframes.*`, `content.*`, `research.*`, `stock.*`

Anything else is fair game — pick a family name that's specific enough that two unrelated packs won't collide. When in doubt, ask in your PR description.

## Pack manifest (`helmdeck-pack.yaml`)

Every pack has a single YAML manifest declaring its identity, schemas, handler, and trust info. See [`schemas/helmdeck-pack.schema.json`](schemas/helmdeck-pack.schema.json) for the full JSON Schema. The minimum viable manifest:

```yaml
name: example.echo
version: v1
author: your-github-username
license: Apache-2.0
description: Echo the input as the output. Sample pack for the contributor guide.
category: developer-tools          # see "Categories" below
tags: [example, echo, demo]

input_schema:
  required: [text]
  properties:
    text: { type: string, description: "The string to echo back." }

output_schema:
  required: [text]
  properties:
    text: { type: string }

handler:
  type: command                    # builtin | command | composite | wasm
  command: ["./echo"]              # path is relative to this pack's directory
```

### Required top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | `<family>.<verb>` form. Globally unique within this catalog. |
| `version` | string | Semver (`v1`, `v1.2.0`) or date-style (`2026.05`). Bump on every change. |
| `author` | string | GitHub username or organization; surfaces in the UI's pack-detail view. |
| `description` | string | One-paragraph plain-English summary. Surfaces in the catalog list. |
| `input_schema` | object | JSON-Schema-style. See `schemas/helmdeck-pack.schema.json`. |
| `output_schema` | object | Same shape as `input_schema`. |
| `handler` | object | Handler type + invocation. See "Handler types" below. |

### Recommended fields

| Field | Type | Notes |
|---|---|---|
| `license` | string | SPDX identifier (`Apache-2.0`, `MIT`, `BSD-3-Clause`, …). Defaults to "unspecified". |
| `category` | string | One of: `developer-tools`, `cloud`, `notifications`, `database`, `security`, `ai-tools`, `monitoring`, `productivity`, `media`. |
| `tags` | array of string | Free-form search keywords. |
| `needs_session` | boolean | True if the pack reads/writes session-scoped filesystem state (cloned repos, fs.*). Default false. |
| `examples` | array | Worked input/output pairs the validation CI runs against. |

## Handler types

| Type | What it is | When to use |
|---|---|---|
| `builtin` | Compiled into helmdeck-core | **Not for community packs.** Reserved for core team. |
| `command` | Executable script (any language) reading JSON from stdin, writing JSON to stdout | The default for community packs. Cross-language friendly. |
| `composite` | Sequence of other packs glued together | Workflow packs that compose existing packs — no code at all. |
| `wasm` | WASI module | Phase 8 — high-performance sandboxed packs. Not yet available. |

### `command` handler (the common case)

```yaml
handler:
  type: command
  command: ["python3", "handler.py"]    # argv list; paths relative to pack dir
  timeout_s: 30                          # optional; default 60
  env:                                   # optional per-pack env vars
    - PYTHONUNBUFFERED=1
  max_output_bytes: 1048576              # optional; default 16 MiB
```

The handler reads one JSON value from stdin, processes it, writes one JSON value to stdout, exits with code 0 on success or non-zero on failure (stderr surfaces in the pack error envelope).

This is the same protocol the v0.12.0 subprocess pack format documents — see [helmdeck's how-to](https://github.com/tosin2013/helmdeck/blob/main/docs/howto/build-subprocess-pack.md).

### `composite` handler (no-code workflows)

```yaml
handler:
  type: composite
  steps:
    - pack: research.deep
      args:
        query: "$.input.topic"           # JSONPath-style ref to the pack input
    - pack: content.ground
      args:
        text: "$.steps[0].output.summary"
        # ...
```

Composite packs wire existing packs into a multi-step workflow. The control plane orchestrates the calls; no executable handler is needed.

## Categories

Pick the category that best fits your pack:

- **developer-tools** — Git platforms, CI/CD, project management (Jira, Linear, GitLab, Bitbucket, …)
- **cloud** — AWS, GCP, Azure, Cloudflare, fly.io, …
- **notifications** — Slack, Discord, Teams, email, SMS, push, …
- **database** — PostgreSQL, MongoDB, Redis, MySQL, ClickHouse, …
- **security** — Trivy, Snyk, Semgrep, OPA, secrets scanning, …
- **ai-tools** — Embeddings, batch APIs, vector DBs, model providers, …
- **monitoring** — Datadog, PagerDuty, Grafana, Honeycomb, Sentry, …
- **productivity** — Notion, Airtable, calendaring, document tools, …
- **media** — Stock photo/video, image/audio/video manipulation, transcription, …

When in doubt, pick the closest fit and mention it in your PR — we can re-categorize after review.

## index.yaml — the catalog header

Every pack also needs a one-line entry in [`index.yaml`](index.yaml). The control plane reads this file to enumerate the catalog without walking every pack directory:

```yaml
packs:
  - name: cmd.upper
    version: v1
    path: packs/cmd.upper
    description: Uppercase a string. Smallest possible example pack.
    category: developer-tools
    tags: [example, string]
    author: tosin2013
  # ... your new entry here
```

The validation workflow ([`validate.yml`](.github/workflows/validate.yml)) cross-checks `index.yaml` entries against every `packs/<name>/helmdeck-pack.yaml` — they must agree on name + version.

## Trust + signing

The trust model has two stages per [helmdeck ADR 034](https://github.com/tosin2013/helmdeck/blob/main/docs/adrs/034-pack-marketplace.md) §"Trust model":

- **Stage A (ships v0.13.0 GA)** — every pack's manifest carries a `trust.sha256` field that the installer verifies against the materialized pack files on every install. A mismatch (someone tampered with the bytes between sign and install) hard-rejects the install.
- **Stage B (deferred to v1.0)** — full sigstore keyless verification of the manifest's `trust.signed_by` identity against the cosign certificate uploaded to the GitHub Release. Adds a true cryptographic identity check on top of stage A's content integrity check.

### As a contributor

You **do not** populate `trust.sha256` or `trust.signed_by` in your manifest. The maintainer runs a pre-release script that:

1. Walks every `packs/<name>/` and computes the deterministic hash of its non-manifest files.
2. Writes `trust.sha256` + `trust.signed_by` into each `helmdeck-pack.yaml`.
3. Commits the updated manifests as a separate "release prep" PR.
4. Tags the merged commit; the [`sign.yml`](.github/workflows/sign.yml) workflow cosign-signs the tarballs and attaches signatures to the GitHub Release.

If you submit a PR with `trust:` fields already set, the maintainer will either remove them (so the release-prep PR is the single source of truth) or accept them if they exactly match what the script would compute. Easier just to leave the block empty.

### As the maintainer

Before tagging a release:

```sh
# 1. Populate hashes (writes trust.sha256 + trust.signed_by per pack)
node scripts/populate-trust-hashes.mjs

# Optional: a different signing identity (e.g. for a fork)
node scripts/populate-trust-hashes.mjs --signed-by my-github-handle

# 2. Commit + push as a normal PR
git add packs/ && git commit -m "release: populate trust.sha256 for vX.Y.Z"
git push

# 3. Merge the PR, then tag the merged commit. sign.yml fires on tag push.
git tag vX.Y.Z && git push --tags
```

The sign.yml workflow runs `populate-trust-hashes.mjs --check` BEFORE invoking cosign, so a maintainer who forgot to re-run the populate step gets a clear CI failure rather than a release with stale hashes.

## Testing your pack locally

Before opening a PR:

```sh
# 1. Validate your manifest against the schema.
ajv validate -s schemas/helmdeck-pack.schema.json -d packs/<your-pack>/helmdeck-pack.yaml

# 2. Test your handler with a real input.
echo '{"text":"hello"}' | ./packs/<your-pack>/<your-handler>

# 3. (When the local marketplace flag lands in helmdeck) install from your fork
#    and call the pack end-to-end.
helmdeck pack install <your-pack> --marketplace=file://$(pwd)
```

## What gets reviewed

- **Schema correctness**: manifest passes `helmdeck-pack.schema.json` validation. CI enforces.
- **Handler correctness**: the examples block runs end-to-end. CI enforces.
- **Name collision**: your pack name doesn't clash with existing packs or reserved core namespaces.
- **License clarity**: SPDX identifier is set and matches your handler's actual license.
- **Description quality**: one paragraph that a non-expert can understand. We may suggest edits.
- **Reasonable scope**: the pack does one thing well; not a kitchen-sink wrapper around a whole API.

## What we will NOT do

- **Promise long-term maintenance** of every community pack. If a pack's upstream API breaks and the author is unreachable, we may mark it deprecated rather than fix it.
- **Accept packs with hard-coded secrets or credentials.** Use the vault — see [helmdeck's credential docs](https://github.com/tosin2013/helmdeck/blob/main/docs/howto/manage-vault-credentials.md).
- **Accept malicious or copyleft-conflicting code.** We reserve the right to refuse packs that look like they exist to exfiltrate data, spam, or that bundle GPL-3 code in a way that infects helmdeck-core.

## Getting help

- Open a [discussion](https://github.com/tosin2013/helmdeck/discussions) for design questions
- Open a [pack-candidate issue](https://github.com/tosin2013/helmdeck/issues?q=is%3Aissue+label%3Apack-candidate) if you want feedback before building
- Tag `@tosin2013` in your PR for prioritization

Welcome to the helmdeck ecosystem.
