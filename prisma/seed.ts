import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adAccountId = process.env.META_AD_ACCOUNT_ID || "act_sample_meta_ads_account";

  await prisma.metaAdsAccount.upsert({
    where: { adAccountId },
    update: {
      name: "Sample Meta Ads Account",
      currency: "MYR",
      timezoneName: process.env.META_ADS_TIMEZONE || "Asia/Kuala_Lumpur"
    },
    create: {
      adAccountId,
      name: "Sample Meta Ads Account",
      currency: "MYR",
      timezoneName: process.env.META_ADS_TIMEZONE || "Asia/Kuala_Lumpur"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
