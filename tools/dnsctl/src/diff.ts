import type { NormalizedRecord, RecordUpdate, FieldChange } from "./types";
import { SUPPORTED_RECORD_TYPES, type SupportedRecordType } from "./types";

export interface DiffResult {
  creates: NormalizedRecord[];
  updates: RecordUpdate[];
  deletes: NormalizedRecord[];
  skippedMultiValue: NormalizedRecord[];
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

function separateMultiValueRecords(records: NormalizedRecord[]): {
  unique: NormalizedRecord[];
  multiValue: NormalizedRecord[];
} {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = recordKey(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const unique: NormalizedRecord[] = [];
  const multiValue: NormalizedRecord[] = [];

  for (const r of records) {
    if (counts.get(recordKey(r))! > 1) {
      multiValue.push(r);
    } else {
      unique.push(r);
    }
  }

  return { unique, multiValue };
}

export function computeZoneDiff(
  declared: NormalizedRecord[],
  remote: NormalizedRecord[],
): DiffResult {
  const filteredRemote = filterSupportedRecords(remote);

  const { unique: uniqueRemote, multiValue: skippedMultiValue } = separateMultiValueRecords(filteredRemote);

  const declaredMap = buildRecordMap(declared);
  const remoteMap = buildRecordMap(uniqueRemote);

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

  return { creates, updates, deletes, skippedMultiValue };
}
