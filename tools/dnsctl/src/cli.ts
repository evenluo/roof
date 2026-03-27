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
