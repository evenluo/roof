import { SUPPORTED_ZONES } from "./config";

export interface HelpCliArgs {
  command: "help";
  topic?: "inspect" | "plan" | "apply" | "import";
}

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

export interface ApplyCliArgs {
  command: "apply";
  format: "text" | "json";
  file: string;
  zone?: string;
}

export interface ImportCliArgs {
  command: "import";
  output: string;
  zone?: string;
  force: boolean;
}

export type CliArgs = HelpCliArgs | InspectCliArgs | PlanCliArgs | ApplyCliArgs | ImportCliArgs;

const USAGE = `Usage: dnsctl <command> [options]

Commands:
  inspect   Query remote DNS records
  plan      Compare declaration file against remote DNS
  apply     Apply declaration file to remote DNS
  import    Generate declaration file from current remote DNS state

Options:
  --help, -h  Show help

Run 'dnsctl <command> --help' for command-specific options.`;

const INSPECT_USAGE = `Usage: dnsctl inspect [options]

Query remote DNS records for all configured zones.

Options:
  --json         Output as JSON (default: YAML)
  --zone <name>  Query a single zone
  --help, -h     Show help`;

const PLAN_USAGE = `Usage: dnsctl plan [options]

Compare a YAML declaration file against remote DNS and show a diff.

Options:
  --file <path>  Declaration file path (default: dns/dns.yaml)
  --zone <name>  Plan a single zone
  --json         Output as JSON (default: text)
  --help, -h     Show help`;

const APPLY_USAGE = `Usage: dnsctl apply [options]

Apply a YAML declaration file to remote DNS (create, update, delete records).

Options:
  --file <path>  Declaration file path (default: dns/dns.yaml)
  --zone <name>  Apply a single zone
  --json         Output as JSON (default: text)
  --help, -h     Show help`;

const IMPORT_USAGE = `Usage: dnsctl import [options]

Generate a declaration file from current remote DNS state.

Options:
  --output <path>  Output file path (default: dns/dns.yaml)
  --zone <name>    Import a single zone
  --force          Overwrite existing file
  --help, -h       Show help`;

function ensureSupportedZone(zone: string): string {
  if (!SUPPORTED_ZONES.includes(zone as (typeof SUPPORTED_ZONES)[number])) {
    throw new Error(`Unsupported zone: ${zone}`);
  }

  return zone;
}

function isHelpFlag(arg: string): boolean {
  return arg === "--help" || arg === "-h";
}

function parseInspectArgs(rest: string[]): InspectCliArgs | HelpCliArgs {
  if (rest.length > 0 && isHelpFlag(rest[0])) {
    return { command: "help", topic: "inspect" };
  }

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

function parsePlanArgs(rest: string[]): PlanCliArgs | HelpCliArgs {
  if (rest.length > 0 && isHelpFlag(rest[0])) {
    return { command: "help", topic: "plan" };
  }

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

function parseApplyArgs(rest: string[]): ApplyCliArgs | HelpCliArgs {
  if (rest.length > 0 && isHelpFlag(rest[0])) {
    return { command: "help", topic: "apply" };
  }

  const parsed: ApplyCliArgs = {
    command: "apply",
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

function parseImportArgs(rest: string[]): ImportCliArgs | HelpCliArgs {
  if (rest.length > 0 && isHelpFlag(rest[0])) {
    return { command: "help", topic: "import" };
  }

  const parsed: ImportCliArgs = {
    command: "import",
    output: "dns/dns.yaml",
    force: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];

    if (current === "--force") {
      parsed.force = true;
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

    if (current === "--output") {
      const output = rest[index + 1];
      if (!output) {
        throw new Error("Missing value for --output");
      }

      parsed.output = output;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;

  if (!command || isHelpFlag(command)) {
    return { command: "help" };
  }

  if (command === "inspect") {
    return parseInspectArgs(rest);
  }

  if (command === "plan") {
    return parsePlanArgs(rest);
  }

  if (command === "apply") {
    return parseApplyArgs(rest);
  }

  if (command === "import") {
    return parseImportArgs(rest);
  }

  throw new Error(`Unknown command: ${command}`);
}

export function getUsageText(topic?: "inspect" | "plan" | "apply" | "import"): string {
  if (topic === "inspect") return INSPECT_USAGE;
  if (topic === "plan") return PLAN_USAGE;
  if (topic === "apply") return APPLY_USAGE;
  if (topic === "import") return IMPORT_USAGE;
  return USAGE;
}
