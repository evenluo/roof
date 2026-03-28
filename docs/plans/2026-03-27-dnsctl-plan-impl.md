# dnsctl Plan Command Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `plan` subcommand that loads a YAML declaration file, queries remote DNS state, and outputs a grouped create/update/delete diff per zone.

**Architecture:** Three new modules (declaration loading, diff computation, plan output formatting) plus CLI extension and a plan command orchestrator. Reuses existing provider inspect functions and NormalizedRecord model. `plan` reads zone config from YAML; `inspect` keeps its hardcoded config—they run independently.

**Tech Stack:** TypeScript, Bun, js-yaml, bun:test

**Design doc:** `docs/plans/2026-03-27-dnsctl-plan-design.md`

---

## File Structure

**New files:**

| File | Responsibility |
|------|---------------|
| `src/types.ts` | (modify) Add `Provider`, `SUPPORTED_RECORD_TYPES`, diff-related types |
| `src/config.ts` | (modify) Export `loadRuntimeConfig`, import `Provider` from types |
| `src/cli.ts` | (modify) Add `plan` command parsing with `--file`, `--zone`, `--json` |
| `src/cli.test.ts` | (modify) Add plan CLI tests |
| `src/index.ts` | (modify) Wire `plan` command in `main()`, update `runInspectCommand` signature |
| `src/declaration.ts` | (create) Load + validate YAML declaration file |
| `src/declaration.test.ts` | (create) Declaration validation tests |
| `src/diff.ts` | (create) Diff calculation between declared and remote records |
| `src/diff.test.ts` | (create) Diff computation tests |
| `src/plan-output.ts` | (create) Format plan results as text and JSON |
| `src/plan-output.test.ts` | (create) Plan output formatting tests |
| `src/plan.ts` | (create) Plan command orchestrator |
| `src/plan.test.ts` | (create) Plan command integration tests |

---

### Task 1: Add shared types and refactor config loading

**Files:**
- Modify: `tools/dnsctl/src/types.ts`
- Modify: `tools/dnsctl/src/config.ts`
- Modify: `tools/dnsctl/src/index.ts`

- [ ] **Step 1: Add shared types to types.ts**

Append to the end of `src/types.ts`:

```typescript
export const SUPPORTED_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
] as const;
export type SupportedRecordType = (typeof SUPPORTED_RECORD_TYPES)[number];

export type Provider = "cloudflare" | "tencent";

export interface FieldChange {
  from: string | number | boolean;
  to: string | number | boolean;
}

export interface RecordUpdate {
  name: string;
  type: string;
  changes: Record<string, FieldChange>;
}

export interface ZonePlanResult {
  provider: Provider;
  creates: NormalizedRecord[];
  updates: RecordUpdate[];
  deletes: NormalizedRecord[];
}

export interface ZonePlanError {
  provider: Provider;
  error: string;
}

export interface PlanResult {
  file: string;
  generatedAt: string;
  zones: Record<string, ZonePlanResult | ZonePlanError>;
}
```

- [ ] **Step 2: Update config.ts to use shared Provider type and export loadRuntimeConfig**

Replace the local `type Provider` in `src/config.ts` with an import from `types.ts`. Add `loadRuntimeConfig` export:

```typescript
import { config as loadDotenv } from "dotenv";

import type { Provider } from "./types";

export const SUPPORTED_ZONES = ["ihongben.com", "maxtap.net"] as const;

type SupportedZone = (typeof SUPPORTED_ZONES)[number];

export interface AppConfig {
  credentials: {
    cloudflare: {
      apiToken: string;
    };
    tencent: {
      secretId: string;
      secretKey: string;
    };
  };
  zones: Record<SupportedZone, { provider: Provider }>;
}

function requireEnv(
  env: Partial<Record<string, string>>,
  key: string,
): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function loadConfig(
  env: Partial<Record<string, string>>,
): AppConfig {
  return {
    credentials: {
      cloudflare: {
        apiToken: requireEnv(env, "CLOUDFLARE_API_TOKEN"),
      },
      tencent: {
        secretId: requireEnv(env, "Q_DNS_RECORD_SECRET_ID"),
        secretKey: requireEnv(env, "Q_DNS_RECORD_SECRET_KEY"),
      },
    },
    zones: {
      "ihongben.com": { provider: "tencent" },
      "maxtap.net": { provider: "cloudflare" },
    },
  };
}

export function loadRuntimeConfig(): AppConfig {
  loadDotenv({ path: ".env.local", quiet: true });
  return loadConfig(process.env);
}
```

- [ ] **Step 3: Update index.ts to use exported loadRuntimeConfig**

Replace the local `loadRuntimeConfig` in `src/index.ts` with the import from `config.ts`. Remove the `dotenv` import since config.ts now handles it:

```typescript
import { parseCliArgs } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import { formatInspectOutput } from "./output";
import { inspectCloudflareZone } from "./providers/cloudflare";
import { inspectTencentZone } from "./providers/tencent";
import type { FetchLike, NormalizedRecord } from "./types";

interface InspectDependencies {
  config: AppConfig;
  now: () => string;
  inspectCloudflareZone: (options: {
    apiToken: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<NormalizedRecord[]>;
  inspectTencentZone: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<NormalizedRecord[]>;
}

function defaultNow(): string {
  return new Date().toISOString();
}

export async function runInspectCommand(
  cliArgs: { command: "inspect"; format: "yaml" | "json"; zone?: string },
  deps?: Partial<InspectDependencies>,
): Promise<string> {
  const config = deps?.config ?? loadRuntimeConfig();
  const now = deps?.now ?? defaultNow;
  const inspectCloudflare =
    deps?.inspectCloudflareZone ?? inspectCloudflareZone;
  const inspectTencent = deps?.inspectTencentZone ?? inspectTencentZone;

  const zoneNames = cliArgs.zone
    ? [cliArgs.zone]
    : Object.keys(config.zones);

  const output = {
    generatedAt: now(),
    zones: {} as Record<
      string,
      {
        provider: "cloudflare" | "tencent";
        records: NormalizedRecord[];
      }
    >,
  };

  for (const zoneName of zoneNames) {
    const zone = config.zones[zoneName as keyof AppConfig["zones"]];
    try {
      if (zone.provider === "cloudflare") {
        output.zones[zoneName] = {
          provider: zone.provider,
          records: await inspectCloudflare({
            apiToken: config.credentials.cloudflare.apiToken,
            zoneName,
          }),
        };
      } else {
        output.zones[zoneName] = {
          provider: zone.provider,
          records: await inspectTencent({
            secretId: config.credentials.tencent.secretId,
            secretKey: config.credentials.tencent.secretKey,
            zoneName,
          }),
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to inspect zone "${zoneName}" from provider "${zone.provider}": ${message}`,
      );
    }
  }

  return formatInspectOutput(output, cliArgs.format);
}

async function main(argv: string[]): Promise<void> {
  const cliArgs = parseCliArgs(argv);
  const output = await runInspectCommand(cliArgs);
  console.log(output);
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
```

Note: `main()` will be updated in Task 6 to handle the `plan` command. For now it continues to only support `inspect`.

- [ ] **Step 4: Run existing tests and typecheck**

Run: `cd tools/dnsctl && bun test && bun run typecheck`

Expected: All existing tests pass, no type errors. This verifies the refactoring is safe.

- [ ] **Step 5: Commit**

```bash
cd tools/dnsctl && git add src/types.ts src/config.ts src/index.ts
git commit -m "$(cat <<'EOF'
refactor: extract shared types and loadRuntimeConfig for plan command

Move Provider type to types.ts, add SUPPORTED_RECORD_TYPES and
diff-related types. Export loadRuntimeConfig from config.ts so
both inspect and plan commands can reuse it.
EOF
)"
```

---

### Task 2: Extend CLI for plan command

**Files:**
- Modify: `tools/dnsctl/src/cli.ts`
- Modify: `tools/dnsctl/src/cli.test.ts`

- [ ] **Step 1: Write failing tests for plan CLI parsing**

Append to `src/cli.test.ts`:

```typescript
describe("parseCliArgs plan", () => {
  test("uses text output and default file by default", () => {
    expect(parseCliArgs(["plan"])).toEqual({
      command: "plan",
      format: "text",
      file: "dns/dns.yaml",
    });
  });

  test("switches to json output with --json", () => {
    expect(parseCliArgs(["plan", "--json"])).toEqual({
      command: "plan",
      format: "json",
      file: "dns/dns.yaml",
    });
  });

  test("overrides file path with --file", () => {
    expect(parseCliArgs(["plan", "--file", "custom.yaml"])).toEqual({
      command: "plan",
      format: "text",
      file: "custom.yaml",
    });
  });

  test("accepts --zone for single zone plan", () => {
    expect(parseCliArgs(["plan", "--zone", "maxtap.net"])).toEqual({
      command: "plan",
      format: "text",
      file: "dns/dns.yaml",
      zone: "maxtap.net",
    });
  });

  test("rejects missing value for --file", () => {
    expect(() => parseCliArgs(["plan", "--file"])).toThrow(
      "Missing value for --file",
    );
  });

  test("rejects missing value for --zone", () => {
    expect(() => parseCliArgs(["plan", "--zone"])).toThrow(
      "Missing value for --zone",
    );
  });

  test("rejects unknown flags", () => {
    expect(() => parseCliArgs(["plan", "--yaml"])).toThrow(
      "Unknown argument: --yaml",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools/dnsctl && bun test src/cli.test.ts`

Expected: FAIL — `Unknown command: plan`

- [ ] **Step 3: Implement plan command parsing**

Replace `src/cli.ts` with:

```typescript
import { SUPPORTED_ZONES } from "./config";

export interface InspectCliArgs {
  command: "inspect";
  format: "yaml" | "json";
  zone?: string;
}

export interface PlanCliArgs {
  command: "plan";
  format: "text" | "json";
  file: string;
  zone?: string;
}

export type CliArgs = InspectCliArgs | PlanCliArgs;

function ensureSupportedZone(zone: string): string {
  if (!SUPPORTED_ZONES.includes(zone as (typeof SUPPORTED_ZONES)[number])) {
    throw new Error(`Unsupported zone: ${zone}`);
  }

  return zone;
}

function parseInspectArgs(rest: string[]): InspectCliArgs {
  const parsed: InspectCliArgs = {
    command: "inspect",
    format: "yaml",
  };

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];

    if (current === "--json") {
      parsed.format = "json";
      continue;
    }

    if (current === "--zone") {
      const zone = rest[index + 1];
      if (!zone) {
        throw new Error("Missing value for --zone");
      }

      parsed.zone = ensureSupportedZone(zone);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

function parsePlanArgs(rest: string[]): PlanCliArgs {
  const parsed: PlanCliArgs = {
    command: "plan",
    format: "text",
    file: "dns/dns.yaml",
  };

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];

    if (current === "--json") {
      parsed.format = "json";
      continue;
    }

    if (current === "--zone") {
      const zone = rest[index + 1];
      if (!zone) {
        throw new Error("Missing value for --zone");
      }

      parsed.zone = zone;
      index += 1;
      continue;
    }

    if (current === "--file") {
      const file = rest[index + 1];
      if (!file) {
        throw new Error("Missing value for --file");
      }

      parsed.file = file;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;

  if (command === "inspect") {
    return parseInspectArgs(rest);
  }

  if (command === "plan") {
    return parsePlanArgs(rest);
  }

  throw new Error(`Unknown command: ${command ?? "(empty)"}`);
}
```

Key design notes:
- `plan --zone` does NOT validate against `SUPPORTED_ZONES` (validation happens against the declaration file later)
- `inspect --zone` continues to validate against `SUPPORTED_ZONES` (existing behavior preserved)
- Discriminated union `CliArgs = InspectCliArgs | PlanCliArgs` via `command` field

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/dnsctl && bun test src/cli.test.ts`

Expected: All tests PASS (both existing inspect tests and new plan tests).

- [ ] **Step 5: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS. The `runInspectCommand` in `index.ts` uses an inline type for `cliArgs` that is compatible with `InspectCliArgs`. Existing `index.test.ts` passes object literals that match `InspectCliArgs`.

- [ ] **Step 6: Commit**

```bash
cd tools/dnsctl && git add src/cli.ts src/cli.test.ts
git commit -m "$(cat <<'EOF'
feat: add plan command CLI parsing

Support plan subcommand with --file, --zone, --json flags.
Plan uses text output by default and reads dns/dns.yaml.
Zone validation deferred to declaration file loading.
EOF
)"
```

---

### Task 3: Declaration loading and validation

**Files:**
- Create: `tools/dnsctl/src/declaration.ts`
- Create: `tools/dnsctl/src/declaration.test.ts`

- [ ] **Step 1: Write failing test for valid declaration parsing**

Create `src/declaration.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import { parseDeclaration } from "./declaration";

describe("parseDeclaration", () => {
  test("parses valid declaration with both providers", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
  maxtap.net:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: auto
        proxied: true
`;

    const result = parseDeclaration(yaml);

    expect(result).toEqual({
      zones: {
        "ihongben.com": {
          provider: "tencent",
          records: [
            { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
          ],
        },
        "maxtap.net": {
          provider: "cloudflare",
          records: [
            { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
          ],
        },
      },
    });
  });

  test("defaults proxied to false for cloudflare zones", () => {
    const yaml = `
zones:
  maxtap.net:
    provider: cloudflare
    records:
      - name: www
        type: A
        value: "1.1.1.1"
        ttl: 300
`;

    const result = parseDeclaration(yaml);

    expect(result.zones["maxtap.net"].records[0].proxied).toBe(false);
  });

  test("does not add proxied for tencent zones", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
`;

    const result = parseDeclaration(yaml);

    expect(result.zones["ihongben.com"].records[0].proxied).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/dnsctl && bun test src/declaration.test.ts`

Expected: FAIL — module `./declaration` not found

- [ ] **Step 3: Implement parseDeclaration with full validation**

Create `src/declaration.ts`:

```typescript
import { load as loadYaml } from "js-yaml";
import { readFileSync } from "node:fs";

import type { DnsTtl, NormalizedRecord, Provider } from "./types";
import { SUPPORTED_RECORD_TYPES, type SupportedRecordType } from "./types";

export interface DeclaredZone {
  provider: Provider;
  records: NormalizedRecord[];
}

export interface Declaration {
  zones: Record<string, DeclaredZone>;
}

function validateRecord(
  zoneName: string,
  provider: Provider,
  raw: unknown,
): NormalizedRecord {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Zone "${zoneName}": each record must be an object`);
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.name !== "string") {
    throw new Error(`Zone "${zoneName}": record name must be a string`);
  }

  if (
    typeof r.type !== "string" ||
    !SUPPORTED_RECORD_TYPES.includes(r.type as SupportedRecordType)
  ) {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} has unsupported type "${r.type}". Supported: ${SUPPORTED_RECORD_TYPES.join(", ")}`,
    );
  }

  if (typeof r.value !== "string") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} value must be a string`,
    );
  }

  if (r.ttl !== "auto" && typeof r.ttl !== "number") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} ttl must be a number or "auto"`,
    );
  }

  if (r.ttl === "auto" && provider !== "cloudflare") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} ttl "auto" is only allowed for Cloudflare zones`,
    );
  }

  if (r.proxied !== undefined && provider !== "cloudflare") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} "proxied" is only allowed for Cloudflare zones`,
    );
  }

  if (r.proxied !== undefined && typeof r.proxied !== "boolean") {
    throw new Error(
      `Zone "${zoneName}": record ${r.name} ${r.type} proxied must be a boolean`,
    );
  }

  const record: NormalizedRecord = {
    name: r.name,
    type: r.type,
    value: r.value,
    ttl: r.ttl as DnsTtl,
  };

  if (provider === "cloudflare") {
    record.proxied = typeof r.proxied === "boolean" ? r.proxied : false;
  }

  return record;
}

function validateZone(zoneName: string, raw: unknown): DeclaredZone {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Zone "${zoneName}": must be an object`);
  }

  const zone = raw as Record<string, unknown>;

  if (
    typeof zone.provider !== "string" ||
    !["cloudflare", "tencent"].includes(zone.provider)
  ) {
    throw new Error(
      `Zone "${zoneName}": provider must be "cloudflare" or "tencent"`,
    );
  }

  const provider = zone.provider as Provider;

  if (!Array.isArray(zone.records)) {
    throw new Error(`Zone "${zoneName}": records must be an array`);
  }

  const seen = new Set<string>();
  const records: NormalizedRecord[] = [];

  for (const recordRaw of zone.records) {
    const record = validateRecord(zoneName, provider, recordRaw);
    const key = `${record.name}:${record.type}`;

    if (seen.has(key)) {
      throw new Error(
        `Zone "${zoneName}": duplicate record ${record.name} ${record.type}`,
      );
    }

    seen.add(key);
    records.push(record);
  }

  return { provider, records };
}

export function parseDeclaration(content: string): Declaration {
  const raw = loadYaml(content) as unknown;

  if (typeof raw !== "object" || raw === null || !("zones" in raw)) {
    throw new Error("Declaration must have a top-level 'zones' key");
  }

  const { zones } = raw as { zones: unknown };

  if (typeof zones !== "object" || zones === null) {
    throw new Error("'zones' must be an object");
  }

  const result: Declaration = { zones: {} };

  for (const [zoneName, zoneRaw] of Object.entries(
    zones as Record<string, unknown>,
  )) {
    result.zones[zoneName] = validateZone(zoneName, zoneRaw);
  }

  return result;
}

export function loadDeclarationFile(filePath: string): Declaration {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Declaration file not found: ${filePath}`);
  }

  return parseDeclaration(content);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/dnsctl && bun test src/declaration.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 5: Write failing tests for validation errors**

Append to `src/declaration.test.ts`:

```typescript
describe("parseDeclaration validation errors", () => {
  test("rejects missing zones key", () => {
    expect(() => parseDeclaration("records: []")).toThrow(
      "Declaration must have a top-level 'zones' key",
    );
  });

  test("rejects unknown provider", () => {
    const yaml = `
zones:
  example.com:
    provider: aws
    records: []
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": provider must be "cloudflare" or "tencent"',
    );
  });

  test("rejects unsupported record type", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: SRV
        value: "target"
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": record @ has unsupported type "SRV"',
    );
  });

  test("rejects proxied on tencent zone", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: 600
        proxied: true
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "ihongben.com": record @ A "proxied" is only allowed for Cloudflare zones',
    );
  });

  test("rejects ttl auto on tencent zone", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: auto
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "ihongben.com": record @ A ttl "auto" is only allowed for Cloudflare zones',
    );
  });

  test("rejects duplicate name+type in same zone", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: 600
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": duplicate record @ A',
    );
  });

  test("rejects missing record value", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": record @ A value must be a string',
    );
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/dnsctl && bun test src/declaration.test.ts`

Expected: All 10 tests PASS (validation was implemented in step 3).

- [ ] **Step 7: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd tools/dnsctl && git add src/declaration.ts src/declaration.test.ts
git commit -m "$(cat <<'EOF'
feat: add declaration file loading and validation

Parse YAML declaration files with full validation:
provider, record types (A/AAAA/CNAME/TXT/MX), ttl,
proxied constraints, and duplicate detection.
EOF
)"
```

---

### Task 4: Diff computation

**Files:**
- Create: `tools/dnsctl/src/diff.ts`
- Create: `tools/dnsctl/src/diff.test.ts`

- [ ] **Step 1: Write failing tests for basic diff (create, delete, update, no-op)**

Create `src/diff.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import { computeZoneDiff } from "./diff";
import type { NormalizedRecord } from "./types";

describe("computeZoneDiff", () => {
  test("detects records to create", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "blog", type: "A", value: "2.2.2.2", ttl: 300 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([
      { name: "blog", type: "A", value: "2.2.2.2", ttl: 300 },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  test("detects records to delete", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "old", type: "CNAME", value: "legacy.example.com", ttl: 300 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([
      { name: "old", type: "CNAME", value: "legacy.example.com", ttl: 300 },
    ]);
  });

  test("detects records to update", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "2.2.2.2", ttl: "auto", proxied: true },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600, proxied: false },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          value: { from: "1.1.1.1", to: "2.2.2.2" },
          ttl: { from: 600, to: "auto" },
          proxied: { from: false, to: true },
        },
      },
    ]);
    expect(result.deletes).toEqual([]);
  });

  test("returns empty diff when records match", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/dnsctl && bun test src/diff.test.ts`

Expected: FAIL — module `./diff` not found

- [ ] **Step 3: Implement computeZoneDiff**

Create `src/diff.ts`:

```typescript
import type { NormalizedRecord, RecordUpdate, FieldChange } from "./types";
import { SUPPORTED_RECORD_TYPES, type SupportedRecordType } from "./types";

export interface DiffResult {
  creates: NormalizedRecord[];
  updates: RecordUpdate[];
  deletes: NormalizedRecord[];
}

function recordKey(record: NormalizedRecord): string {
  return `${record.name}:${record.type}`;
}

function buildRecordMap(
  records: NormalizedRecord[],
): Map<string, NormalizedRecord> {
  return new Map(records.map((r) => [recordKey(r), r]));
}

function computeRecordChanges(
  remote: NormalizedRecord,
  declared: NormalizedRecord,
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};

  if (remote.value !== declared.value) {
    changes.value = { from: remote.value, to: declared.value };
  }

  if (remote.ttl !== declared.ttl) {
    changes.ttl = { from: remote.ttl, to: declared.ttl };
  }

  const remoteProxied = remote.proxied ?? false;
  const declaredProxied = declared.proxied ?? false;
  if (remoteProxied !== declaredProxied) {
    changes.proxied = { from: remoteProxied, to: declaredProxied };
  }

  return changes;
}

export function filterSupportedRecords(
  records: NormalizedRecord[],
): NormalizedRecord[] {
  return records.filter((r) =>
    SUPPORTED_RECORD_TYPES.includes(r.type as SupportedRecordType),
  );
}

function findDuplicateKeys(records: NormalizedRecord[]): string[] {
  const seen = new Map<string, number>();

  for (const record of records) {
    const key = `${record.name} ${record.type}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `${key} (${count} records)`);
}

export function computeZoneDiff(
  declared: NormalizedRecord[],
  remote: NormalizedRecord[],
): DiffResult {
  const filteredRemote = filterSupportedRecords(remote);

  const duplicates = findDuplicateKeys(filteredRemote);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate name+type in remote records: ${duplicates.join(", ")}. Multi-value records are not supported`,
    );
  }

  const declaredMap = buildRecordMap(declared);
  const remoteMap = buildRecordMap(filteredRemote);

  const creates: NormalizedRecord[] = [];
  const updates: RecordUpdate[] = [];
  const deletes: NormalizedRecord[] = [];

  for (const [key, declaredRecord] of declaredMap) {
    const remoteRecord = remoteMap.get(key);

    if (!remoteRecord) {
      creates.push(declaredRecord);
    } else {
      const changes = computeRecordChanges(remoteRecord, declaredRecord);
      if (Object.keys(changes).length > 0) {
        updates.push({
          name: declaredRecord.name,
          type: declaredRecord.type,
          changes,
        });
      }
    }
  }

  for (const [key, remoteRecord] of remoteMap) {
    if (!declaredMap.has(key)) {
      deletes.push(remoteRecord);
    }
  }

  return { creates, updates, deletes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/dnsctl && bun test src/diff.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 5: Write failing tests for type filtering and remote duplicates**

Append to `src/diff.test.ts`:

```typescript
describe("computeZoneDiff type filtering", () => {
  test("ignores unsupported record types from remote", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "@", type: "NS", value: "ns1.example.com", ttl: 86400 },
      { name: "@", type: "SOA", value: "ns1.example.com admin.example.com", ttl: 3600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  test("only deletes supported types from remote", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "@", type: "CAA", value: '0 issue "letsencrypt.org"', ttl: 3600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.deletes).toEqual([
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ]);
  });
});

describe("computeZoneDiff remote duplicates", () => {
  test("throws on duplicate name+type in remote after filtering", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600 },
      { name: "mail", type: "MX", value: "mx2.example.com.", ttl: 600 },
    ];

    expect(() => computeZoneDiff(declared, remote)).toThrow(
      "Duplicate name+type in remote records: mail MX (2 records)",
    );
  });

  test("does not throw when duplicates are in unsupported types only", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "NS", value: "ns1.example.com", ttl: 86400 },
      { name: "@", type: "NS", value: "ns2.example.com", ttl: 86400 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("computeZoneDiff proxied comparison", () => {
  test("detects proxied change", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: false },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          proxied: { from: false, to: true },
        },
      },
    ]);
  });

  test("treats missing proxied as false on both sides", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.updates).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/dnsctl && bun test src/diff.test.ts`

Expected: All 10 tests PASS (type filtering and duplicate detection were implemented in step 3).

- [ ] **Step 7: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd tools/dnsctl && git add src/diff.ts src/diff.test.ts
git commit -m "$(cat <<'EOF'
feat: add diff computation for plan command

Compare declared and remote records to produce create/update/delete
diff. Filters remote records to supported types, detects remote
duplicates, and compares value/ttl/proxied fields.
EOF
)"
```

---

### Task 5: Plan output formatting

**Files:**
- Create: `tools/dnsctl/src/plan-output.ts`
- Create: `tools/dnsctl/src/plan-output.test.ts`

- [ ] **Step 1: Write failing tests for text output**

Create `src/plan-output.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import { formatPlanOutput } from "./plan-output";
import type { PlanResult } from "./types";

const basePlan: PlanResult = {
  file: "dns/dns.yaml",
  generatedAt: "2026-03-27T15:00:00+08:00",
  zones: {},
};

describe("formatPlanOutput text", () => {
  test("formats create, update, delete with summary", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
          ],
          updates: [
            {
              name: "@",
              type: "A",
              changes: {
                value: { from: "1.0.0.1", to: "1.1.1.1" },
                proxied: { from: false, to: true },
              },
            },
          ],
          deletes: [
            { name: "old-api", type: "CNAME", value: "legacy.example.com", ttl: 300 },
          ],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("Create:");
    expect(output).toContain("+ blog  A  1.2.3.4  ttl=600");
    expect(output).toContain("Update:");
    expect(output).toContain("~ @  A");
    expect(output).toContain("value: 1.0.0.1 -> 1.1.1.1");
    expect(output).toContain("proxied: false -> true");
    expect(output).toContain("Delete:");
    expect(output).toContain("- old-api  CNAME  legacy.example.com  ttl=300");
    expect(output).toContain("Summary: 1 to create, 1 to update, 1 to delete");
  });

  test("shows no changes when diff is empty", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "ihongben.com": {
          provider: "tencent",
          creates: [],
          updates: [],
          deletes: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: ihongben.com (tencent)");
    expect(output).toContain("No changes");
    expect(output).not.toContain("Summary:");
  });

  test("shows proxied in create and delete lines", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "www", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
          ],
          updates: [],
          deletes: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("+ www  A  1.1.1.1  ttl=auto  proxied");
  });

  test("shows error for zones with errors", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "example.com": {
          provider: "tencent",
          error: "Duplicate name+type in remote records: mail MX (2 records)",
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: example.com (tencent)");
    expect(output).toContain("Error: Duplicate name+type in remote records: mail MX (2 records)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/dnsctl && bun test src/plan-output.test.ts`

Expected: FAIL — module `./plan-output` not found

- [ ] **Step 3: Implement formatPlanOutput**

Create `src/plan-output.ts`:

```typescript
import type {
  NormalizedRecord,
  PlanResult,
  RecordUpdate,
  ZonePlanError,
  ZonePlanResult,
} from "./types";

function formatRecordLine(
  prefix: string,
  record: NormalizedRecord,
): string {
  const proxiedSuffix = record.proxied ? "  proxied" : "";
  return `    ${prefix} ${record.name}  ${record.type}  ${record.value}  ttl=${record.ttl}${proxiedSuffix}`;
}

function formatUpdateLines(update: RecordUpdate): string[] {
  const lines: string[] = [];
  lines.push(`    ~ ${update.name}  ${update.type}`);

  for (const [field, change] of Object.entries(update.changes)) {
    lines.push(`      ${field}: ${change.from} -> ${change.to}`);
  }

  return lines;
}

function isZonePlanError(
  zone: ZonePlanResult | ZonePlanError,
): zone is ZonePlanError {
  return "error" in zone;
}

function formatPlanText(result: PlanResult): string {
  const lines: string[] = [];

  for (const [zoneName, zone] of Object.entries(result.zones)) {
    lines.push(`Zone: ${zoneName} (${zone.provider})`);

    if (isZonePlanError(zone)) {
      lines.push(`  Error: ${zone.error}`);
      lines.push("");
      continue;
    }

    const hasChanges =
      zone.creates.length > 0 ||
      zone.updates.length > 0 ||
      zone.deletes.length > 0;

    if (!hasChanges) {
      lines.push("  No changes");
      lines.push("");
      continue;
    }

    if (zone.creates.length > 0) {
      lines.push("");
      lines.push("  Create:");
      for (const record of zone.creates) {
        lines.push(formatRecordLine("+", record));
      }
    }

    if (zone.updates.length > 0) {
      lines.push("");
      lines.push("  Update:");
      for (const update of zone.updates) {
        lines.push(...formatUpdateLines(update));
      }
    }

    if (zone.deletes.length > 0) {
      lines.push("");
      lines.push("  Delete:");
      for (const record of zone.deletes) {
        lines.push(formatRecordLine("-", record));
      }
    }

    lines.push("");
    lines.push(
      `  Summary: ${zone.creates.length} to create, ${zone.updates.length} to update, ${zone.deletes.length} to delete`,
    );
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatPlanOutput(
  result: PlanResult,
  format: "text" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  return formatPlanText(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/dnsctl && bun test src/plan-output.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 5: Write failing test for JSON output**

Append to `src/plan-output.test.ts`:

```typescript
describe("formatPlanOutput json", () => {
  test("outputs valid JSON with full structure", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
          ],
          updates: [
            {
              name: "@",
              type: "A",
              changes: {
                value: { from: "1.0.0.1", to: "1.1.1.1" },
              },
            },
          ],
          deletes: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "json");
    const parsed = JSON.parse(output);

    expect(parsed.file).toBe("dns/dns.yaml");
    expect(parsed.generatedAt).toBe("2026-03-27T15:00:00+08:00");
    expect(parsed.zones["maxtap.net"].provider).toBe("cloudflare");
    expect(parsed.zones["maxtap.net"].creates).toEqual([
      { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
    ]);
    expect(parsed.zones["maxtap.net"].updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          value: { from: "1.0.0.1", to: "1.1.1.1" },
        },
      },
    ]);
  });

  test("includes error zones in JSON output", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "example.com": {
          provider: "tencent",
          error: "Duplicate records",
        },
      },
    };

    const output = formatPlanOutput(plan, "json");
    const parsed = JSON.parse(output);

    expect(parsed.zones["example.com"]).toEqual({
      provider: "tencent",
      error: "Duplicate records",
    });
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/dnsctl && bun test src/plan-output.test.ts`

Expected: All 6 tests PASS (JSON output was implemented in step 3).

- [ ] **Step 7: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd tools/dnsctl && git add src/plan-output.ts src/plan-output.test.ts
git commit -m "$(cat <<'EOF'
feat: add plan output formatting (text and JSON)

Text output shows create/update/delete sections per zone with
field-level change details and summary counts. JSON output
serializes the full PlanResult structure. Both handle error zones.
EOF
)"
```

---

### Task 6: Plan command orchestration and main() wiring

**Files:**
- Create: `tools/dnsctl/src/plan.ts`
- Create: `tools/dnsctl/src/plan.test.ts`
- Modify: `tools/dnsctl/src/index.ts`

- [ ] **Step 1: Write failing integration tests for runPlanCommand**

Create `src/plan.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import { runPlanCommand } from "./plan";
import type { AppConfig } from "./config";
import type { NormalizedRecord } from "./types";
import type { Declaration } from "./declaration";

const baseConfig: AppConfig = {
  credentials: {
    cloudflare: { apiToken: "cf-token" },
    tencent: { secretId: "secret-id", secretKey: "secret-key" },
  },
  zones: {
    "ihongben.com": { provider: "tencent" },
    "maxtap.net": { provider: "cloudflare" },
  },
};

const declaration: Declaration = {
  zones: {
    "ihongben.com": {
      provider: "tencent",
      records: [
        { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
      ],
    },
    "maxtap.net": {
      provider: "cloudflare",
      records: [
        { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
      ],
    },
  },
};

const remoteCloudflare: NormalizedRecord[] = [
  { name: "@", type: "A", value: "1.0.0.1", ttl: "auto", proxied: false },
  { name: "@", type: "NS", value: "ns1.cloudflare.com", ttl: 86400 },
];

const remoteTencent: NormalizedRecord[] = [
  { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
];

describe("runPlanCommand", () => {
  test("produces text diff for all zones", async () => {
    const output = await runPlanCommand(
      { command: "plan", format: "text", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencent,
      },
    );

    expect(output).toContain("Zone: ihongben.com (tencent)");
    expect(output).toContain("No changes");
    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("Update:");
    expect(output).toContain("value: 1.0.0.1 -> 1.1.1.1");
    expect(output).toContain("proxied: false -> true");
  });

  test("produces json output", async () => {
    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencent,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.file).toBe("dns/dns.yaml");
    expect(parsed.zones["ihongben.com"].creates).toEqual([]);
    expect(parsed.zones["ihongben.com"].updates).toEqual([]);
    expect(parsed.zones["ihongben.com"].deletes).toEqual([]);
    expect(parsed.zones["maxtap.net"].updates.length).toBe(1);
  });

  test("filters to single zone with --zone", async () => {
    let cloudflareCalled = false;

    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml", zone: "ihongben.com" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => {
          cloudflareCalled = true;
          return remoteCloudflare;
        },
        inspectTencentZone: async () => remoteTencent,
      },
    );

    const parsed = JSON.parse(output);

    expect(cloudflareCalled).toBe(false);
    expect(Object.keys(parsed.zones)).toEqual(["ihongben.com"]);
  });

  test("rejects --zone not in declaration", async () => {
    await expect(
      runPlanCommand(
        { command: "plan", format: "text", file: "dns/dns.yaml", zone: "unknown.com" },
        {
          config: baseConfig,
          now: () => "2026-03-27T15:00:00+08:00",
          loadDeclaration: () => declaration,
          inspectCloudflareZone: async () => [],
          inspectTencentZone: async () => [],
        },
      ),
    ).rejects.toThrow('Zone "unknown.com" not found in declaration file');
  });

  test("adds provider context to query errors", async () => {
    await expect(
      runPlanCommand(
        { command: "plan", format: "text", file: "dns/dns.yaml", zone: "maxtap.net" },
        {
          config: baseConfig,
          now: () => "2026-03-27T15:00:00+08:00",
          loadDeclaration: () => declaration,
          inspectCloudflareZone: async () => {
            throw new Error("auth failed");
          },
          inspectTencentZone: async () => [],
        },
      ),
    ).rejects.toThrow(
      'Failed to query zone "maxtap.net" from provider "cloudflare": auth failed',
    );
  });

  test("catches remote duplicate error and continues", async () => {
    const mixedDeclaration: Declaration = {
      zones: {
        "ihongben.com": {
          provider: "tencent",
          records: [
            { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
          ],
        },
        "maxtap.net": {
          provider: "cloudflare",
          records: [
            { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
          ],
        },
      },
    };

    const remoteTencentWithDupes: NormalizedRecord[] = [
      { name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600 },
      { name: "mail", type: "MX", value: "mx2.example.com.", ttl: 600 },
      { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
    ];

    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => mixedDeclaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencentWithDupes,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.zones["ihongben.com"].error).toContain("Duplicate name+type");
    expect(parsed.zones["maxtap.net"].updates.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/dnsctl && bun test src/plan.test.ts`

Expected: FAIL — module `./plan` not found

- [ ] **Step 3: Implement runPlanCommand**

Create `src/plan.ts`:

```typescript
import type { PlanCliArgs } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import { loadDeclarationFile, type Declaration } from "./declaration";
import { computeZoneDiff } from "./diff";
import { formatPlanOutput } from "./plan-output";
import { inspectCloudflareZone } from "./providers/cloudflare";
import { inspectTencentZone } from "./providers/tencent";
import type {
  FetchLike,
  NormalizedRecord,
  PlanResult,
  ZonePlanError,
  ZonePlanResult,
} from "./types";

interface PlanDependencies {
  config: AppConfig;
  now: () => string;
  loadDeclaration: (filePath: string) => Declaration;
  inspectCloudflareZone: (options: {
    apiToken: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<NormalizedRecord[]>;
  inspectTencentZone: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<NormalizedRecord[]>;
}

function defaultNow(): string {
  return new Date().toISOString();
}

export async function runPlanCommand(
  cliArgs: PlanCliArgs,
  deps?: Partial<PlanDependencies>,
): Promise<string> {
  const config = deps?.config ?? loadRuntimeConfig();
  const now = deps?.now ?? defaultNow;
  const loadDecl = deps?.loadDeclaration ?? loadDeclarationFile;
  const inspectCloudflare =
    deps?.inspectCloudflareZone ?? inspectCloudflareZone;
  const inspectTencent = deps?.inspectTencentZone ?? inspectTencentZone;

  const declaration = loadDecl(cliArgs.file);

  if (cliArgs.zone && !declaration.zones[cliArgs.zone]) {
    throw new Error(
      `Zone "${cliArgs.zone}" not found in declaration file`,
    );
  }

  const zoneNames = cliArgs.zone
    ? [cliArgs.zone]
    : Object.keys(declaration.zones);

  const result: PlanResult = {
    file: cliArgs.file,
    generatedAt: now(),
    zones: {},
  };

  for (const zoneName of zoneNames) {
    const declaredZone = declaration.zones[zoneName];

    let remoteRecords: NormalizedRecord[];
    try {
      if (declaredZone.provider === "cloudflare") {
        remoteRecords = await inspectCloudflare({
          apiToken: config.credentials.cloudflare.apiToken,
          zoneName,
        });
      } else {
        remoteRecords = await inspectTencent({
          secretId: config.credentials.tencent.secretId,
          secretKey: config.credentials.tencent.secretKey,
          zoneName,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to query zone "${zoneName}" from provider "${declaredZone.provider}": ${message}`,
      );
    }

    try {
      const diff = computeZoneDiff(declaredZone.records, remoteRecords);
      result.zones[zoneName] = {
        provider: declaredZone.provider,
        ...diff,
      } satisfies ZonePlanResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      result.zones[zoneName] = {
        provider: declaredZone.provider,
        error: message,
      } satisfies ZonePlanError;
    }
  }

  return formatPlanOutput(result, cliArgs.format);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/dnsctl && bun test src/plan.test.ts`

Expected: All 6 tests PASS.

- [ ] **Step 5: Wire plan command into main()**

Update `src/index.ts` — add the plan import and update `main()`:

Add import at the top:
```typescript
import type { InspectCliArgs, PlanCliArgs } from "./cli";
import { runPlanCommand } from "./plan";
```

Replace the `main` function:
```typescript
async function main(argv: string[]): Promise<void> {
  const cliArgs = parseCliArgs(argv);

  if (cliArgs.command === "inspect") {
    const output = await runInspectCommand(cliArgs);
    console.log(output);
  } else {
    const output = await runPlanCommand(cliArgs);
    console.log(output);
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `cd tools/dnsctl && bun test`

Expected: All tests across all files PASS.

- [ ] **Step 7: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd tools/dnsctl && git add src/plan.ts src/plan.test.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat: add plan command with full orchestration

Wire up declaration loading, provider querying, diff computation,
and output formatting into runPlanCommand. Update main() to
dispatch plan command alongside existing inspect command.
EOF
)"
```

---

### Task 7: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd tools/dnsctl && bun test`

Expected: All tests PASS across all files. Zero failures.

- [ ] **Step 2: Run typecheck**

Run: `cd tools/dnsctl && bun run typecheck`

Expected: PASS with no errors.

- [ ] **Step 3: Verify inspect has no regression**

Run: `cd tools/dnsctl && bun test src/index.test.ts src/cli.test.ts`

Expected: All existing inspect tests PASS unchanged.

- [ ] **Step 4: Manual smoke test with real providers (requires .env.local)**

Create a sample declaration file and run plan against real DNS:

```bash
cd tools/dnsctl && mkdir -p dns
cat > dns/dns.yaml << 'EOF'
zones:
  maxtap.net:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "0.0.0.0"
        ttl: auto
        proxied: false
EOF
```

Run: `cd tools/dnsctl && bun run src/index.ts plan --file dns/dns.yaml --zone maxtap.net`

Expected: Non-empty plan output showing create/update/delete changes (or "No changes" if the declaration matches remote). Verify the output is readable and the format matches the design doc.

Run JSON variant: `cd tools/dnsctl && bun run src/index.ts plan --file dns/dns.yaml --zone maxtap.net --json`

Expected: Valid JSON output with `file`, `generatedAt`, and `zones` fields.

- [ ] **Step 5: Clean up smoke test file**

```bash
rm tools/dnsctl/dns/dns.yaml && rmdir tools/dnsctl/dns
```
