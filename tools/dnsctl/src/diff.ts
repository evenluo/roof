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
