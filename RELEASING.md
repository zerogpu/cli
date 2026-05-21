# Releasing

From a clean `main`, fully up to date:

```bash
git checkout main
git pull
npm run release
```

`npm run release` bumps `package.json` (patch), creates a commit and a `vX.Y.Z` tag, and pushes both. The tag push triggers `.github/workflows/release.yml`, which builds, tests, publishes to npm, and creates a GitHub Release.

## Variants

```bash
# minor bump (new feature, e.g. 2.1.0 → 2.2.0)
npm run release:minor

# major bump (breaking change, e.g. 2.1.0 → 3.0.0)
npm run release:major
```

Each script bumps `package.json`, creates a commit and `vX.Y.Z` tag, and pushes both — same flow as `npm run release`, just with a different version segment.

## Pre-flight checklist

- `git status` — working tree clean
- `git branch --show-current` — on `main`
- `git pull` — up to date with origin
- CI green on the latest `main` commit

`npm version` refuses to run on a dirty tree, which is the main guardrail.

## If something goes wrong mid-release

- **Workflow fails after publish succeeded** (e.g. release-creation step): the npm version is live; create the GitHub release manually:
  ```bash
  gh release create vX.Y.Z --generate-notes
  ```
- **Workflow fails before publish**: fix the issue, delete the tag locally and remotely, then bump to the next patch:
  ```bash
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  ```
