# Adding a New Command

This guide explains how to add a new CLI command to the ZeroGPU CLI.

## Layout

- `src/commands/` — one file per command, each exporting a `register<Name>Command(program)` function.
- `src/cli.ts` — wires every command into the root program.
- `src/lib/responses.ts` — shared `RESPONSES_ENDPOINT` and `ResponsesApiResponse` for `/v1/responses` calls.
- `src/lib/auth.ts` — `getApiKey()` / `getProjectId()` for authenticated requests.

## Steps

1. **Create the command file** at `src/commands/<commandName>.ts`.
   - Export `registerXxxCommand(program: Command): void`.
   - Define the command name, args, and `.description(...)`.
   - In `.action(...)`, validate auth, call the API, and print the result.
   - For Responses API models, import `RESPONSES_ENDPOINT` and `ResponsesApiResponse` from `../lib/responses.js` — do not hardcode the endpoint or redefine the type.
   - Keep only command-specific constants local (e.g. `const MODEL = "..."`).

2. **Register it** in `src/cli.ts`:
   - Add the import alongside the other `register...` imports.
   - Call `registerXxxCommand(program)` inside `buildProgram()`.

3. **Auth-gated commands** should follow this pattern. Only the API key is
   required; the project is derived from it. Send `x-project-id` only when a
   project ID is configured:
   ```ts
   const apiKey = getApiKey();
   const projectId = getProjectId(); // optional
   if (!apiKey) {
     console.error("You're not fully signed in yet. Run 'zerogpu login' ...");
     process.exit(1);
   }
   // headers:
   //   "x-api-key": apiKey.apiKey,
   //   ...(projectId ? { "x-project-id": projectId.projectId } : {}),
   ```

4. **Error handling**:
   - Wrap `fetch` in try/catch; on failure print a message and `process.exit(1)`.
   - On `!response.ok`, log the status and body, then exit 1.
   - On missing/invalid response content, log the raw payload and exit 1.

5. **Output**: try `JSON.parse` the content and pretty-print; otherwise print the raw string.

6. **Type check** before committing: `npx tsc --noEmit`.

## Reference

See `src/commands/classifyIab.ts` as the canonical minimal example.
