import { config as loadDotenv } from "dotenv";

import { parseCliArgs } from "./cli";
import { loadConfig, type AppConfig } from "./config";
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

function loadRuntimeConfig(): AppConfig {
  loadDotenv({
    path: ".env.local",
    quiet: true,
  });

  return loadConfig(process.env);
}

export async function runInspectCommand(
  cliArgs: ReturnType<typeof parseCliArgs>,
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
