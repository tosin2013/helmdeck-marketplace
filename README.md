# helmdeck-marketplace

> Community marketplace for [helmdeck](https://github.com/tosin2013/helmdeck) capability packs.

This is the default catalog the helmdeck control plane reads at startup (override via `HELMDECK_MARKETPLACE_URL`). Each pack here is a self-contained capability — a typed input/output schema plus a handler in any language — that operators can install into their helmdeck deployment in one click.

The schemas, install flow, and trust model are defined in **[helmdeck ADR 034](https://github.com/tosin2013/helmdeck/blob/main/docs/adrs/034-pack-marketplace.md)**.

## How to install a pack

From the helmdeck Management UI: open the `/marketplace` panel, find the pack, click **Install**.

From the CLI:

```sh
helmdeck pack install <pack-name>
```

From the REST API:

```sh
curl -X POST http://localhost:3000/api/v1/marketplace/install \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "<pack-name>"}'
```

Packs are hot-loaded — they appear in `tools/list` immediately, no restart required.

## How to contribute a pack

1. **Fork this repo** and clone your fork.
2. **Create your pack directory**: `packs/<your-pack-name>/`.
3. **Add a `helmdeck-pack.yaml` manifest** describing the pack. See [`schemas/helmdeck-pack.schema.json`](schemas/helmdeck-pack.schema.json) for the full schema; [`packs/cmd.upper/helmdeck-pack.yaml`](packs/cmd.upper/helmdeck-pack.yaml) for a worked example.
4. **Add your handler**: for `command`-type packs, this is the executable script (any language) the manifest's `handler.command` field points at.
5. **Add an entry to `index.yaml`** — the top-level catalog the control plane fetches at startup.
6. **Open a PR**. The CI workflow [`validate.yml`](.github/workflows/validate.yml) checks your manifest against the schema and runs the pack against a basic input from the manifest's `examples` block.
7. **Once merged**, your pack is available in every helmdeck deployment on the next catalog refresh.

Detailed contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md).

## Trust model

| Trust level | What it means | How operators see it |
|---|---|---|
| **Core** | Built into the helmdeck binary | Pre-installed; no install step. UI shows "Core" badge. |
| **Signed** | Cosign-signed by the maintainer of this repo | Verified at install time. UI shows "Signed" badge. |
| **Unsigned** | Community PR not yet signed | Requires explicit operator consent at install. UI shows "Unsigned" badge + warning dialog. |

Cosign signing runs in [`.github/workflows/sign.yml`](.github/workflows/sign.yml) on every release tag. The public key for verification is published at [`COSIGN_PUBLIC_KEY`](COSIGN_PUBLIC_KEY) — once the first signed release lands.

## Catalog structure

```
helmdeck-marketplace/
├── README.md                       # this file
├── CONTRIBUTING.md                 # contributor guide
├── LICENSE                         # Apache 2.0
├── CODEOWNERS                      # @tosin2013 + community reviewers
├── index.yaml                      # top-level catalog the control plane fetches
├── schemas/
│   ├── helmdeck-pack.schema.json   # JSON Schema for per-pack manifests
│   └── index.schema.json           # JSON Schema for the catalog index
├── packs/                          # one directory per pack
│   ├── cmd.upper/
│   │   ├── helmdeck-pack.yaml
│   │   └── upper                   # the handler (any executable)
│   └── ...
└── .github/
    └── workflows/
        ├── validate.yml            # manifest + index schema validation on every PR
        └── sign.yml                # cosign signing on release tags
```

## Status

🚧 **Pre-release.** This repo is being scaffolded as part of helmdeck v0.13.0 "Marketplace beta." The first signed release will track helmdeck's v0.13.0 release.

## License

Apache 2.0 — same as helmdeck itself. See [LICENSE](LICENSE).

Individual packs may declare their own licenses in their `helmdeck-pack.yaml` (`license:` field). The marketplace surface (this repo's catalog tooling) stays Apache 2.0.

## Related

- [helmdeck](https://github.com/tosin2013/helmdeck) — the control plane this marketplace serves
- [ADR 034](https://github.com/tosin2013/helmdeck/blob/main/docs/adrs/034-pack-marketplace.md) — design rationale + schemas
- [#32](https://github.com/tosin2013/helmdeck/issues/32) — T814 scaffolding issue
- helmdeck Discussions for marketplace-track questions
