import { runMetaAdsAgent } from "@/lib/meta-ads/runner";

runMetaAdsAgent("weekly")
  .then((result) => {
    console.info(JSON.stringify({ ok: true, ...result }));
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  });
