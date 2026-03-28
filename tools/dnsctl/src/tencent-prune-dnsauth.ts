import { loadRuntimeConfig } from "./config";
import { deleteTencentRecord, listTencentManagedRecords } from "./providers/tencent";
import { buildDnsauthPrunePlan } from "./tencent-dnsauth-prune";
import { formatTencentPruneSummary } from "./tencent-prune-script";

const DEFAULT_ZONE_NAME = "ihongben.com";

interface PruneCliArgs {
  apply: boolean;
  zoneName: string;
}

function parseCliArgs(argv: string[]): PruneCliArgs {
  const parsed: PruneCliArgs = {
    apply: false,
    zoneName: DEFAULT_ZONE_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (current === "--zone") {
      const zoneName = argv[index + 1];
      if (!zoneName) {
        throw new Error("Missing value for --zone");
      }

      parsed.zoneName = zoneName;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

export async function runTencentDnsauthPrune(argv: string[]): Promise<string> {
  const cliArgs = parseCliArgs(argv);
  const config = loadRuntimeConfig();
  const records = await listTencentManagedRecords({
    secretId: config.credentials.tencent.secretId,
    secretKey: config.credentials.tencent.secretKey,
    zoneName: cliArgs.zoneName,
    subdomain: "_dnsauth",
    recordType: "TXT",
  });
  const plan = buildDnsauthPrunePlan(records);

  if (cliArgs.apply) {
    for (const record of plan.delete) {
      await deleteTencentRecord({
        secretId: config.credentials.tencent.secretId,
        secretKey: config.credentials.tencent.secretKey,
        zoneName: cliArgs.zoneName,
        recordId: record.recordId,
      });
    }
  }

  return formatTencentPruneSummary({
    zoneName: cliArgs.zoneName,
    keep: plan.keep,
    deletes: plan.delete,
    apply: cliArgs.apply,
  });
}

if (import.meta.main) {
  const output = await runTencentDnsauthPrune(process.argv.slice(2));
  console.log(output);
}
