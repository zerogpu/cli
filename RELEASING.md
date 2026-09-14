# Releasing

There is no release step. Bump the version in your PR; merging it to `main`
publishes.

## Bump `package.json` in your PR

```bash
npm run bump         # patch — bug fix, e.g. 3.7.1 → 3.7.2
npm run bump:minor   # new feature, e.g. 3.7.1 → 3.8.0
npm run bump:major   # breaking change, e.g. 3.7.1 → 4.0.0
```

Each updates `package.json` and `package-lock.json` and nothing else — no
commit, no tag. Commit both files with the rest of your work.

**Use the scripts rather than editing the version by hand.** `package-lock.json`
carries the version in two places, and the release only fires when all three
agree.

A PR that shouldn't ship anything just leaves the version alone. That's the
normal case, and it needs no thought.

## What happens on merge

1. CI runs on `main` — lint, build, test
2. If CI is green, Release wakes up and checks the merged commit
3. If the version is newly bumped, it tags `vX.Y.Z`, pushes the tag, publishes
   to npm with provenance, and creates a GitHub Release
4. If not, the run goes green and does nothing

Step 4 is the common path. A skipped release is not a failure and never shows a
red X — check the run's summary for the reason if you expected a publish.

## When it declines to release

Each of these leaves a note on the Release run and ships nothing:

| Summary line | Meaning | Fix |
|---|---|---|
| `vX.Y.Z is already tagged` | The version on `main` is already published. | Nothing — this is every ordinary merge. |
| `package.json is X but package-lock.json says Y / Z` | The lockfile wasn't updated with the bump. | `npm install`, commit the lockfile, push. |
| `package.json is X, which is older than the latest release Y` | The version went backwards. | Bump above the latest release. npm can't un-publish a bad `latest`, so this one is refused rather than guessed at. |

If CI fails, Release never starts.

## If something goes wrong mid-release

The tag is pushed only after `npm ci`, the build, the tests, and the npm
credential check have all passed, so an early failure leaves no tag and no
published version — fix the problem, push again, and the same bump releases.

- **Failed after the tag was pushed but before publish**: delete the tag, then
  re-run the workflow (Actions → Release → Run workflow).
  ```bash
  git push origin :refs/tags/vX.Y.Z
  ```
- **Failed after publish succeeded** (e.g. the release-creation step): the npm
  version is live and the tag exists. Create the GitHub Release by hand:
  ```bash
  gh release create vX.Y.Z --generate-notes
  ```
  npm won't accept the same version twice, so don't re-run — bump to the next
  patch if you need to ship a fix.

A new version can take a minute or two to appear on `npm view zerogpu-cli` after
the workflow goes green. That's registry propagation, not a failed publish.

## Manual dispatch

**Actions → Release → Run workflow** runs the same checks against the head of
`main`, skipping the CI gate. It exists to retry a release that died at the
registry. It is not the normal path and isn't needed for an ordinary release.
