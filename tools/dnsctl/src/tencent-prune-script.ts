import type { TencentManagedRecord } from "./types";

function formatRecord(record: TencentManagedRecord): string {
  return `#${record.recordId} ${record.name} ${record.type} ${record.value} ttl=${record.ttl} updated_on=${record.updatedOn}`;
}

export function formatTencentPruneSummary(options: {
  zoneName: string;
  keep: TencentManagedRecord[];
  deletes: TencentManagedRecord[];
  apply: boolean;
}): string {
  const lines = [
    `Zone: ${options.zoneName}`,
    `Mode: ${options.apply ? "apply" : "dry-run"}`,
    "",
    "Keep:",
    ...options.keep.map((record) => `  = ${formatRecord(record)}`),
    "",
    "Delete:",
  ];

  if (options.deletes.length === 0) {
    lines.push("  (none)");
  } else {
    lines.push(...options.deletes.map((record) => `  - ${formatRecord(record)}`));
  }

  return lines.join("\n");
}
