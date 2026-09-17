#!/usr/bin/env python3
"""Audit — and optionally repair — the ZeroGPU CLI against the live model catalog API.

The API (https://api-dashboard.zerogpu.ai/api/models) is the source of truth for every
machine-readable fact about a model: pricing, maxTokens, task, parameters.

Reports, per model:
  * MISSING — a CLI surface with no entry for the model
  * DRIFT   — a price entry that disagrees with the API (rewritten by --fix)
  * PROSE   — a docs table note or sentence stating a stale fact, with file:line
  * NOTE    — a non-chat model no task command calls (priced; callable through an endpoint command)
  * RENAME  — a CLI model id the API now serves under a longer id, plus every file to update
  * ORPHAN  — a CLI model id the API does not return, plus every file to clean

Default run is read-only. --fix rewrites drifting price entries (ZGPU_PRICING, the test's
CATALOG, ZGPU_FALLBACK) in place; notes, prose, and code are located for the caller to
edit, never machine-rewritten.

Usage:
  python3 .claude/skills/model-sync/scripts/audit-models.py
  python3 .claude/skills/model-sync/scripts/audit-models.py --fix
  python3 .claude/skills/model-sync/scripts/audit-models.py --model glm-5.2 --fix
  python3 .claude/skills/model-sync/scripts/audit-models.py --save models.json
  python3 .claude/skills/model-sync/scripts/audit-models.py --json models.json   # offline
  python3 .claude/skills/model-sync/scripts/audit-models.py --strict             # CI/loop
"""

import argparse
import json
import os
import re
import sys
import urllib.request

API_URL = "https://api-dashboard.zerogpu.ai/api/models"

# API taskDisplayName values whose models `zerogpu chat --model` accepts. Every other
# task is priced and called through the endpoint commands — see the task mapping in SKILL.md.
CHAT_TASKS = {"Text Generation"}

PRICING = "src/lib/savings.ts"
PRICING_TEST = "tests/savings.test.ts"
CHAT = "src/commands/chat.ts"
COMMANDS_DIR = "src/commands"
README = "README.md"
REFERENCE = "docs/DOCUMENTATION.md"
DOC_FILES = [README, REFERENCE, "docs/ADDING_COMMANDS.md"]


# --------------------------------------------------------------------------- helpers


def repo_root():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))
    if not os.path.exists(os.path.join(root, "package.json")):
        root = os.getcwd()
    return root


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "zerogpu-cli-audit"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


class Doc:
    """A text file, held as lines so entries can be rewritten in place."""

    def __init__(self, root, rel):
        self.rel = rel
        self.path = os.path.join(root, rel)
        self.exists = os.path.exists(self.path)
        self.lines = []
        self.dirty = False
        if self.exists:
            with open(self.path, encoding="utf-8") as f:
                self.lines = f.read().splitlines()

    def save(self):
        if self.dirty:
            with open(self.path, "w", encoding="utf-8") as f:
                f.write("\n".join(self.lines) + "\n")
            self.dirty = False


PRICE_LINE = re.compile(
    r'^(\s*)"([^"]+)":\s*\{\s*in:\s*([\d.]+),\s*out:\s*([\d.]+)\s*\}(,?.*)$'
)
FALLBACK_LINE = re.compile(
    r"^(\s*const ZGPU_FALLBACK = )\{\s*in:\s*([\d.]+),\s*out:\s*([\d.]+)\s*\}(;.*)$"
)
CHAT_LINE = re.compile(r'^\s*"([^"]+)":\s*"(responses|chat-completions)",?\s*$')
MODEL_CONST = re.compile(r'^const (?:DEFAULT_)?MODEL = "([^"]+)";')
COMMAND_NAME = re.compile(r'\.command\("([\w-]+)')


def block(doc, marker):
    """Line numbers inside the object literal that opens on the line containing marker."""
    start = next((i for i, line in enumerate(doc.lines) if marker in line), None)
    if start is None:
        return []
    out = []
    for i in range(start + 1, len(doc.lines)):
        if doc.lines[i].strip().startswith("};"):
            break
        out.append(i)
    return out


def parse_prices(doc, marker):
    """{model_id: (in, out, line)} from a `"id": { in: x, out: y }` object literal."""
    prices = {}
    for i in block(doc, marker):
        m = PRICE_LINE.match(doc.lines[i])
        if m:
            prices[m.group(2)] = (float(m.group(3)), float(m.group(4)), i)
    return prices


def parse_chat_models(doc):
    """{model_id: (route, line)} from CHAT_MODELS in src/commands/chat.ts."""
    models = {}
    for i in block(doc, "const CHAT_MODELS"):
        m = CHAT_LINE.match(doc.lines[i])
        if m:
            models[m.group(1)] = (m.group(2), i)
    return models


def parse_commands(root):
    """[(rel, command, model_id, line)] for every MODEL / DEFAULT_MODEL constant."""
    out = []
    d = os.path.join(root, COMMANDS_DIR)
    if not os.path.isdir(d):
        return out
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".ts"):
            continue
        doc = Doc(root, f"{COMMANDS_DIR}/{fn}")
        name = next((m.group(1) for m in map(COMMAND_NAME.search, doc.lines) if m), fn[:-3])
        for n, line in enumerate(doc.lines):
            m = MODEL_CONST.match(line)
            if m:
                out.append((doc.rel, name, m.group(1), n))
    return out


def model_rows(doc):
    """{model_id: (headers, cells, line)} for rows of markdown tables headed `Model`."""
    out = {}
    headers = None
    for n, line in enumerate(doc.lines):
        s = line.strip()
        if not s.startswith("|"):
            headers = None
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if set("".join(cells)) <= set("-: "):  # separator row
            continue
        if headers is None:
            headers = cells
            continue
        m = re.fullmatch(r"`([^`]+)`", cells[0])
        if headers[0] == "Model" and m:
            out[m.group(1)] = (headers, cells, n)
    return out


def num(v):
    """TypeScript-style number literal: 0.15, 0.6, 1.1, 0.004, 0."""
    return ("%f" % v).rstrip("0").rstrip(".")


def fmt_money(v):
    return f"${v:.2f}" if round(v, 2) == v else f"${v:g}"


def set_price(doc, line, new_in, new_out):
    m = PRICE_LINE.match(doc.lines[line])
    doc.lines[line] = (
        f'{m.group(1)}"{m.group(2)}": {{ in: {num(new_in)}, out: {num(new_out)} }}{m.group(5)}'
    )
    doc.dirty = True


def mentions(line, mid):
    """True when the line names this exact id — not a longer id that starts with it."""
    return re.search(r"(?<![\w.-])" + re.escape(mid) + r"(?![\w-]|\.\w)", line) is not None


def human_forms(n):
    """Ways a token count is legitimately written in prose:
    1048576 -> 1,048,576 / 1024K / 1048K / 1M;  131072 -> 131,072 / 128K / 131K."""
    forms = {f"{n:,}", str(n)}
    if n % 1_048_576 == 0:
        forms.add(f"{n // 1_048_576}M")
    elif n >= 262_144 and (n / 1_048_576) in (0.25, 0.5, 0.75):
        forms.add(f"{n / 1_048_576:g}M")
    if n % 1024 == 0:
        forms.add(f"{n // 1024}K")
    if n >= 1000:
        forms.add(f"{round(n / 1000)}K")
    if n >= 1_000_000:
        forms.add(f"{round(n / 1_000_000)}M")
    return forms


PROSE_TOKENS = re.compile(r"\b([\d,]{4,}|\d+(?:\.\d+)?[KM])[-\s](?:token|context)")
PROSE_PARAMS = re.compile(r"\b(\d+(?:\.\d+)?[BM])\s+(?:MoE|param)")


def tidy(line):
    return line.strip()[:120]


def check_prose(doc, mid, m, known_ids):
    """Stale context windows and parameter counts on lines that name this model and no
    other — so a sentence listing several models never borrows a neighbour's numbers."""
    stale = []
    max_tokens = m.get("maxTokens")
    params = str(m.get("parameters") or "").replace(" ", "").upper()
    for n, line in enumerate(doc.lines):
        if not mentions(line, mid):
            continue
        if any(o != mid and mentions(line, o) for o in known_ids):
            continue
        where = f"{doc.rel}:{n + 1}"
        for raw in PROSE_TOKENS.findall(line):
            if max_tokens and raw not in human_forms(max_tokens):
                stale.append(
                    f"{where}: says '{raw}' tokens — API maxTokens is {max_tokens:,} "
                    f"({'/'.join(sorted(human_forms(max_tokens)))}): {tidy(line)}"
                )
        for raw in PROSE_PARAMS.findall(line):
            if params and raw.upper() != params:
                stale.append(f"{where}: says '{raw}' parameters — API says {params}: {tidy(line)}")
    return stale


SEARCHABLE = (".ts", ".md")
SKIP_DIRS = {".git", ".claude", "node_modules", "dist", "coverage"}


def locations(root, mid, rename):
    """Every file that references a model id, so its rename or removal is exhaustive."""
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(filenames):
            if not fn.endswith(SEARCHABLE):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, root)
            try:
                with open(path, encoding="utf-8") as f:
                    lines = f.read().splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            count = sum(1 for line in lines if mentions(line, mid))
            if not count:
                continue
            is_command = any(
                (m := MODEL_CONST.match(line)) and m.group(1) == mid for line in lines
            )
            if rel == CHAT:
                note = (
                    "(rename the CHAT_MODELS key, its comment, and DEFAULT_MODEL if it is the default)"
                    if rename
                    else "(drop from CHAT_MODELS and its comment; pick a new DEFAULT_MODEL if it was the default)"
                )
            elif rel.startswith(COMMANDS_DIR + "/") and is_command:
                note = (
                    "(rename the command's MODEL constant)"
                    if rename
                    else "(delete the command: this file, its register call in src/cli.ts, its README and DOCUMENTATION sections)"
                )
            elif rel == PRICING:
                note = "(rename the ZGPU_PRICING entry)" if rename else "(drop the ZGPU_PRICING entry)"
            elif rel == PRICING_TEST:
                note = (
                    "(rename it in CATALOG and every model list)"
                    if rename
                    else "(drop it from CATALOG, every model list, and any comment that exempts it)"
                )
            else:
                note = (
                    "(replace every mention, including -m examples)"
                    if rename
                    else "(strip the rows, sections, examples, and mentions)"
                )
            hits.append(f"{rel} ({count} line{'s' if count != 1 else ''})  {note}")
    return hits


# --------------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="read the model list from this file instead of the API")
    ap.add_argument("--save", help="write the fetched payload here")
    ap.add_argument("--model", action="append", help="limit the report to these model ids")
    ap.add_argument("--fix", action="store_true", help="rewrite drifting price entries in place")
    ap.add_argument("--strict", action="store_true", help="exit 1 when anything is reported")
    args = ap.parse_args()

    root = repo_root()

    if args.json:
        with open(args.json, encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = fetch(API_URL)
    if args.save:
        with open(args.save, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    models = payload.get("models") or []
    if not models:
        print("ERROR: the API returned no models — do not touch the CLI.", file=sys.stderr)
        return 2

    api_ids = [m["modelId"] for m in models]
    selected = [m for m in models if not args.model or m["modelId"] in args.model]
    if args.model:
        for u in sorted(set(args.model) - set(api_ids)):
            print(f"NOTE: '{u}' is not in the API response.")

    pricing_doc = Doc(root, PRICING)
    test_doc = Doc(root, PRICING_TEST)
    chat_doc = Doc(root, CHAT)
    docs = {rel: Doc(root, rel) for rel in DOC_FILES}

    prices = parse_prices(pricing_doc, "export const ZGPU_PRICING")
    test_prices = parse_prices(test_doc, "const CATALOG")
    chat_models = parse_chat_models(chat_doc)
    commands = parse_commands(root)
    readme_rows = model_rows(docs[README])
    reference_rows = model_rows(docs[REFERENCE])

    cli_ids = (
        set(prices)
        | set(test_prices)
        | set(chat_models)
        | {c[2] for c in commands}
        | set(readme_rows)
        | set(reference_rows)
    )
    known_ids = set(api_ids) | cli_ids

    print(f"API: {len(models)} models — {', '.join(api_ids)}")
    print(f"mode: {'FIX (price entries rewritten in place)' if args.fix else 'report only'}\n")

    findings = 0
    all_fixed = []

    for m in selected:
        mid = m["modelId"]
        pricing = m.get("pricing") or {}
        task = m.get("taskDisplayName") or "?"
        api_in = pricing.get("input_per_1m_tokens")
        api_out = pricing.get("output_per_1m_tokens")
        missing, drift, prose, notes, fixed = [], [], [], [], []

        # --- pricing: ZGPU_PRICING and the test's CATALOG mirror ------------------
        for doc, table, name in (
            (pricing_doc, prices, "ZGPU_PRICING"),
            (test_doc, test_prices, "CATALOG"),
        ):
            entry = table.get(mid)
            if entry is None:
                missing.append(f"{doc.rel}: no {name} entry")
                continue
            if api_in is None or api_out is None:
                continue
            doc_in, doc_out, line = entry
            if abs(doc_in - api_in) < 1e-9 and abs(doc_out - api_out) < 1e-9:
                continue
            drift.append(
                f"{doc.rel}: {name} in/out {fmt_money(doc_in)}/{fmt_money(doc_out)} "
                f"vs {fmt_money(api_in)}/{fmt_money(api_out)} in API"
            )
            if args.fix:
                set_price(doc, line, api_in, api_out)
                fixed.append(
                    f"{doc.rel}:{line + 1}: {name} {fmt_money(doc_in)}/{fmt_money(doc_out)} "
                    f"-> {fmt_money(api_in)}/{fmt_money(api_out)}"
                )

        # --- chat --model -----------------------------------------------------
        if task in CHAT_TASKS:
            if mid not in chat_models:
                missing.append(f"{CHAT}: not accepted by `chat --model` (CHAT_MODELS)")
            for rel, rows in ((README, readme_rows), (REFERENCE, reference_rows)):
                if mid not in rows:
                    missing.append(f"{rel}: no row in the chat Models table")
        elif mid in chat_models:
            prose.append(
                f"{CHAT}:{chat_models[mid][1] + 1}: in CHAT_MODELS but the API task is "
                f"'{task}' — chat accepts Text Generation models only"
            )

        # The reference's API column must agree with the route chat.ts actually takes.
        if mid in chat_models and mid in reference_rows:
            headers, cells, line = reference_rows[mid]
            if "API" in headers:
                shown = cells[headers.index("API")]
                want = "Responses" if chat_models[mid][0] == "responses" else "Chat Completions"
                if shown != want:
                    prose.append(
                        f"{REFERENCE}:{line + 1}: API column says '{shown}' but CHAT_MODELS "
                        f"routes it to {want}"
                    )

        # --- prose: notes cells and sentences ---------------------------------
        for doc in docs.values():
            prose += check_prose(doc, mid, m, known_ids)

        # --- commands ---------------------------------------------------------
        users = [c[1] for c in commands if c[2] == mid]
        if not users and mid not in chat_models and task not in CHAT_TASKS:
            endpoint = {"Text Embedding": "embeddings", "Text Moderation": "moderations"}.get(task, "chat_completions")
            notes.append(f"no task command calls it (task '{task}') — priced; callable as `zerogpu {endpoint} -m {mid}`")

        prose = sorted(set(prose))
        if not (missing or drift or prose):
            status = "OK"
        elif args.fix and not (missing or prose):
            status = "FIXED"
        else:
            status = "NEEDS WORK"
        print(f"## {mid}  [{status}]")
        print(
            f"   task={task}  maxTokens={m.get('maxTokens')}  in=${api_in}  out=${api_out}  "
            f"params={m.get('parameters')}  commands={', '.join(users) or '-'}"
        )
        for label, items in (
            ("MISSING", missing),
            ("DRIFT", drift),
            ("FIXED", fixed),
            ("PROSE", prose),
            ("NOTE", notes),
        ):
            for i in items:
                print(f"   {label}: {i}")
        findings += len(missing) + len(drift) + len(prose)
        all_fixed += fixed
        print()

    # --- ZGPU_FALLBACK: the priciest published input and output rates -----------
    rated = [m["pricing"] for m in models if m.get("pricing")]
    max_in = max((p.get("input_per_1m_tokens") or 0) for p in rated) if rated else None
    max_out = max((p.get("output_per_1m_tokens") or 0) for p in rated) if rated else None
    fb_line = next(
        (i for i, line in enumerate(pricing_doc.lines) if FALLBACK_LINE.match(line)), None
    )
    if fb_line is None:
        print(f"NOTE: {PRICING}: no ZGPU_FALLBACK line found\n")
    elif max_in is not None and not args.model:
        fm = FALLBACK_LINE.match(pricing_doc.lines[fb_line])
        fb_in, fb_out = float(fm.group(2)), float(fm.group(3))
        if abs(fb_in - max_in) > 1e-9 or abs(fb_out - max_out) > 1e-9:
            print(
                f"DRIFT: {PRICING}:{fb_line + 1}: ZGPU_FALLBACK {fmt_money(fb_in)}/{fmt_money(fb_out)} "
                f"— the priciest API rates are {fmt_money(max_in)}/{fmt_money(max_out)}"
            )
            findings += 1
            if args.fix:
                pricing_doc.lines[fb_line] = (
                    f"{fm.group(1)}{{ in: {num(max_in)}, out: {num(max_out)} }}{fm.group(4)}"
                )
                pricing_doc.dirty = True
                all_fixed.append(f"{PRICING}:{fb_line + 1}: ZGPU_FALLBACK -> {num(max_in)}/{num(max_out)}")
                print(f"   FIXED: ZGPU_FALLBACK -> {fmt_money(max_in)}/{fmt_money(max_out)}")
            print()

    if args.fix:
        pricing_doc.save()
        test_doc.save()

    # --- in the CLI but not in the API --------------------------------------------
    if not args.model:
        for oid in sorted(cli_ids - set(api_ids)):
            successors = [a for a in api_ids if a.startswith(oid + "-") and a not in cli_ids]
            rename = len(successors) == 1
            if rename:
                print(
                    f"RENAME: {oid} -> {successors[0]} — the API serves it under the new id; "
                    f"replace it in place."
                )
            else:
                print(f"ORPHAN: {oid} is in the CLI but the API does not return it — remove it.")
            for loc in locations(root, oid, rename):
                print(f"   {'REPLACE' if rename else 'REMOVE'}: {loc}")
            findings += 1

    print(f"\n{findings} finding(s){f'; {len(all_fixed)} entr(ies) rewritten' if args.fix else ''}.")
    if args.fix:
        print(
            "Price entries are the only thing --fix rewrites. Notes cells, prose, CHAT_MODELS, "
            "and command constants must be edited by hand — see the lines above."
        )
    return 1 if (args.strict and findings) else 0


if __name__ == "__main__":
    sys.exit(main())
