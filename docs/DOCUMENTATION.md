# ZeroGPU CLI — Reference Documentation

## 1. Project Description

`zerogpu-cli` is the official command-line interface for [ZeroGPU](https://zerogpu.ai), a distributed / edge inference platform for small language models (SLMs) and nano language models. The CLI is a thin, OpenAI-compatible client around the ZeroGPU **Responses API** (`https://api.zerogpu.ai/v1/responses`) that lets you call a curated set of edge-optimized models directly from your terminal for common NLP workloads:

- Conversational chat (`LFM2.5-1.2B-Instruct`, `LFM2.5-1.2B-Thinking`)
- IAB content/audience classification (`zlm-v1-iab-classify-edge`, `…-enriched`)
- Zero-shot classification (`deberta-v3-small`)
- Structured / schema-driven classification and JSON extraction (`gliner2-base-v1`)
- Named-entity recognition with custom labels (`gliner2-base-v1`)
- PII extraction & redaction (`gliner-multi-pii-v1`)
- Text summarization (`llama-3.1-8b-instruct-fast`)
- Follow-up question generation (`zlm-v1-followup-questions-edge`)

It is written in TypeScript (ESM, Node ≥ 20), built on [`commander`](https://github.com/tj/commander.js), and ships a single executable: `zerogpu`.

---

## 2. Installation

### Prerequisites
- **Node.js ≥ 20**
- An NPM-compatible package manager (`npm`, `pnpm`, or `yarn`)
- A ZeroGPU **API key** (format: `zgpu-api-…`)

### Install globally (recommended)
```bash
npm install -g zerogpu-cli
```

### Verify
```bash
zerogpu --version       # prints the installed version
zerogpu --help          # lists all commands
```

### Upgrade
```bash
npm install -g zerogpu-cli@latest
```
The CLI checks for updates daily and prints a notice for minor/major releases.

### Uninstall
```bash
npm uninstall -g zerogpu-cli
```

### Local / from source
```bash
git clone https://github.com/zerogpu/cli.git zerogpu-cli
cd zerogpu-cli
npm install
npm run build
node dist/index.js --help
```

### First-time authentication
```bash
zerogpu login
```
Credentials are persisted to a local config file and `ZEROGPU_API_KEY` is added to your shell config (`~/.zshrc`, `~/.bashrc`, etc.) so other tools can pick it up.

---

## 3. Global Options

| Flag | Description |
|---|---|
| `-v`, `--version` | Print the installed CLI version and exit. |
| `-h`, `--help` | Show top-level help, or per-command help when used after a subcommand. |

### Environment variables

| Variable | Purpose |
|---|---|
| `ZEROGPU_API_KEY` | API key. Used as fallback if no config file is present. Written by `zerogpu login`. |

### Resolution order
For every request the CLI resolves the API key by checking the **config file first**, then the `ZEROGPU_API_KEY` **environment variable**. If the API key is missing, the command exits with code `1` and prompts you to run `zerogpu login`.

---

## 4. Commands

The CLI exposes the following commands:

| Command | Purpose |
|---|---|
| [`login`](#41-login) | Sign in and persist API key |
| [`status`](#42-status) | Show current sign-in status |
| [`chat`](#43-chat) | Chat with `LFM2.5-1.2B-Instruct` |
| [`chat_thinking`](#44-chat_thinking) | Chat with the Thinking variant (returns reasoning) |
| [`classify_iab`](#45-classify_iab) | IAB taxonomy classification |
| [`classify_iab_enriched`](#46-classify_iab_enriched) | IAB enriched (topics / keywords / intent) |
| [`classify_zero_shot`](#47-classify_zero_shot) | Zero-shot classification against candidate labels |
| [`classify_structured`](#48-classify_structured) | Schema-based multi-category classification |
| [`extract_entities`](#49-extract_entities) | Custom-label NER |
| [`extract_pii`](#410-extract_pii) | Extract PII entities |
| [`redact_pii`](#411-redact_pii) | Mask PII in-line in the text |
| [`extract_json`](#412-extract_json) | Schema-driven structured JSON extraction |
| [`summarize`](#413-summarize) | Summarize text with `llama-3.1-8b-instruct-fast` |
| [`generate_followups`](#414-generate_followups) | Generate follow-up questions |

### Common exit codes
| Code | Meaning |
|---|---|
| `0` | Success — result printed to **stdout**. |
| `1` | Failure — error printed to **stderr** (validation, network, HTTP non-2xx, empty model output, or not signed in). |

### Common output behavior
For every inference command, the CLI extracts `output[0].content[…].text` from the Responses API payload. If that string parses as JSON it is pretty-printed (`JSON.stringify(parsed, null, 2)`); otherwise it is printed verbatim. All errors are written to `stderr` and the process exits with code `1`.

---

### 4.1 `login`

Sign in to ZeroGPU and persist your credentials.

**Synopsis**
```
zerogpu login [--api-key <key>]
```

**Parameters**

| Flag | Type | Required | Description |
|---|---|---|---|
| `--api-key <key>` | string | optional | Provide the API key non-interactively. Must start with `zgpu-api-`. If omitted, the CLI shows a masked prompt. |

**Examples**
```bash
# Interactive
zerogpu login

# Non-interactive (e.g., CI)
zerogpu login --api-key zgpu-api-XXXXXXXXXXXXXXXXXX
```

**Outcomes**

| Outcome | Exit | Side effects |
|---|---|---|
| Success | `0` | API key written to config file; `ZEROGPU_API_KEY` upserted into shell profile or Windows env; success message printed. |
| Invalid / empty API key | `1` | Nothing written. stderr explains the `zgpu-api-` prefix requirement. |
| User cancels prompt (Ctrl-C / EOF) | `1` | "Login cancelled. No changes were made." |

**Expected stdout (success)**
```
You're logged in. Your API key has been saved.
We also added ZEROGPU_API_KEY to your shell config (/Users/you/.zshrc) so other tools can use it.
To use it right away in this terminal, run:  source /Users/you/.zshrc
Or just open a new terminal window — it'll be there automatically.
```

---

### 4.2 `status`

Show current sign-in status and the masked API key.

**Synopsis**
```
zerogpu status
```

**Parameters** — none.

**Example**
```bash
zerogpu status
```

**Outcomes**

| Outcome | Exit | stdout / stderr |
|---|---|---|
| Signed in | `0` | `You're signed in to ZeroGPU.` + `  API key: zgpu-api-****abcd  (saved on this computer | from your ZEROGPU_API_KEY environment variable)` |
| Not signed in | `1` | `You're not signed in yet.` + `Run 'zerogpu login' to get started.` |

---

### 4.3 `chat`

Chat with the `LFM2.5-1.2B-Instruct` model.

**Synopsis**
```
zerogpu chat <text> [-i <instructions>]
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | The user message / prompt to send. |
| `-i`, `--instructions <instructions>` | string | optional | System instructions that steer the assistant's behavior. |

**Example**
```bash
zerogpu chat "Explain WebSockets in two sentences." \
  -i "You are a concise technical writer."
```

**Expected output**
Either the raw assistant text, or — if the assistant returned a JSON string — a pretty-printed JSON object.
```
WebSockets are a protocol that enables full-duplex, persistent communication between a client
and a server over a single TCP connection. Unlike HTTP, either side can push messages at any
time without polling.
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success — text printed | `0` |
| Not signed in | `1` |
| Network error (fetch threw) | `1` — `Request failed: <message>` |
| HTTP non-2xx | `1` — `Request failed with status <code>.` + body |
| Response missing content | `1` — `Response did not contain any chat content.` + raw JSON dump |

---

### 4.4 `chat_thinking`

Chat with `LFM2.5-1.2B-Thinking`, which returns its reasoning alongside its answer.

**Synopsis**
```
zerogpu chat_thinking <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | The user message / prompt. |

**Example**
```bash
zerogpu chat_thinking "If a train leaves at 3 PM going 60 mph, when does it cover 150 miles?"
```

**Outcomes** — identical to [`chat`](#43-chat), with the model's reasoning included in the printed output.

---

### 4.5 `classify_iab`

Classify text against the IAB content/audience taxonomy using `zlm-v1-iab-classify-edge`.

**Synopsis**
```
zerogpu classify_iab <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Text to classify. |

**Example**
```bash
zerogpu classify_iab "The Lakers signed a new point guard ahead of the playoffs."
```

**Expected output (illustrative)**
```json
{
  "categories": [
    { "id": "IAB17-44", "name": "Basketball", "confidence": 0.97 }
  ]
}
```

**Outcomes** — same as the [common outcomes table](#4-commands).

---

### 4.6 `classify_iab_enriched`

Classify text with the **enriched** IAB edge model (`zlm-v1-iab-classify-edge-enriched`) — returns audience categories plus topics, keywords, and inferred intent.

**Synopsis**
```
zerogpu classify_iab_enriched <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Text to classify. |

**Example**
```bash
zerogpu classify_iab_enriched "Compare the Tesla Model Y and the Hyundai Ioniq 5 for a family of four."
```

**Expected output (illustrative)**
```json
{
  "categories": [{ "id": "IAB2-1", "name": "Auto Buyers", "confidence": 0.92 }],
  "topics": ["electric vehicles", "family cars"],
  "keywords": ["Tesla Model Y", "Hyundai Ioniq 5"],
  "intent": "comparison-shopping"
}
```

**Outcomes** — same as the common table.

---

### 4.7 `classify_zero_shot`

Zero-shot text classification with `deberta-v3-small` against an arbitrary set of candidate labels.

**Synopsis**
```
zerogpu classify_zero_shot <text> (-l <label>...)|(--labels a,b,c)
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Text to classify. |
| `-l`, `--label <label>` | string | one of `-l`/`--labels` is required | Single label. Repeatable. |
| `--labels <labels>` | string | one of `-l`/`--labels` is required | Comma-separated list of labels. Can be combined with `-l`. |

**Example**
```bash
zerogpu classify_zero_shot "I love how fast this laptop boots up." \
  -l positive -l negative -l neutral
```

**Expected output (illustrative)**
```json
{ "label": "positive", "scores": { "positive": 0.94, "neutral": 0.04, "negative": 0.02 } }
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success | `0` |
| No labels supplied | `1` — `At least one label is required.` |
| Not signed in / network / HTTP / empty content | `1` (see common table) |

---

### 4.8 `classify_structured`

Schema-driven classification using `gliner2-base-v1`.

**Synopsis**
```
zerogpu classify_structured <text> -s <json>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Text to classify. |
| `-s`, `--schema <json>` | JSON string | **yes** | JSON object mapping a category name to its allowed labels, e.g. `'{"sentiment":["positive","negative","neutral"]}'`. Multiple categories supported. |

**Example**
```bash
zerogpu classify_structured "Support replied quickly but the fix didn't work." \
  -s '{"sentiment":["positive","negative","neutral"],"topic":["support","billing","product"]}'
```

**Expected output (illustrative)**
```json
{ "sentiment": "negative", "topic": "support" }
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success | `0` |
| `--schema` is not valid JSON | `1` — `Invalid --schema JSON: <message>` |
| Not signed in / network / HTTP / empty content | `1` |

---

### 4.9 `extract_entities`

Custom-label NER with `gliner2-base-v1`.

**Synopsis**
```
zerogpu extract_entities <text> (-l <label>...|--labels a,b,c) [-t <number>]
```

**Parameters**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` (positional) | string | yes | — | Source text. |
| `-l`, `--label <label>` | string | one of `-l`/`--labels` | — | Entity label to extract. Repeatable. |
| `--labels <labels>` | string | one of `-l`/`--labels` | — | Comma-separated list of labels. |
| `-t`, `--threshold <number>` | float in [0, 1] | optional | `0.3` | Minimum confidence for returned spans. |

**Example**
```bash
zerogpu extract_entities \
  "Apple CEO Tim Cook met with Sundar Pichai in Cupertino on Monday." \
  --labels person,organization,location -t 0.4
```

**Expected output (illustrative)**
```json
[
  { "label": "organization", "text": "Apple", "score": 0.98 },
  { "label": "person", "text": "Tim Cook", "score": 0.97 },
  { "label": "person", "text": "Sundar Pichai", "score": 0.96 },
  { "label": "location", "text": "Cupertino", "score": 0.91 }
]
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success | `0` |
| No labels supplied | `1` — `At least one label is required.` |
| Threshold not in `[0, 1]` or not a number | `1` — `--threshold must be a number between 0 and 1.` |
| Not signed in / network / HTTP / empty content | `1` |

---

### 4.10 `extract_pii`

Extract PII entities with `gliner-multi-pii-v1`.

**Synopsis**
```
zerogpu extract_pii <text> [-t <number>] [-c <list>]
```

**Parameters**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` (positional) | string | yes | — | Source text. |
| `-t`, `--threshold <number>` | float | optional | `0.5` | Minimum confidence for returned entities. |
| `-c`, `--categories <list>` | comma-separated string | optional | `identity,contact` | PII categories to extract. |

**Example**
```bash
zerogpu extract_pii \
  "Contact Jane Doe at jane@example.com or +1 (415) 555-1212." \
  -t 0.6 -c identity,contact,financial
```

**Expected output (illustrative)**
```json
[
  { "category": "identity", "label": "person", "text": "Jane Doe", "score": 0.96 },
  { "category": "contact",  "label": "email",  "text": "jane@example.com", "score": 0.99 },
  { "category": "contact",  "label": "phone",  "text": "+1 (415) 555-1212", "score": 0.95 }
]
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success | `0` |
| `--threshold` not a finite number | `1` — `Invalid threshold: <value>` |
| Not signed in / network / HTTP / empty content | `1` |

---

### 4.11 `redact_pii`

Detect and mask PII in-line in the text, using `gliner-multi-pii-v1` with `mask: "label"`.

**Synopsis**
```
zerogpu redact_pii <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Source text whose PII should be masked with label placeholders. |

**Example**
```bash
zerogpu redact_pii "Email John Smith at john@acme.com about invoice 12345."
```

**Expected output (illustrative)**
```
Email [PERSON] at [EMAIL] about invoice 12345.
```

**Outcomes** — same as the common table.

---

### 4.12 `extract_json`

Schema-driven structured-JSON extraction with `gliner2-base-v1`.

**Synopsis**
```
zerogpu extract_json <text> -s <json>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Source text. |
| `-s`, `--schema <json>` | JSON string | **yes** | Field schema, e.g. `'{"contact":["name::str::Full name","email::str::Email address"]}'`. Per-field syntax: `name::type::description`. |

**Example**
```bash
zerogpu extract_json \
  "Reach Maria Lopez at maria.lopez@acme.io or 415-555-0188." \
  -s '{"contact":["name::str::Full name","email::str::Email address","phone::str::Phone number"]}'
```

**Expected output (illustrative)**
```json
{
  "contact": {
    "name": "Maria Lopez",
    "email": "maria.lopez@acme.io",
    "phone": "415-555-0188"
  }
}
```

**Outcomes**

| Outcome | Exit |
|---|---|
| Success | `0` |
| `--schema` is not valid JSON | `1` — `Invalid --schema JSON: <message>` |
| Not signed in / network / HTTP / empty content | `1` |

---

### 4.13 `summarize`

Summarize text with `llama-3.1-8b-instruct-fast`.

**Synopsis**
```
zerogpu summarize <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | The text to summarize. |

**Example**
```bash
zerogpu summarize "$(cat article.txt)"
```

**Expected output**
A single condensed summary string (or a JSON object if the model returns one).

**Outcomes** — same as the common table.

---

### 4.14 `generate_followups`

Generate contextual follow-up questions using `zlm-v1-followup-questions-edge`.

**Synopsis**
```
zerogpu generate_followups <text>
```

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `text` (positional) | string | yes | Conversation turn / passage to generate follow-ups for. |

**Example**
```bash
zerogpu generate_followups \
  "Solar panel adoption increased 35% in the US last year."
```

**Expected output (illustrative)**
```json
[
  "Which states drove the largest share of the increase?",
  "How does residential adoption compare to commercial?",
  "What policy changes contributed to this growth?"
]
```

**Outcomes** — same as the common table.

---

## 5. Network & API Contract

All inference commands POST to:

```
POST https://api.zerogpu.ai/v1/responses
Content-Type: application/json
x-api-key:    <ZEROGPU_API_KEY>
```

The request body is:
```jsonc
{
  "model":        "<model id, set per command>",
  "input":        "<text>",
  "instructions": "<optional, chat / zero_shot only>",
  "metadata":     { /* per-command extras: schema, labels, threshold, categories, mask, usecase */ }
}
```

The CLI parses the response as:
```ts
interface ResponsesApiResponse {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}
```
It picks the first `content` entry whose `type === "output_text"` (falling back to `content[0]`), then prints `text` — pretty-printed if it parses as JSON, otherwise as a raw string.

---

## 6. Version Compatibility & Update Behavior

- Minimum supported runtime version is enforced at startup. If the installed CLI is below `2.0.0`, a yellow warning is written to stderr and the command continues.
- `update-notifier` checks the npm registry every 24 hours:
  - **Patch update** → dim hint on stderr.
  - **Minor update** → standard "new features" box.
  - **Major update** → bold "BREAKING update" box.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `You're not fully signed in yet.` | Missing config + missing env var | Run `zerogpu login`, or export `ZEROGPU_API_KEY`. |
| `That doesn't look like a valid API key` | Key doesn't start with `zgpu-api-` | Copy the full key from the ZeroGPU console. |
| `Request failed with status 401` | Bad/revoked key | Re-run `zerogpu login`. |
| `Request failed with status 429` | Rate limited | Back off and retry. |
| `Response did not contain any …` | Upstream returned unexpected shape | Re-run; if persistent, file an issue with the dumped JSON. |
