import { SUPPORTED_ZONES } from "./config";

export interface CliArgs {
  command: "inspect";
  format: "yaml" | "json";
  zone?: string;
}

function ensureSupportedZone(zone: string): string {
  if (!SUPPORTED_ZONES.includes(zone as (typeof SUPPORTED_ZONES)[number])) {
    throw new Error(`Unsupported zone: ${zone}`);
  }

  return zone;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;

  if (command !== "inspect") {
    throw new Error(`Unknown command: ${command ?? "(empty)"}`);
  }

  const parsed: CliArgs = {
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
