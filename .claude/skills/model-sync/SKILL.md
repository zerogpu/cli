---
name: model-sync
description: Reconcile the ZeroGPU CLI with the live model catalog API (https://api-dashboard.zerogpu.ai/api/models), which is the sole source of truth — add models the CLI is missing, correct every value that disagrees with it, and remove models it no longer returns, across `src/lib/savings.ts` (`ZGPU_PRICING`, `ZGPU_FALLBACK`), `tests/savings.test.ts`, the `chat --model` list in `src/commands/chat.ts`, every command's model constant, `README.md`, and `docs/DOCUMENTATION.md` / `docs/ADDING_COMMANDS.md` — then bump the version, cut a branch from `main`, commit, and open a PR automatically. Runs unattended — it never asks questions. Use this skill whenever the user asks to "check for new models", "which models is the CLI missing", "sync the model catalog", "fetch models from the dashboard API and compare", "add the new model to the CLI", "fix the pricing/context windows", or schedules a routine to keep the CLI's model set matched to what the API serves.
---

# Model sync

`https://api-dashboard.zerogpu.ai/api/models` **is the sole source of truth.** Its response defines which models exist and every machine-readable fact about them — task, context window, pricing, parameter count. Where the CLI disagrees, the CLI is wrong and this skill corrects it: price entries, the savings fallback, the `chat --model` list, command model constants, docs tables, prose, and the tests that pin them.

**This skill runs unattended.** It asks nothing and waits for nothing. Every decision below is a rule with a determined answer, so a scheduled run and an interactive run do the same thing. When a rule leaves genuine slack — the wording of a new notes cell, where in a table to insert a row — pick the option most consistent with the surrounding file and note the choice in the final summary. Never end a run with an open question, a "should I…", or work deferred for a human.

Work the three loops in order: **[correct](#1-correct-what-disagrees)**, **[add](#2-add-what-is-missing)**, **[remove](#3-remove-what-is-gone)**. Then [verify](#4-verify), and [bump, branch, and open a PR against `main`](#5-bump-branch-and-open-the-pr) — every run that changes a file ends in a PR, without being asked.

## Step 0 — audit

```bash
python3 .claude/skills/model-sync/scripts/audit-models.py
```

| Label | Meaning | Handled by |
| --- | --- | --- |
| `DRIFT` | a **price entry** — `ZGPU_PRICING`, the test's `CATALOG`, or `ZGPU_FALLBACK` — disagrees with the API | `--fix` |
| `PROSE` | a notes cell or sentence states a stale number, or the reference's API column disagrees with `CHAT_MODELS`, with `file:line` | you, by hand — [loop 1](#1-correct-what-disagrees) |
| `MISSING` | a CLI surface has no entry for a model the API returns | you — [loop 2](#2-add-what-is-missing) |
| `RENAME` | a CLI model id the API now serves under a longer id, plus every file to update | you — [renames](#renames) |
| `ORPHAN` | a CLI model id the API does not return, plus every file to clean | you — [loop 3](#3-remove-what-is-gone) |
| `NOTE` | a model no command calls (priced only) | nothing — the [task mapping](#task-mapping) says that is correct; list them in the summary |

Flags: `--fix` (rewrite drifting price entries), `--model <id>` (one model, repeatable), `--save` / `--json` (snapshot then re-run offline), `--strict` (exit 1 when anything is reported).

**Abort conditions.** If the fetch fails, times out, or returns zero models, change nothing, say the sync did not run, and stop. A partial or empty payload must never be treated as "the API removed everything". This is the one case where the skill does less than a full sync — it is a failure to report, not a question to ask.

Fields the script does not print:

```bash
curl -s https://api-dashboard.zerogpu.ai/api/models | python3 -m json.tool
```

## 1. Correct what disagrees

```bash
python3 .claude/skills/model-sync/scripts/audit-models.py --fix
```

Rewrites every drifting price — `ZGPU_PRICING` in `src/lib/savings.ts`, its `CATALOG` mirror in `tests/savings.test.ts`, and `ZGPU_FALLBACK`. Nothing else: a price entry is unambiguous, a sentence is not.

Then work each `PROSE` line by hand. Each names the file, the line, and both values.

- **Chat notes cells** in the `chat` Models table of `README.md` and `docs/DOCUMENTATION.md`: `131K context`, `753B MoE`, `1,048,576-token context`. The audit accepts every correct form of a token count (`131,072`, `128K`, `131K`) and flags only wrong ones. When a whole clause stops being true — "for whole repos and very long documents", "The platform's most capable model, and its priciest" — rewrite the clause rather than swapping digits, keeping the cell's voice and length.
- **The API column** in `docs/DOCUMENTATION.md` must match the model's route in `CHAT_MODELS` (`responses` → `Responses`, `chat-completions` → `Chat Completions`). Fix the column, never the route — see [Endpoint support](#endpoint-support).
- **The fallback.** When `--fix` moves `ZGPU_FALLBACK`, update the comment above it that names the priciest model, and the `falls back to a default ZeroGPU rate` test in `tests/savings.test.ts` that compares against that model. If no single model holds both the highest input and the highest output rate, delete that equality test — the `never overstates savings` test beside it still guards the fallback.

The parser only reads table rows and lines that name exactly one model. Numbers are also copied into example comments and sentences that name the model on another line — `# A 1M-token context, for whole repos and very long documents` sits above `-m glm-5.2` in `README.md` — so sweep for every value you changed:

```bash
grep -rn "1,048,576\|1M\|131K" README.md docs src tests
```

## 2. Add what is missing

A model in the API but absent from the CLI needs every surface its [task](#task-mapping) calls for. A half-added model fails the pricing tests, so finish all of them in one run.

### 2.1 Pricing — every model

Add one line to `ZGPU_PRICING` in `src/lib/savings.ts`:

```ts
  "<modelId>": { in: <input_per_1m_tokens>, out: <output_per_1m_tokens> },
```

Numbers are plain decimals with no trailing zeros (`0.15`, `0.6`, `0.004`, `0`). Insert next to models of the same task; embedding models go under the `out: 0` comment. Add the identical line to `CATALOG` in `tests/savings.test.ts` — the test fails unless both tables hold exactly the same keys and rates. Then re-run `--fix` so `ZGPU_FALLBACK` picks up a new maximum.

### 2.2 `chat --model` — Text Generation models only

1. **`src/commands/chat.ts`** — add `"<modelId>": "<route>"` to `CHAT_MODELS`, at the end of the entries with the same route, per [Endpoint support](#endpoint-support). A `chat-completions` model also joins the list in the comment above `CHAT_MODELS`.
2. **`README.md`** — a row in the `chat` Models table:
   ```md
   | `<modelId>` | <parameters>, <context> context, <use cases>. |
   ```
   Built from API facts only, in the style of the rows beside it: `parameters`, `maxTokens` in the short form the table already uses (`131K`), and `pricing.use_cases` lowercased and joined the way neighbours join them (`reasoning + function calling`). A `chat-completions` model also joins the sentence under the table that lists the models the CLI routes to Chat Completions.
3. **`docs/DOCUMENTATION.md`** — the same row with the API column (`| \`<modelId>\` | Responses | … |`); the id added to the "Reasoning and tool-use chat" bullet in §1; and for a `chat-completions` model, the paragraph under the table and the §5 exceptions sentence (`chat --model <id>`).
4. **`docs/ADDING_COMMANDS.md`** — a `chat-completions` model joins the "currently …" list of Chat-Completions-only models.

Do not add a `-m` example to the `chat` code blocks; those are curated.

#### Endpoint support

The payload does **not** say which endpoint a model is routable on, and a null `sample_responses_body` is not evidence either way — `glm-5.2` and `llama-3.1-8b-instruct-fast` both carry none. So:

- For a model already in the CLI, its existing route — its `CHAT_MODELS` value, or the endpoint its command posts to — is authoritative. Never change a route because a sample body is present or absent.
- For a **new** chat model, route it `responses` when `sample_responses_body` exists and `chat-completions` when it does not — then say so in the summary, since the route can be widened later once a Responses sample or an explicit confirmation exists.

### 2.3 Every other task — pricing only

A model whose task is not `Text Generation` gets [2.1](#21-pricing--every-model) and nothing more. The sync never creates a command: a command's name, flags, and request shape are product decisions, not catalog facts. List each such model in the summary as served by the API with no CLI command.

### 2.4 Re-audit that model

`--model <new-id>` must come back with no `MISSING` and no `DRIFT`.

## Renames

A CLI id that an API id extends — `deepseek-v4-flash` in the CLI, `deepseek-v4-flash-0731` in the API — is the same model under a new id, provided exactly one API id extends it. The audit prints it as `RENAME` with every file under `REPLACE:`. Replace the old id with the new one in place: the pricing entry and its test (at the API's rates), the `CHAT_MODELS` key or command constant, table rows, `-m` examples, and prose — keeping positions and wording, then correct whatever values drifted with it. Do not keep the old id as an alias. A rename is not a removal plus an addition, and it counts as an addition for the [version bump](#5-bump-branch-and-open-the-pr).

## 3. Remove what is gone

A model the API does not return is removed from the CLI, in full, without asking. The audit prints every file that mentions it under `REMOVE:`; work that list to completion:

1. **Pricing** — drop it from `ZGPU_PRICING` and `CATALOG`, from the `never overstates savings` model list, and delete any comment above `CATALOG` that exempts it. Re-run `--fix` for the fallback.
2. **`chat --model`** — drop it from `CHAT_MODELS` and the comment above it; delete its rows in both Models tables and every `-m <id>` example; fix the sentences and lists that name it (`README.md` routing sentence, `docs/DOCUMENTATION.md` §1 bullet, routing paragraph, and §5, `docs/ADDING_COMMANDS.md`). If it was `DEFAULT_MODEL`, the new default is the remaining Text Generation model with the lowest input price, ties broken by the highest `displayPriority`; update every "Defaults to" and "Default." mention.
3. **A command whose model is gone** — delete `src/commands/<name>.ts` and its import and `register…Command(program)` call in `src/cli.ts`. In `README.md`, delete its Table of Contents entry and its `####` section. In `docs/DOCUMENTATION.md`, delete its row in the §4 command table and its `###` section, then renumber the sections after it and every `#4NN-…` anchor that points at them.
4. **Tests and comments** — a test that uses the id as sample data (`recordAndMaybeNotify({ model: … })`, `computeCallSavings(…, "<id>")`) gets a surviving model with the same rates, so its assertions still hold. Any other comment naming it is rewritten or deleted.
5. **Cascade.** When a removal leaves a list, sentence, or table naming no models — the Chat Completions routing sentence, the §5 exceptions — delete it rather than leaving it empty.

There is no exemption list. A model the API does not return is not a ZeroGPU model, and the CLI stops calling it — including `zlm-v1-followup-questions-edge`, whose exemption comment in `tests/savings.test.ts` predates this skill.

## API payload reference

| Field | Use in the CLI |
| --- | --- |
| `modelId` | The literal `model` value everywhere — map keys, constants, `-m` examples, backticked cells. Case-sensitive (`LFM2.5-1.2B-Instruct`, `glm-5.2`); `chat` matches it case-insensitively only for the person typing. |
| `taskDisplayName` | Picks the surfaces via the mapping below. |
| `maxTokens` | Every context claim in a notes cell or sentence. |
| `pricing.input_per_1m_tokens` / `output_per_1m_tokens` | `ZGPU_PRICING`, `CATALOG`, and `ZGPU_FALLBACK` (the highest of each across the payload). |
| `parameters` | The parameter count in a notes cell (`753B`). |
| `pricing.use_cases` | The capabilities in a **new** notes cell (`reasoning + function calling`). |
| `pricing.description` | Raw marketing copy. A source for a **new** notes cell's claims — never grounds for rewording an existing one. |
| `pricing.sample_responses_body` / `sample_chat_completions_body` | The route of a **new** chat model, nothing more (see [Endpoint support](#endpoint-support)). |
| `displayPriority` | The dashboard's descending order — the tie-break for a new default model, nothing more. |

### Task mapping

| `taskDisplayName` | CLI surfaces |
| --- | --- |
| `Text Generation` | pricing, `chat --model`, the `chat` Models tables and routing sentences |
| every other task — `Summarization`, `Text Classification`, `Text Moderation`, `PII`, `Text Embedding`, and any new one | pricing only; a command calls it only when its `MODEL` constant already names it |

The endpoint commands — `responses`, `chat_completions`, `moderations`, `embeddings` — take the model from `-m` and hold no model list. That is deliberate: it is what keeps the agent plugins working across model changes without a CLI release. Never add a model list, route, or validation to them, and never delete them in [loop 3](#3-remove-what-is-gone); they have no model to lose. Model ids in their doc examples follow the normal rename and removal rules.

## Never invent

API-sourced facts only: id, task, `maxTokens`, input/output price, parameter count, use cases. Architecture details (`MoE`, `13B active`), language counts, and provider comparisons may be carried over from an existing notes cell while still true, or taken from `pricing.description` — never generated. Comparisons that follow from the payload's own prices ("its priciest") are allowed. Never invent a command, a flag, an example output, or a route.

## 4. Verify

Verification gates the PR: nothing is pushed until all of it passes.

```bash
python3 .claude/skills/model-sync/scripts/audit-models.py --strict   # expect: only NOTE lines
npm ci
npm run lint
npm run build
npm test
node dist/index.js chat --help   # --model lists exactly the API's Text Generation ids
node dist/index.js --help        # no command whose model was removed
```

Also confirm every renamed or removed id is gone:

```bash
grep -rn "<old-id>" . --include="*.ts" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.claude
```

If a check fails, fix the cause and re-run it. If it still fails, commit nothing, open no PR, and report the failure with the command output — a broken release is worse than a stale number. CI runs the same lint, build, and test on the PR.

## 5. Bump, branch, and open the PR

Once verification passes, ship it. No questions, no waiting.

**Nothing changed?** If the audit was already clean and no file was modified, bump nothing, create no branch and no PR. Report "already in sync" and stop.

```bash
# 1. a fresh branch cut from up-to-date main — never commit on main
git fetch origin
BRANCH="model-sync/$(date -u +%Y-%m-%d-%H%M)"
git switch --create "$BRANCH" origin/main
```

Cutting from `origin/main` makes the branch unique per run and independent of whatever was checked out. If edits were made on another branch, carry them over (`git stash` before the switch, `git stash pop` after) and re-run the [verify](#4-verify) commands.

```bash
# 2. bump the version — merging to main publishes it to npm (RELEASING.md)
npm run bump:minor   # the run added a model to `chat --model`, by addition or rename
npm run bump         # everything else: prices, notes, removals
```

Exactly one bump per run. Removals are a patch: a model the API no longer serves already fails at request time, so dropping it changes an error, not working behaviour. Both scripts rewrite `package.json` and `package-lock.json` and nothing else; commit both.

```bash
# 3. stage only what the sync touched — never `git add -A`
git add src/lib/savings.ts tests/savings.test.ts src/commands/... src/cli.ts \
        README.md docs/DOCUMENTATION.md docs/ADDING_COMMANDS.md package.json package-lock.json
git status --short          # confirm nothing unrelated is staged
```

A repo that was dirty before the run stays dirty: unrelated work is not the sync's to commit. Deleted files are staged the same way — `git rm <path>`, or `git add` on the deleted path — so the removal lands in the commit rather than being left behind.

```bash
# 4. commit
git commit -m "$(cat <<'EOF'
chore: sync models with dashboard API

<one line per change, e.g.:>
- all-minilm-l6-v2: input $0.5 -> $0.004 (ZGPU_PRICING, test CATALOG)
- glm-5.2: notes 1M context -> 262K context (README, DOCUMENTATION)
- rename deepseek-v4-flash -> deepseek-v4-flash-0731: pricing, CHAT_MODELS, docs, examples
- add <model>: pricing, chat --model, README + DOCUMENTATION rows
- remove <model>: pricing, docs; command <name> deleted
- version 3.7.2 -> 3.8.0

Source: https://api-dashboard.zerogpu.ai/api/models

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"

# 5. push and open the PR against main
git push -u origin "$BRANCH"
gh pr create --base main --head "$BRANCH" \
  --title "chore: sync models with dashboard API" \
  --body "$(cat <<'EOF'
Automated model-catalog sync. The dashboard API is the source of truth; every value below was taken from it. Merging publishes vX.Y.Z to npm.

## Corrected
| Model | Field | Was | Now |
| --- | --- | --- | --- |

## Renamed
## Added
## Removed
<model — pricing and docs dropped; command deleted>

## Verification
- `audit-models.py --strict` — clean apart from NOTE lines
- `npm run lint`, `npm run build`, `npm test` pass
- `zerogpu chat --help` lists exactly the API's Text Generation models

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Rules for this step:

- **Never** commit to `main`, force-push, merge the PR, or delete a branch. Opening it is the whole job; review is someone else's.
- Fill both templates with the run's actual changes. An empty section is deleted, not left as a heading.
- Each run gets its own timestamped branch. Check for an earlier sync PR still open, and if there is one, say "supersedes #N" in the new PR's body and leave the old one alone:
  ```bash
  gh pr list --state open --json number,headRefName \
    --jq '.[] | select(.headRefName | startswith("model-sync/")) | "#\(.number) \(.headRefName)"'
  ```
- If the push or `gh pr create` fails — no auth, no network, protected branch — the commit still stands on the branch. Report the exact error and the branch name so it can be pushed later. Do not retry in a loop, and do not fall back to committing on `main`.

## 6. Report

One pass, no questions: prices corrected, notes and prose rewritten, models renamed, added, and removed, commands deleted, the version bump and why, models priced with no command, any notes claim that could not be sourced, and the PR URL (or the branch name and the exact error if the PR could not be opened).
