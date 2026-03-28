import { parseCliArgs, getUsageText } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import { runApplyCommand } from "./apply";
import { runPlanCommand } from "./plan";
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

  if (cliArgs.command === "help") {
    console.log(getUsageText(cliArgs.topic));
    return;
  }

  if (cliArgs.command === "inspect") {
    const output = await runInspectCommand(cliArgs);
    console.log(output);
  } else if (cliArgs.command === "plan") {
    const output = await runPlanCommand(cliArgs);
    console.log(output);
  } else {
    const { output, hasErrors } = await runApplyCommand(cliArgs);
    console.log(output);
    if (hasErrors) {
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
