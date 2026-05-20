# Contributing to zerogpu-cli

Thanks for your interest in contributing! This document explains how to get set up and what we expect from contributions.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Report unacceptable behavior to <hello@zerogpu.ai>.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm (bundled with Node.js)

## Local development

```bash
# Clone the repo and install dependencies
git clone https://github.com/zerogpu/cli.git
cd cli
npm install

# Build the TypeScript sources to dist/
npm run build

# Run the local build directly
node dist/index.js --help

# Or link the CLI globally so you can invoke it as `zerogpu`
npm link
zerogpu --help
```

Use `npm run dev` to start the TypeScript compiler in watch mode while you work.

## Useful scripts

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run build`     | Compile TypeScript to `dist/`             |
| `npm run dev`       | Compile in watch mode                     |
| `npm test`          | Run the test suite once                   |
| `npm run test:watch`| Run tests in watch mode                   |
| `npm run lint`      | Lint with ESLint                          |
| `npm run format`    | Format with Prettier                      |

## Branches and commits

- Base your work on the latest `main`.
- Use a short, descriptive branch name (e.g. `feat/login-command`, `fix/help-text`).
- Write clear commit messages in the imperative mood ("Add X", "Fix Y").

## Pull requests

Before opening a PR, please:

- [ ] Run `npm run lint` and fix any issues.
- [ ] Run `npm test` and ensure it passes.
- [ ] Run `npm run build` and ensure it succeeds.
- [ ] Update documentation if you have changed user-facing behavior.

Open the PR against `main` and fill out the PR template. A maintainer will review as soon as possible.

## Reporting bugs and requesting features

Please use the [issue templates](https://github.com/zerogpu/cli/issues/new/choose). For security issues, see [SECURITY.md](./SECURITY.md) — do not file public issues.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
