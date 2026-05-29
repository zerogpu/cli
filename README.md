# zerogpu-cli

[![npm version](https://img.shields.io/npm/v/zerogpu-cli.svg)](https://www.npmjs.com/package/zerogpu-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The official command-line interface for [ZeroGPU](https://zerogpu.ai) — run fast, edge-optimized inference models (classification, extraction, redaction, chat, summarization) right from your terminal.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Commands](#commands)
  - [Account](#account)
    - [`login`](#login)
    - [`status`](#status)
  - [Chat & Generation](#chat--generation)
    - [`chat`](#chat)
    - [`chat_thinking`](#chat_thinking)
    - [`summarize`](#summarize)
    - [`generate_followups`](#generate_followups)
  - [Classification](#classification)
    - [`classify_iab`](#classify_iab)
    - [`classify_iab_enriched`](#classify_iab_enriched)
    - [`classify_structured`](#classify_structured)
    - [`classify_zero_shot`](#classify_zero_shot)
  - [Extraction](#extraction)
    - [`extract_entities`](#extract_entities)
    - [`extract_json`](#extract_json)
    - [`extract_pii`](#extract_pii)
    - [`redact_pii`](#redact_pii)
- [Environment Variables](#environment-variables)
- [Output](#output)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```bash
npm install -g zerogpu-cli@latest
```

Requires **Node.js 20+**.

Verify the install:

```bash
zerogpu --version
zerogpu --help
```

---

## Quick Start

```bash
# 1. Sign in (you'll be prompted for your API key and project ID)
zerogpu login

# 2. Check your session
zerogpu status

# 3. Run your first command
zerogpu summarize "ZeroGPU runs small, fast models at the edge so you can ship AI features without managing GPUs."
```

---

## Authentication

Every inference command requires a valid API key **and** a project ID. You can provide them in two ways:

1. **`zerogpu login`** — stores credentials in a local config file and exports `ZEROGPU_API_KEY` to your shell profile.
2. **Environment variable** — set `ZEROGPU_API_KEY` directly (useful for CI). The project ID still needs to be saved via `login` or supplied through the config file.

Get your API key (`zgpu-api-…`) and project ID (UUID) from the [ZeroGPU dashboard](https://zerogpu.ai).

---

## Commands

All commands follow the pattern:

```bash
zerogpu <command> [arguments] [options]
```

Run `zerogpu <command> --help` for command-level help.

### Account

#### `login`

Sign in to ZeroGPU. Prompts for your API key (masked input) and project ID, validates them, and persists the credentials.

```bash
zerogpu login
zerogpu login --api-key zgpu-api-xxxxxxxx --project-id 4ed3e5bb-c2ed-4d4a-8a66-2b161a27fd1a
```

| Option | Description |
|---|---|
| `--api-key <key>` | Provide the API key directly (skips the prompt). |
| `--project-id <id>` | Provide the project ID directly (skips the prompt). |

#### `status`

Check whether you're signed in and where the API key was loaded from.

```bash
zerogpu status
```

---

### Chat & Generation

#### `chat`

Chat with the **LFM2.5-1.2B-Instruct** model.

```bash
zerogpu chat "Explain edge inference in one sentence."
zerogpu chat "Translate to French: Good morning." -i "You are a precise translator."
```

| Option | Description |
|---|---|
| `-i, --instructions <text>` | System instructions that steer the assistant's behavior. |

#### `chat_thinking`

Chat with the **LFM2.5-1.2B-Thinking** model, which returns reasoning alongside its answer.

```bash
zerogpu chat_thinking "If a train leaves at 3pm at 60mph, when does it arrive 180 miles later?"
```

#### `summarize`

Summarize text with the **llama-3.1-8b-instruct-fast** model.

```bash
zerogpu summarize "Long article text goes here..."
```

#### `generate_followups`

Generate contextual follow-up questions using the ZeroGPU follow-up edge model.

```bash
zerogpu generate_followups "We just shipped a new pricing page focused on enterprise plans."
```

---

### Classification

#### `classify_iab`

Classify text against the **IAB** audience and content taxonomy using the ZeroGPU IAB edge model.

```bash
zerogpu classify_iab "Tips for first-time homebuyers in 2026."
```

#### `classify_iab_enriched`

Same as `classify_iab` but returns enriched output: audience, topics, keywords, and intent.

```bash
zerogpu classify_iab_enriched "Best running shoes for marathon training."
```

#### `classify_structured`

Classify text against a **structured schema** of categories and allowed labels using GLiNER2.

```bash
zerogpu classify_structured "The product arrived broken and I want a refund." \
  --schema '{"sentiment":["positive","negative","neutral"],"intent":["complaint","praise","question"]}'
```

| Option | Description |
|---|---|
| `-s, --schema <json>` | **Required.** JSON object mapping category name → allowed labels. |

#### `classify_zero_shot`

Zero-shot classification against arbitrary candidate labels using **DeBERTa v3**.

```bash
# Repeat --label for each candidate
zerogpu classify_zero_shot "The stock market dropped 3% today." \
  --label finance --label sports --label politics

# Or pass them as a comma-separated list
zerogpu classify_zero_shot "The stock market dropped 3% today." \
  --labels finance,sports,politics
```

| Option | Description |
|---|---|
| `-l, --label <label>` | Candidate label (repeatable). |
| `--labels <a,b,c>` | Comma-separated list of candidate labels. |

---

### Extraction

#### `extract_entities`

Extract named entities from text using **GLiNER2** with custom labels.

```bash
zerogpu extract_entities "Tim Cook visited the Cupertino campus on Tuesday." \
  --label person --label organization --label location --threshold 0.4
```

| Option | Default | Description |
|---|---|---|
| `-l, --label <label>` | — | Entity label to extract (repeatable). |
| `--labels <a,b,c>` | — | Comma-separated entity labels. |
| `-t, --threshold <number>` | `0.3` | Confidence threshold between 0 and 1. |

#### `extract_json`

Extract **structured JSON** from text against a provided schema using GLiNER2.

```bash
zerogpu extract_json "Email Jane Doe at jane@example.com or call 555-0100." \
  --schema '{"contact":["name::str::Full name","email::str::Email address","phone::str::Phone number"]}'
```

| Option | Description |
|---|---|
| `-s, --schema <json>` | **Required.** Schema as a JSON string. Field format: `name::type::description`. |

#### `extract_pii`

Extract PII entities (persons, emails, phone numbers, etc.) using `gliner-multi-pii-v1`.

```bash
zerogpu extract_pii "Contact John Smith at john@acme.com or +1-415-555-0100." \
  --threshold 0.5 --categories identity,contact
```

| Option | Default | Description |
|---|---|---|
| `-t, --threshold <number>` | `0.5` | Confidence threshold. |
| `-c, --categories <list>` | `identity,contact` | Comma-separated PII categories. |

#### `redact_pii`

Detect and **redact** PII in text — returns the input with sensitive spans masked by label.

```bash
zerogpu redact_pii "Call Sarah at 415-555-0100 or email sarah@acme.com."
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ZEROGPU_API_KEY` | Overrides the API key from the config file. Set automatically by `zerogpu login` for your default shell. |

The project ID is read from the saved config file written during `zerogpu login`.

---

## Output

- Inference commands print the model's response to **stdout**. When the response is valid JSON, it is pretty-printed.
- Errors and diagnostic messages are written to **stderr**.
- All commands exit with code **`0`** on success and **`1`** on failure — safe to use in pipelines and scripts.

Example:

```bash
zerogpu classify_iab "Tips for first-time homebuyers." > result.json
```

---

## Troubleshooting

- **`You're not fully signed in yet.`** Run `zerogpu login` again, or check `zerogpu status`.
- **`That doesn't look like a valid API key`** Keys must start with `zgpu-api-`.
- **`That doesn't look like a valid project ID`** Project IDs must be a UUID (e.g. `4ed3e5bb-c2ed-4d4a-8a66-2b161a27fd1a`).
- **`ZEROGPU_API_KEY` not picked up in a new shell:** open a new terminal, or `source` your shell config file (the `login` command prints the path).
- **HTTP errors** are surfaced with the response status and body — inspect them to debug request issues.

---

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md).

Security concerns? See [SECURITY.md](./SECURITY.md).

```bash
git clone https://github.com/zerogpu/cli.git
cd cli
npm install
npm run build
npm test
```

---

## License

Released under the [MIT License](./LICENSE).
