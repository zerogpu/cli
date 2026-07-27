# Adding a New Command

This guide explains how to add a new CLI command to the ZeroGPU CLI.

## Layout

- `src/commands/` — one file per command, each exporting a `register<Name>Command(program)` function.
- `src/cli.ts` — wires every command into the root program.
- `src/lib/responses.ts` — shared `RESPONSES_ENDPOINT`, `ResponsesApiResponse`, and the `extractOutputText` / `extractReasoningText` helpers for `/v1/responses` calls.
- `src/lib/chatCompletions.ts` — the same for `/v1/chat/completions`, used by models the platform serves only there (currently `qwen3-30b-a3b-fp8`), plus `toResponsesUsage` to normalize token counts for savings tracking.
- `src/lib/auth.ts` — `getApiKey()` for authenticated requests.

## Steps

1. **Create the command file** at `src/commands/<commandName>.ts`.
   - Export `registerXxxCommand(program: Command): void`.
   - Define the command name, args, and `.description(...)`.
   - In `.action(...)`, validate auth, call the API, and print the result.
   - For Responses API models, import `RESPONSES_ENDPOINT` and `ResponsesApiResponse` from `../lib/responses.js` — do not hardcode the endpoint or redefine the type. Use `extractOutputText(data)` rather than reading `output[0]`: reasoning models put a `reasoning` item ahead of the assistant message.
   - For Chat Completions models, import `CHAT_COMPLETIONS_ENDPOINT` and `ChatCompletionsApiResponse` from `../lib/chatCompletions.js`, and pass `toResponsesUsage(data.usage)` to `recordAndMaybeNotify`.
   - Add the model's published input/output price to `ZGPU_PRICING` in `src/lib/savings.ts`, so savings are computed at the real rate rather than the fallback.
   - Keep only command-specific constants local (e.g. `const MODEL = "..."`).

2. **Register it** in `src/cli.ts`:
   - Add the import alongside the other `register...` imports.
   - Call `registerXxxCommand(program)` inside `buildProgram()`.

3. **Auth-gated commands** should follow this pattern:
   ```ts
   const apiKey = getApiKey();
   if (!apiKey) {
     console.error("You're not fully signed in yet. Run 'zerogpu login' ...");
     process.exit(1);
   }
   // headers:
   //   "x-api-key": apiKey.apiKey,
   ```

4. **Error handling**:
   - Wrap `fetch` in try/catch; on failure print a message and `process.exit(1)`.
   - On `!response.ok`, log the status and body, then exit 1.
   - On missing/invalid response content, log the raw payload and exit 1.

5. **Output**: try `JSON.parse` the content and pretty-print; otherwise print the raw string.

6. **Type check** before committing: `npx tsc --noEmit`.

## Reference

See `src/commands/classifyIab.ts` as the canonical minimal example.
