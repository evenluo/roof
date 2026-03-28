import type { TencentManagedRecord } from "./types";

export interface TencentPrunePlan {
  keep: TencentManagedRecord[];
  delete: TencentManagedRecord[];
}

export function buildDnsauthPrunePlan(
  records: TencentManagedRecord[],
): TencentPrunePlan {
  if (records.length === 0) {
    throw new Error('No matching "_dnsauth" TXT records found');
  }

  const sortedRecords = [...records].sort((left, right) =>
    right.updatedOn.localeCompare(left.updatedOn),
  );

  return {
    keep: sortedRecords.slice(0, 1),
    delete: sortedRecords.slice(1),
  };
}
