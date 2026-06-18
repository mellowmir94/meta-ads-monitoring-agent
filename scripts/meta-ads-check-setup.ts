import { runMetaAdsSetupCheck } from "@/lib/meta-ads/setup-check";

const result = runMetaAdsSetupCheck();

for (const item of result.items) {
  console.info(`${item.ok ? "OK" : "MISSING"} ${item.name}: ${item.message}`);
}

if (result.nextActions.length) {
  console.info("\nNext actions:");
  for (const [index, action] of result.nextActions.entries()) {
    console.info(`${index + 1}. ${action}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
