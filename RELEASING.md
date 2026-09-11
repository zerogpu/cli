# Releasing

Releasing is two steps: bump the version in a PR, then press a button.

## 1. Bump `package.json` in your PR

```bash
npm run bump         # patch — bug fix, e.g. 3.7.0 → 3.7.1
npm run bump:minor   # new feature, e.g. 3.7.0 → 3.8.0
npm run bump:major   # breaking change, e.g. 3.7.0 → 4.0.0
```

Each updates `package.json` and `package-lock.json` and nothing else — no
commit, no tag. Commit the change with the rest of your work and merge to
`main` as usual.

A PR that shouldn't ship anything just leaves the version alone.

## 2. Press the button

**Actions → Release → Run workflow**, on `main`.

The workflow reads the version out of `package.json`, tags that commit
`vX.Y.Z`, pushes the tag, publishes to npm, and creates a GitHub Release.

If the version on `main` is already tagged — i.e. nobody bumped it — the run
fails immediately, before it changes anything:

```
v3.7.0 is already tagged — 3.7.0 is published. Bump the version in
package.json and merge to main first.
```

So pressing the button twice, or pressing it after a merge that made no
release-worthy change, is safe.

## Pre-flight

- The version in `package.json` on `main` is the one you mean to publish
- CI is green on the latest `main` commit

## If something goes wrong mid-release

The tag is pushed only after `npm ci`, the build, the tests, and the npm
credential check have all passed, so an early failure leaves no trace — fix the
problem and press the button again.

- **Failed after the tag was pushed but before publish**: delete the tag, then
  press the button again.
  ```bash
  git push origin :refs/tags/vX.Y.Z
  ```
- **Failed after publish succeeded** (e.g. the release-creation step): the npm
  version is live and the tag exists. Create the GitHub Release by hand:
  ```bash
  gh release create vX.Y.Z --generate-notes
  ```
  npm will not let the same version be published twice, so don't re-run the
  workflow — bump to the next patch if you need to ship a fix.

## Publishing an existing tag

Pushing a `vX.Y.Z` tag by hand also triggers the workflow, which is how the
older flow worked. The tag must match `package.json` at that commit or the run
fails.
