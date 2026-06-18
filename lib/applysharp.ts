import { buildMailtoHref } from "./apply-actions";

export const companyTypes = ["MNC", "SME", "Startup", "Agency", "GLC", "Other"] as const;
export const jobCategories = ["MNC", "SME", "Fresh Graduate", "Remote", "Internship", "Contract", "Others"] as const;
export const workModes = ["Remote", "Hybrid", "On-site"] as const;
export const applicationStatuses = ["saved", "tailored", "downloaded", "applied", "interview", "rejected", "offer", "archived"] as const;

export type CompanyType = (typeof companyTypes)[number];
export type JobCategory = (typeof jobCategories)[number];
export type WorkMode = (typeof workModes)[number];
export type ApplicationStatus = (typeof applicationStatuses)[number];

export type ResumeProfile = {
  summary: string;
  skills: string[];
  tools: string[];
  industries: string[];
  achievements: string[];
  education: string[];
  strengths: string[];
  gaps: string[];
  keywords: string[];
};

export type JobListing = {
  id: string;
  title: string;
  company: string;
  companyType: CompanyType;
  category: JobCategory;
  location: string;
  distanceKmFromBukitJelutong?: number;
  estimatedCommuteMinutes?: number;
  mapLink?: string;
  salary: string;
  source: string;
  sourcePlatform: "JobStreet" | "Indeed" | "LinkedIn" | "Company Site" | "Public Listing";
  workMode: WorkMode;
  experienceLevel: "Fresh Graduate" | "Entry" | "Junior" | "Mid" | "Senior";
  applyLink: string;
  hrEmail?: string;
  requirements: string[];
  responsibilities: string[];
  atsKeywords: string[];
  postedAgeDays: number;
};

export type FitResult = {
  fitScore: number;
  atsScore: number;
  locationScore: number;
  decision: "Strong Apply" | "Apply" | "Stretch" | "Skip";
  missingKeywords: string[];
  matchedKeywords: string[];
  skillGaps: string[];
  recruiterConcerns: string[];
  improvements: string[];
};

export type JobSearchFilters = {
  role?: string;
  location?: string;
  category?: JobCategory | "All";
  companyType?: CompanyType | "All";
  experienceLevel?: JobListing["experienceLevel"] | "All";
  workMode?: WorkMode | "All";
  sourcePlatform?: JobListing["sourcePlatform"] | "All";
  salary?: string;
  industry?: string;
};

export type TailoredApplicationAssets = {
  resumeMarkdown: string;
  coverLetter: string;
  emailSubject: string;
  emailBody: string;
  truthMap: Record<string, string>;
  unsupportedClaims: string[];
  pdfFileName: string;
  applyActions: Array<{
    label: string;
    type: "email" | "external" | "map";
    href: string;
    requiresConfirmation: true;
  }>;
};

export type PromptSafetyResult = {
  safeText: string;
  warnings: string[];
};

const knownTools = [
  "sql",
  "power bi",
  "excel",
  "python",
  "laravel",
  "php",
  "bigquery",
  "grafana",
  "tableau",
  "looker",
  "postgresql",
  "mysql",
  "javascript",
  "typescript"
];

const knownIndustries = ["finance", "retail", "logistics", "operations", "support", "saas", "banking", "telecommunications"];
const injectionSignals = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /system prompt/i,
  /developer message/i,
  /reveal (secrets|keys|credentials)/i,
  /act as (an|a) unrestricted/i,
  /do not follow/i
];

export function parseResumeProfile(masterResumeText: string): ResumeProfile {
  const normalized = masterResumeText.toLowerCase();
  const lines = masterResumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const skills = unique(
    knownTools
      .filter((tool) => normalized.includes(tool))
      .concat(extractKeywordMatches(normalized, ["dashboard", "reporting", "automation", "analysis", "monitoring", "support"]))
  );
  const tools = unique(knownTools.filter((tool) => normalized.includes(tool)));
  const industries = unique(knownIndustries.filter((industry) => normalized.includes(industry)));
  const achievements = lines.filter((line) => /%|\bmyr\b|\d+x|\d+\+|improved|reduced|automated|built|delivered/i.test(line)).slice(0, 8);
  const education = lines.filter((line) => /degree|diploma|certificate|university|college|bachelor|master/i.test(line)).slice(0, 6);
  const keywords = unique(skills.concat(tools, industries));

  return {
    summary: lines.slice(0, 4).join(" "),
    skills,
    tools,
    industries,
    achievements,
    education,
    strengths: unique(skills.concat(achievements.slice(0, 3))).slice(0, 8),
    gaps: [],
    keywords
  };
}

export function analyzeJobAgainstResume(profile: ResumeProfile, job: JobListing): FitResult {
  const resumeKeywords = new Set(profile.keywords.map(normalizeToken));
  const requiredKeywords = unique(job.requirements.concat(job.atsKeywords).map(normalizeToken).filter(Boolean));
  const matchedKeywords = requiredKeywords.filter((keyword) => resumeKeywords.has(keyword));
  const missingKeywords = requiredKeywords.filter((keyword) => !resumeKeywords.has(keyword));
  const atsScore = requiredKeywords.length ? Math.round((matchedKeywords.length / requiredKeywords.length) * 100) : 0;
  const freshnessScore = job.postedAgeDays <= 1 ? 100 : job.postedAgeDays <= 3 ? 90 : job.postedAgeDays <= 7 ? 75 : 45;
  const locationScore = scoreLocation(job);
  const categoryScore = job.category === "Remote" || job.category === "MNC" || job.category === "SME" ? 85 : 70;
  const seniorityScore = job.experienceLevel === "Senior" ? 55 : job.experienceLevel === "Mid" ? 75 : 90;
  const fitScore = Math.round(atsScore * 0.38 + freshnessScore * 0.18 + locationScore * 0.17 + categoryScore * 0.12 + seniorityScore * 0.15);
  const skillGaps = missingKeywords.filter((keyword) => knownTools.includes(keyword)).slice(0, 8);
  const recruiterConcerns = buildRecruiterConcerns(job, atsScore, skillGaps);
  const improvements = buildImprovements(missingKeywords, matchedKeywords);

  return {
    fitScore,
    atsScore,
    locationScore,
    decision: decideFit(fitScore, atsScore, recruiterConcerns),
    missingKeywords,
    matchedKeywords,
    skillGaps,
    recruiterConcerns,
    improvements
  };
}

export function sanitizeJobDescription(jobDescription: string): PromptSafetyResult {
  const warnings = injectionSignals
    .filter((pattern) => pattern.test(jobDescription))
    .map((pattern) => `Potential prompt injection matched: ${pattern.source}`);
  const safeText = jobDescription
    .split(/\r?\n/)
    .filter((line) => !injectionSignals.some((pattern) => pattern.test(line)))
    .join("\n")
    .trim();

  return { safeText, warnings };
}

export function buildTailoredResumePrompt(masterResumeText: string, job: JobListing, fit: FitResult): string {
  return `Create an ATS-friendly tailored resume for this job.

Critical rules:
- Use only the master resume as the source of truth.
- Never invent skills, job history, certifications, salary, achievements, or seniority.
- Rewrite, reorganize, and emphasize only truthful existing evidence.
- Warn before adding any keyword not directly supported by the master resume.
- Keep output ATS-safe: no tables, no graphics, no columns.

Decision: ${fit.decision}
Fit score: ${fit.fitScore}
ATS score: ${fit.atsScore}
Matched keywords: ${fit.matchedKeywords.join(", ")}
Missing keywords: ${fit.missingKeywords.join(", ")}

Job:
${JSON.stringify(job, null, 2)}

Master resume:
${masterResumeText}

Output:
1. Tailored resume markdown.
2. Truth mapping for each added keyword.
3. Unsupported claims excluded.
4. Recruiter-readable summary.`;
}

export function buildCoverLetterPrompt(masterResumeText: string, job: JobListing, fit: FitResult): string {
  return `Write a concise cover letter and HR email for this application.

Rules:
- Use only true evidence from the master resume.
- Do not invent achievements or experience.
- Address the role and company directly.
- Keep it short and recruiter-readable.

Job title: ${job.title}
Company: ${job.company}
Decision: ${fit.decision}
Matched keywords: ${fit.matchedKeywords.join(", ")}

Master resume:
${masterResumeText}`;
}

export function searchJobListings(filters: JobSearchFilters): JobListing[] {
  const role = normalizeToken(filters.role ?? "");
  const location = normalizeToken(filters.location ?? "");
  const salary = normalizeToken(filters.salary ?? "");
  const industry = normalizeToken(filters.industry ?? "");

  const filtered = getJobCatalog().filter((job) => {
    const searchable = normalizeToken(
      [job.title, job.company, job.location, job.salary, job.requirements.join(" "), job.responsibilities.join(" "), job.atsKeywords.join(" ")].join(" ")
    );

    if (role && !searchable.includes(role)) {
      return false;
    }
    if (location && !normalizeToken(job.location).includes(location)) {
      return false;
    }
    if (salary && !normalizeToken(job.salary).includes(salary)) {
      return false;
    }
    if (industry && !searchable.includes(industry)) {
      return false;
    }
    if (filters.category && filters.category !== "All" && job.category !== filters.category) {
      return false;
    }
    if (filters.companyType && filters.companyType !== "All" && job.companyType !== filters.companyType) {
      return false;
    }
    if (filters.experienceLevel && filters.experienceLevel !== "All" && job.experienceLevel !== filters.experienceLevel) {
      return false;
    }
    if (filters.workMode && filters.workMode !== "All" && job.workMode !== filters.workMode) {
      return false;
    }
    if (filters.sourcePlatform && filters.sourcePlatform !== "All" && job.sourcePlatform !== filters.sourcePlatform) {
      return false;
    }

    return true;
  });

  return filtered.length ? filtered : getJobCatalog().slice(0, 4);
}

export function generateTailoredApplicationAssets(masterResumeText: string, job: JobListing, fit: FitResult): TailoredApplicationAssets {
  const profile = parseResumeProfile(masterResumeText);
  const safeName = `${job.company}-${job.title}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const truthMap = Object.fromEntries(fit.matchedKeywords.map((keyword) => [keyword, `Verified in master resume keywords: ${profile.keywords.join(", ")}`]));
  const unsupportedClaims = fit.missingKeywords.filter((keyword) => !profile.keywords.map(normalizeToken).includes(normalizeToken(keyword)));
  const topAchievements = profile.achievements.length ? profile.achievements : ["Add a verified measurable achievement from the master resume before finalizing."];
  const topSkills = unique(fit.matchedKeywords.concat(profile.skills)).slice(0, 10);

  const resumeMarkdown = `# ${profile.summary || "Candidate"}

## Professional Summary

${buildSummary(job, topSkills)}

## Core Skills

${topSkills.map((skill) => `- ${skill}`).join("\n")}

## Relevant Experience

${topAchievements.map((achievement) => `- ${achievement}`).join("\n")}

## ATS Keyword Alignment

${fit.matchedKeywords.map((keyword) => `- ${keyword} - supported by master resume evidence`).join("\n") || "- Add only verified matching keywords."}

## Unsupported JD Keywords To Review

${unsupportedClaims.map((keyword) => `- ${keyword} - do not add unless the user can verify it truthfully`).join("\n") || "- None"}
`;

  const coverLetter = `Dear Hiring Team,

I am applying for the ${job.title} role at ${job.company}. My strongest verified match is in ${topSkills.slice(0, 4).join(", ")}, with experience aligned to ${fit.matchedKeywords.slice(0, 4).join(", ") || "the role requirements"}.

I have tailored my resume to highlight only verified experience from my master resume and would welcome the opportunity to discuss how this background fits the role.

Thank you for your consideration.`;

  const emailSubject = `Application for ${job.title} - ${job.company}`;
  const emailBody = `Hi Hiring Team,

I would like to apply for the ${job.title} role at ${job.company}.

I have attached my tailored ATS-friendly resume and cover letter. The strongest match areas are ${topSkills.slice(0, 5).join(", ")}.

Thank you,
[Your Name]`;

  return {
    resumeMarkdown,
    coverLetter,
    emailSubject,
    emailBody,
    truthMap,
    unsupportedClaims,
    pdfFileName: `${safeName}-tailored-resume.pdf`,
    applyActions: buildApplyActions(job, emailSubject, emailBody)
  };
}

export function getSampleWorkspace() {
  const masterResumeText = [
    "Data and application support profile with SQL, Power BI, dashboard reporting, Grafana monitoring, Laravel/PHP support, and Python automation exposure.",
    "Built operational dashboards, automated reporting workflows, supported production issues, and translated business needs into clear metrics.",
    "Tools: SQL, Power BI, Excel, Grafana, BigQuery, Python, Laravel, PHP, MySQL."
  ].join("\n");
  const profile = parseResumeProfile(masterResumeText);
  const jobs: JobListing[] = [
    {
      id: "job_powerbi_mnc",
      title: "Power BI Analyst",
      company: "Axiata Digital",
      companyType: "MNC",
      category: "MNC",
      location: "Glenmarie, Shah Alam",
      distanceKmFromBukitJelutong: 9,
      estimatedCommuteMinutes: 18,
      mapLink: buildMapLink("Glenmarie, Shah Alam"),
      salary: "MYR 5,500 - 7,000",
      source: "Company careers",
      sourcePlatform: "Company Site",
      workMode: "Hybrid",
      experienceLevel: "Junior",
      applyLink: "https://www.axiata.com/careers",
      hrEmail: "careers@example.com",
      requirements: ["SQL", "Power BI", "dashboard", "reporting", "stakeholder analysis"],
      responsibilities: ["Build dashboards", "Analyze business metrics", "Prepare weekly reporting packs"],
      atsKeywords: ["Power BI", "SQL", "data analysis", "dashboard reporting", "business intelligence"],
      postedAgeDays: 1
    },
    {
      id: "job_support_sme",
      title: "Application Support Analyst",
      company: "Selangor Cloud Systems",
      companyType: "SME",
      category: "SME",
      location: "Shah Alam, Selangor",
      distanceKmFromBukitJelutong: 13,
      estimatedCommuteMinutes: 25,
      mapLink: buildMapLink("Shah Alam, Selangor"),
      salary: "MYR 4,500 - 6,000",
      source: "JobStreet",
      sourcePlatform: "JobStreet",
      workMode: "On-site",
      experienceLevel: "Junior",
      applyLink: "https://www.jobstreet.com.my/",
      requirements: ["Application support", "SQL", "incident management", "monitoring", "Excel"],
      responsibilities: ["Resolve support tickets", "Monitor systems", "Prepare SLA reports"],
      atsKeywords: ["application support", "SQL", "incident management", "Grafana", "SLA reporting"],
      postedAgeDays: 2
    }
  ];

  return {
    masterResumeText,
    profile,
    jobs: jobs.map((job) => ({
      job,
      fit: analyzeJobAgainstResume(profile, job)
    }))
  };
}

export function getJobCatalog(): JobListing[] {
  return [
    {
      id: "job_powerbi_mnc",
      title: "Power BI Analyst",
      company: "Axiata Digital",
      companyType: "MNC",
      category: "MNC",
      location: "Glenmarie, Shah Alam",
      distanceKmFromBukitJelutong: 9,
      estimatedCommuteMinutes: 18,
      mapLink: buildMapLink("Glenmarie, Shah Alam"),
      salary: "MYR 5,500 - 7,000",
      source: "Company careers",
      sourcePlatform: "Company Site",
      workMode: "Hybrid",
      experienceLevel: "Junior",
      applyLink: "https://www.axiata.com/careers",
      hrEmail: "careers@example.com",
      requirements: ["SQL", "Power BI", "dashboard", "reporting", "stakeholder analysis"],
      responsibilities: ["Build dashboards", "Analyze business metrics", "Prepare weekly reporting packs"],
      atsKeywords: ["Power BI", "SQL", "data analysis", "dashboard reporting", "business intelligence"],
      postedAgeDays: 1
    },
    {
      id: "job_support_sme",
      title: "Application Support Analyst",
      company: "Selangor Cloud Systems",
      companyType: "SME",
      category: "SME",
      location: "Shah Alam, Selangor",
      distanceKmFromBukitJelutong: 13,
      estimatedCommuteMinutes: 25,
      mapLink: buildMapLink("Shah Alam, Selangor"),
      salary: "MYR 4,500 - 6,000",
      source: "JobStreet",
      sourcePlatform: "JobStreet",
      workMode: "On-site",
      experienceLevel: "Junior",
      applyLink: "https://www.jobstreet.com.my/",
      requirements: ["Application support", "SQL", "incident management", "monitoring", "Excel"],
      responsibilities: ["Resolve support tickets", "Monitor systems", "Prepare SLA reports"],
      atsKeywords: ["application support", "SQL", "incident management", "Grafana", "SLA reporting"],
      postedAgeDays: 2
    },
    {
      id: "job_fresh_grad_analyst",
      title: "Graduate Data Analyst",
      company: "Maybank Shared Services",
      companyType: "MNC",
      category: "Fresh Graduate",
      location: "Petaling Jaya",
      distanceKmFromBukitJelutong: 16,
      estimatedCommuteMinutes: 32,
      mapLink: buildMapLink("Petaling Jaya"),
      salary: "MYR 3,800 - 4,800",
      source: "LinkedIn",
      sourcePlatform: "LinkedIn",
      workMode: "Hybrid",
      experienceLevel: "Fresh Graduate",
      applyLink: "https://www.linkedin.com/jobs/",
      requirements: ["Excel", "SQL", "data analysis", "dashboard"],
      responsibilities: ["Prepare analysis", "Maintain dashboards", "Support business reporting"],
      atsKeywords: ["graduate analyst", "SQL", "Excel", "dashboard", "data analysis"],
      postedAgeDays: 0
    },
    {
      id: "job_remote_reporting",
      title: "Remote Reporting Automation Specialist",
      company: "Regional SaaS Operations",
      companyType: "Startup",
      category: "Remote",
      location: "Remote Malaysia",
      distanceKmFromBukitJelutong: 0,
      estimatedCommuteMinutes: 0,
      mapLink: buildMapLink("Remote Malaysia"),
      salary: "MYR 6,000 - 8,500",
      source: "Public listing",
      sourcePlatform: "Public Listing",
      workMode: "Remote",
      experienceLevel: "Mid",
      applyLink: "https://example.com/apply/reporting-automation",
      requirements: ["Python", "SQL", "reporting", "automation", "dashboard"],
      responsibilities: ["Automate reports", "Build reporting workflows", "Improve operational visibility"],
      atsKeywords: ["Python automation", "SQL", "reporting automation", "dashboard"],
      postedAgeDays: 4
    },
    {
      id: "job_contract_bigquery",
      title: "Contract BigQuery Analyst",
      company: "DataWorks Malaysia",
      companyType: "SME",
      category: "Contract",
      location: "Subang Jaya",
      distanceKmFromBukitJelutong: 17,
      estimatedCommuteMinutes: 35,
      mapLink: buildMapLink("Subang Jaya"),
      salary: "MYR 7,000 - 9,000",
      source: "Indeed",
      sourcePlatform: "Indeed",
      workMode: "Hybrid",
      experienceLevel: "Mid",
      applyLink: "https://my.indeed.com/",
      requirements: ["BigQuery", "SQL", "dashboard", "stakeholder reporting"],
      responsibilities: ["Build BigQuery queries", "Create dashboard datasets", "Support reporting stakeholders"],
      atsKeywords: ["BigQuery", "SQL", "dashboard", "analytics"],
      postedAgeDays: 3
    }
  ];
}

function decideFit(fitScore: number, atsScore: number, concerns: string[]): FitResult["decision"] {
  if (concerns.some((concern) => concern.includes("seniority")) || atsScore < 45 || fitScore < 60) {
    return "Skip";
  }
  if (fitScore >= 90 && atsScore >= 80) {
    return "Strong Apply";
  }
  if (fitScore >= 78 && atsScore >= 65) {
    return "Apply";
  }
  return "Stretch";
}

function buildRecruiterConcerns(job: JobListing, atsScore: number, skillGaps: string[]): string[] {
  const concerns: string[] = [];

  if (job.experienceLevel === "Senior") {
    concerns.push("Possible seniority mismatch; verify leadership scope before applying.");
  }
  if (atsScore < 65) {
    concerns.push("ATS score is below the apply threshold.");
  }
  if (skillGaps.length > 0) {
    concerns.push(`Tool gaps: ${skillGaps.join(", ")}.`);
  }
  if (job.workMode !== "Remote" && typeof job.distanceKmFromBukitJelutong === "number" && job.distanceKmFromBukitJelutong > 15) {
    concerns.push("Outside the preferred 10-15km Bukit Jelutong commute range.");
  }

  return concerns;
}

function buildImprovements(missingKeywords: string[], matchedKeywords: string[]): string[] {
  const improvements = [
    "Move the strongest matching experience into the top third of the resume.",
    "Mirror exact JD wording where it is already truthful in the master resume."
  ];

  if (missingKeywords.length > 0) {
    improvements.push(`Do not add unsupported keywords without evidence: ${missingKeywords.slice(0, 5).join(", ")}.`);
  }
  if (matchedKeywords.length > 0) {
    improvements.push(`Emphasize verified keywords: ${matchedKeywords.slice(0, 5).join(", ")}.`);
  }

  return improvements;
}

function buildSummary(job: JobListing, skills: string[]): string {
  const skillText = skills.slice(0, 5).join(", ");

  return `Candidate profile tailored for ${job.title} at ${job.company}, emphasizing verified experience in ${skillText || "relevant resume evidence"}.`;
}

export function buildApplyActions(job: JobListing, emailSubject?: string, emailBody?: string): TailoredApplicationAssets["applyActions"] {
  const actions: TailoredApplicationAssets["applyActions"] = [];

  if (job.hrEmail) {
    actions.push({
      label: "Email HR",
      type: "email",
      href: buildMailtoHref(job.hrEmail, emailSubject || `Application for ${job.title}`, emailBody || ""),
      requiresConfirmation: true
    });
  }

  actions.push({
    label: `Open ${job.sourcePlatform} apply link`,
    type: "external",
    href: job.applyLink,
    requiresConfirmation: true
  });

  if (job.mapLink) {
    actions.push({
      label: "Open commute map",
      type: "map",
      href: job.mapLink,
      requiresConfirmation: true
    });
  }

  return actions;
}

export function scoreLocation(job: JobListing): number {
  if (job.workMode === "Remote") {
    return 100;
  }
  if (typeof job.distanceKmFromBukitJelutong !== "number") {
    return 65;
  }
  if (job.workMode === "Hybrid" && job.distanceKmFromBukitJelutong <= 30) {
    return 90;
  }
  if (job.distanceKmFromBukitJelutong <= 15) {
    return 90;
  }
  if (job.distanceKmFromBukitJelutong <= 30) {
    return 70;
  }
  if (job.distanceKmFromBukitJelutong <= 50) {
    return 40;
  }

  return 20;
}

function buildMapLink(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Bukit Jelutong, Shah Alam")}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function extractKeywordMatches(text: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => text.includes(candidate));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
