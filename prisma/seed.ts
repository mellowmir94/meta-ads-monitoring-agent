import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "founder@applysharp.local" },
    update: {},
    create: {
      email: "founder@applysharp.local",
      name: "ApplySharp Founder"
    }
  });

  const masterResume = await prisma.masterResume.create({
    data: {
      userId: user.id,
      title: "Master Resume - Analyst and Support",
      rawText:
        "SQL, Power BI, dashboard reporting, Grafana monitoring, BigQuery, Python automation, Laravel/PHP support, application support, IT operations.",
      profile: {
        create: {
          experience: [
            {
              title: "Analyst and Application Support",
              evidence: "Dashboard reporting, SQL troubleshooting, monitoring, support operations"
            }
          ],
          skills: ["SQL", "Power BI", "Application Support", "Reporting Automation"],
          education: [],
          achievements: ["Built operational dashboards", "Automated reporting workflows"],
          industries: ["Operations", "Support"],
          tools: ["SQL", "Power BI", "Grafana", "BigQuery", "Python", "Laravel", "PHP"],
          keywords: ["SQL", "Power BI", "dashboard", "reporting", "Grafana", "Python", "Laravel"],
          strengths: ["Dashboard reporting", "SQL analysis", "Application support"],
          gaps: [],
          parserVersion: "seed-v1"
        }
      }
    }
  });

  const job = await prisma.jobListing.create({
    data: {
      userId: user.id,
      title: "Power BI Analyst",
      company: "Axiata Digital",
      companyType: "MNC",
      category: "MNC",
      location: "Glenmarie, Shah Alam",
      salary: "MYR 5,500 - 7,000",
      workMode: "HYBRID",
      experienceLevel: "JUNIOR",
      sourcePlatform: "COMPANY_SITE",
      sourceUrl: "https://www.axiata.com/careers",
      officialApplyLink: "https://www.axiata.com/careers",
      hrEmail: "careers@example.com",
      requirements: ["SQL", "Power BI", "dashboard", "reporting"],
      responsibilities: ["Build dashboards", "Prepare reports", "Analyze business metrics"],
      atsKeywords: ["Power BI", "SQL", "dashboard reporting", "business intelligence"],
      rawDescription: "Build Power BI dashboards and support business reporting across operations.",
      postedAt: new Date()
    }
  });

  const analysis = await prisma.jobAnalysis.create({
    data: {
      jobListingId: job.id,
      userId: user.id,
      fitScore: 92,
      atsScore: 88,
      missingKeywords: ["business intelligence"],
      matchedKeywords: ["SQL", "Power BI", "dashboard", "reporting"],
      skillGaps: [],
      recruiterConcerns: [],
      improvements: ["Emphasize dashboard reporting in the top third of the resume"],
      promptWarnings: [],
      provider: "openai",
      model: "gpt-4.1"
    }
  });

  const tailoredResume = await prisma.tailoredResume.create({
    data: {
      userId: user.id,
      masterResumeId: masterResume.id,
      jobAnalysisId: analysis.id,
      title: "Axiata Digital - Power BI Analyst",
      markdown: "# Tailored Resume\n\nATS-safe resume draft from verified master resume evidence.",
      truthMap: {
        PowerBI: "Master resume lists Power BI dashboard reporting.",
        SQL: "Master resume lists SQL analysis and troubleshooting."
      },
      unsupportedClaims: [],
      status: "READY"
    }
  });

  const coverLetter = await prisma.coverLetter.create({
    data: {
      userId: user.id,
      jobAnalysisId: analysis.id,
      title: "Axiata Digital - Power BI Analyst Cover Letter",
      body: "Concise cover letter draft based only on verified resume evidence.",
      emailSubject: "Application for Power BI Analyst",
      emailBody: "Hi Hiring Team,\n\nI would like to apply for the Power BI Analyst role..."
    }
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      jobListingId: job.id,
      tailoredResumeId: tailoredResume.id,
      coverLetterId: coverLetter.id,
      status: "TAILORED",
      applyMethod: "company_site",
      applyUrl: job.officialApplyLink,
      hrEmail: job.hrEmail,
      events: {
        create: {
          status: "TAILORED",
          note: "Tailored resume and cover letter are ready."
        }
      }
    }
  });

  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: "PRO",
      status: "TRIALING"
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
