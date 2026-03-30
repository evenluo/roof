import type { PlanCliArgs } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import { loadDeclarationFile, type Declaration } from "./declaration";
import { computeZoneDiff } from "./diff";
import { formatPlanOutput } from "./plan-output";
import { inspectAliyunZone } from "./providers/aliyun";
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
  inspectAliyunZone: (options: {
    accessKeyId: string;
    accessKeySecret: string;
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
  const inspectAliyun = deps?.inspectAliyunZone ?? inspectAliyunZone;

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
      } else if (declaredZone.provider === "aliyun") {
        remoteRecords = await inspectAliyun({
          accessKeyId: config.credentials.aliyun.accessKeyId,
          accessKeySecret: config.credentials.aliyun.accessKeySecret,
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
