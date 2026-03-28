import type { ApplyCliArgs } from "./cli";
import { loadRuntimeConfig, type AppConfig } from "./config";
import { loadDeclarationFile, type Declaration } from "./declaration";
import { computeZoneDiff } from "./diff";
import { normalizeCloudflareRecord, normalizeRecordCollection } from "./normalize/records";
import { formatApplyOutput } from "./apply-output";
import { fetchCloudflareZoneWithIds, createCloudflareRecord, updateCloudflareRecord, deleteCloudflareRecord, type CloudflareRawRecord } from "./providers/cloudflare";
import { fetchTencentZoneWithIds, createTencentRecord, modifyTencentRecord, deleteTencentRecord } from "./providers/tencent";
import type {
  ApplyError,
  ApplyResult,
  FetchLike,
  NormalizedRecord,
  TencentManagedRecord,
  ZoneApplyError,
  ZoneApplyResult,
} from "./types";

interface ApplyDependencies {
  config: AppConfig;
  now: () => string;
  loadDeclaration: (filePath: string) => Declaration;
  fetchCloudflareZoneWithIds: (options: {
    apiToken: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<CloudflareRawRecord[]>;
  createCloudflareRecord: (options: {
    apiToken: string;
    zoneName: string;
    record: NormalizedRecord;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  updateCloudflareRecord: (options: {
    apiToken: string;
    zoneName: string;
    recordId: string;
    record: NormalizedRecord;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  deleteCloudflareRecord: (options: {
    apiToken: string;
    zoneName: string;
    recordId: string;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  fetchTencentZoneWithIds: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    fetchImpl?: FetchLike;
  }) => Promise<TencentManagedRecord[]>;
  createTencentRecord: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    record: NormalizedRecord;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  modifyTencentRecord: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    recordId: number;
    line: string;
    record: NormalizedRecord;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  deleteTencentRecord: (options: {
    secretId: string;
    secretKey: string;
    zoneName: string;
    recordId: number;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
}

function recordKey(record: NormalizedRecord): string {
  return `${record.name}:${record.type}`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

async function applyCloudflareZone(options: {
  config: AppConfig;
  zoneName: string;
  declared: NormalizedRecord[];
  deps: ApplyDependencies;
}): Promise<ZoneApplyResult | ZoneApplyError> {
  const { config, zoneName, declared, deps } = options;
  const apiToken = config.credentials.cloudflare.apiToken;

  let rawRecords: CloudflareRawRecord[];
  try {
    rawRecords = await deps.fetchCloudflareZoneWithIds({ apiToken, zoneName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { provider: "cloudflare", error: `Failed to query zone "${zoneName}": ${message}` };
  }

  const remoteNormalized = normalizeRecordCollection(
    rawRecords.map((r) => normalizeCloudflareRecord(zoneName, r)),
  );

  const diff = computeZoneDiff(declared, remoteNormalized);

  const idMap = new Map(
    rawRecords.map((r) => [
      recordKey(normalizeCloudflareRecord(zoneName, r)),
      r.id,
    ]),
  );

  const declaredMap = new Map(declared.map((r) => [recordKey(r), r]));
  const skippedKeys = new Set(diff.skippedMultiValue.map(recordKey));

  const zoneResult: ZoneApplyResult = {
    provider: "cloudflare",
    created: [],
    updated: [],
    deleted: [],
    skippedMultiValue: diff.skippedMultiValue,
    errors: [],
  };

  for (const record of diff.creates) {
    if (skippedKeys.has(recordKey(record))) continue;
    try {
      await deps.createCloudflareRecord({ apiToken, zoneName, record });
      zoneResult.created.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "create", record, error: message } satisfies ApplyError);
    }
  }

  for (const update of diff.updates) {
    const key = `${update.name}:${update.type}`;
    if (skippedKeys.has(key)) continue;
    const recordId = idMap.get(key);
    const record = declaredMap.get(key);

    if (!recordId || !record) continue;

    try {
      await deps.updateCloudflareRecord({ apiToken, zoneName, recordId, record });
      zoneResult.updated.push(update);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "update", record, error: message } satisfies ApplyError);
    }
  }

  for (const record of diff.deletes) {
    const recordId = idMap.get(recordKey(record));

    if (!recordId) continue;

    try {
      await deps.deleteCloudflareRecord({ apiToken, zoneName, recordId });
      zoneResult.deleted.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "delete", record, error: message } satisfies ApplyError);
    }
  }

  return zoneResult;
}

async function applyTencentZone(options: {
  config: AppConfig;
  zoneName: string;
  declared: NormalizedRecord[];
  deps: ApplyDependencies;
}): Promise<ZoneApplyResult | ZoneApplyError> {
  const { config, zoneName, declared, deps } = options;
  const { secretId, secretKey } = config.credentials.tencent;

  let managedRecords: TencentManagedRecord[];
  try {
    managedRecords = await deps.fetchTencentZoneWithIds({ secretId, secretKey, zoneName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { provider: "tencent", error: `Failed to query zone "${zoneName}": ${message}` };
  }

  const remoteNormalized = normalizeRecordCollection(
    managedRecords.map((r) => ({ name: r.name, type: r.type, value: r.value, ttl: r.ttl })),
  );

  const diff = computeZoneDiff(declared, remoteNormalized);

  const idMap = new Map(
    managedRecords.map((r) => [`${r.name}:${r.type}`, { recordId: r.recordId, line: r.line }]),
  );

  const declaredMap = new Map(declared.map((r) => [recordKey(r), r]));
  const skippedKeys = new Set(diff.skippedMultiValue.map(recordKey));

  const zoneResult: ZoneApplyResult = {
    provider: "tencent",
    created: [],
    updated: [],
    deleted: [],
    skippedMultiValue: diff.skippedMultiValue,
    errors: [],
  };

  for (const record of diff.creates) {
    if (skippedKeys.has(recordKey(record))) continue;
    try {
      await deps.createTencentRecord({ secretId, secretKey, zoneName, record });
      zoneResult.created.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "create", record, error: message } satisfies ApplyError);
    }
  }

  for (const update of diff.updates) {
    const key = `${update.name}:${update.type}`;
    if (skippedKeys.has(key)) continue;
    const remote = idMap.get(key);
    const record = declaredMap.get(key);

    if (!remote || !record) continue;

    try {
      await deps.modifyTencentRecord({
        secretId,
        secretKey,
        zoneName,
        recordId: remote.recordId,
        line: remote.line,
        record,
      });
      zoneResult.updated.push(update);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "update", record, error: message } satisfies ApplyError);
    }
  }

  for (const record of diff.deletes) {
    const remote = idMap.get(recordKey(record));

    if (!remote) continue;

    try {
      await deps.deleteTencentRecord({ secretId, secretKey, zoneName, recordId: remote.recordId });
      zoneResult.deleted.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      zoneResult.errors.push({ operation: "delete", record, error: message } satisfies ApplyError);
    }
  }

  return zoneResult;
}

export interface ApplyCommandResult {
  output: string;
  hasErrors: boolean;
}

function resultHasErrors(result: ApplyResult): boolean {
  return Object.values(result.zones).some(
    (zone) =>
      "error" in zone ||
      (zone as ZoneApplyResult).errors.length > 0 ||
      (zone as ZoneApplyResult).skippedMultiValue.length > 0,
  );
}

export async function runApplyCommand(
  cliArgs: ApplyCliArgs,
  deps?: Partial<ApplyDependencies>,
): Promise<ApplyCommandResult> {
  const config = deps?.config ?? loadRuntimeConfig();
  const now = deps?.now ?? defaultNow;
  const loadDecl = deps?.loadDeclaration ?? loadDeclarationFile;
  const fetchCfWithIds = deps?.fetchCloudflareZoneWithIds ?? fetchCloudflareZoneWithIds;
  const createCf = deps?.createCloudflareRecord ?? createCloudflareRecord;
  const updateCf = deps?.updateCloudflareRecord ?? updateCloudflareRecord;
  const deleteCf = deps?.deleteCloudflareRecord ?? deleteCloudflareRecord;
  const fetchTcWithIds = deps?.fetchTencentZoneWithIds ?? fetchTencentZoneWithIds;
  const createTc = deps?.createTencentRecord ?? createTencentRecord;
  const modifyTc = deps?.modifyTencentRecord ?? modifyTencentRecord;
  const deleteTc = deps?.deleteTencentRecord ?? deleteTencentRecord;

  const resolvedDeps: ApplyDependencies = {
    config,
    now,
    loadDeclaration: loadDecl,
    fetchCloudflareZoneWithIds: fetchCfWithIds,
    createCloudflareRecord: createCf,
    updateCloudflareRecord: updateCf,
    deleteCloudflareRecord: deleteCf,
    fetchTencentZoneWithIds: fetchTcWithIds,
    createTencentRecord: createTc,
    modifyTencentRecord: modifyTc,
    deleteTencentRecord: deleteTc,
  };

  const declaration = loadDecl(cliArgs.file);

  if (cliArgs.zone && !declaration.zones[cliArgs.zone]) {
    throw new Error(`Zone "${cliArgs.zone}" not found in declaration file`);
  }

  const zoneNames = cliArgs.zone
    ? [cliArgs.zone]
    : Object.keys(declaration.zones);

  const result: ApplyResult = {
    file: cliArgs.file,
    generatedAt: now(),
    zones: {},
  };

  for (const zoneName of zoneNames) {
    const declaredZone = declaration.zones[zoneName];

    if (declaredZone.provider === "cloudflare") {
      result.zones[zoneName] = await applyCloudflareZone({
        config,
        zoneName,
        declared: declaredZone.records,
        deps: resolvedDeps,
      });
    } else {
      result.zones[zoneName] = await applyTencentZone({
        config,
        zoneName,
        declared: declaredZone.records,
        deps: resolvedDeps,
      });
    }
  }

  return {
    output: formatApplyOutput(result, cliArgs.format),
    hasErrors: resultHasErrors(result),
  };
}
