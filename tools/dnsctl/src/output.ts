import { dump as toYaml } from "js-yaml";

import type { AppConfig } from "./config";
import type { NormalizedRecord } from "./types";

export interface InspectOutput {
  generatedAt: string;
  zones: Partial<
    Record<
      keyof AppConfig["zones"],
      {
        provider: AppConfig["zones"][keyof AppConfig["zones"]]["provider"];
        records: NormalizedRecord[];
      }
    >
  >;
}

export function formatInspectOutput(
  output: InspectOutput,
  format: "yaml" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(output, null, 2);
  }

  return toYaml(output, {
    forceQuotes: true,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    sortKeys: false,
  }).trimEnd();
}

