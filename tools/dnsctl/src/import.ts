import { dump as dumpYaml } from "js-yaml";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ImportCliArgs } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import type { Declaration } from "./declaration";
import { inspectCloudflareZone } from "./providers/cloudflare";
import { inspectTencentZone } from "./providers/tencent";
import { SUPPORTED_RECORD_TYPES } from "./types";
import type { FetchLike, NormalizedRecord } from "./types";

interface ImportDependencies {
  config: AppConfig;
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
  fileExists: (path: string) => boolean;
  writeOutput: (path: string, content: string) => void;
}

export async function runImportCommand(
  cliArgs: ImportCliArgs,
  deps?: Partial<ImportDependencies>,
): Promise<void> {
  const config = deps?.config ?? loadRuntimeConfig();
  const fileExists = deps?.fileExists ?? existsSync;
  const writeOutput =
    deps?.writeOutput ??
    ((p: string, c: string) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, c, "utf-8");
    });
  const inspectCf = deps?.inspectCloudflareZone ?? inspectCloudflareZone;
  const inspectTc = deps?.inspectTencentZone ?? inspectTencentZone;

  const outputPath = resolve(cliArgs.output);

  if (!cliArgs.force && fileExists(outputPath)) {
    throw new Error(
      `File already exists: ${cliArgs.output}. Use --force to overwrite.`,
    );
  }

  const zoneNames = cliArgs.zone
    ? [cliArgs.zone]
    : Object.keys(config.zones);

  const declaration: Declaration = { zones: {} };

  for (const zoneName of zoneNames) {
    const zone = config.zones[zoneName as keyof AppConfig["zones"]];

    if (!zone) {
      throw new Error(`Zone "${zoneName}" is not configured`);
    }

    let records: NormalizedRecord[];
    try {
      if (zone.provider === "cloudflare") {
        records = await inspectCf({
          apiToken: config.credentials.cloudflare.apiToken,
          zoneName,
        });
      } else {
        records = await inspectTc({
          secretId: config.credentials.tencent.secretId,
          secretKey: config.credentials.tencent.secretKey,
          zoneName,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to import zone "${zoneName}" from provider "${zone.provider}": ${message}`,
      );
    }

    const supported = records.filter((r) =>
      SUPPORTED_RECORD_TYPES.includes(r.type as (typeof SUPPORTED_RECORD_TYPES)[number]),
    );
    declaration.zones[zoneName] = { provider: zone.provider, records: supported };
  }

  const yaml = dumpYaml(declaration);
  writeOutput(outputPath, yaml);

  console.log(`Written to ${cliArgs.output}`);
}
