import {
  analyzeJobAgainstResume,
  parseResumeProfile,
  sanitizeJobDescription,
  type CompanyType,
  type FitResult,
  type JobCategory,
  type JobListing,
  type PromptSafetyResult,
  type WorkMode
} from "./applysharp";

export type JobExtractionInput = {
  jobDescription?: string;
  sourceUrl?: string;
  roleFallback?: string;
  locationFallback?: string;
  resumeText?: string;
};

export type JobExtractionResult = {
  job: JobListing;
  fit: FitResult | null;
  sourceText: string;
  promptSafety: PromptSafetyResult;
  warnings: string[];
};

const keywordCandidates = [
  "SQL",
  "Power BI",
  "Excel",
  "Python",
  "BigQuery",
  "Grafana",
  "Laravel",
  "PHP",
  "MySQL",
  "PostgreSQL",
  "dashboard",
  "reporting",
  "analytics",
  "data analysis",
  "business intelligence",
  "application support",
  "incident management",
  "SLA",
  "monitoring",
  "automation",
  "stakeholder management",
  "requirements gathering"
];

const locationDistance: Record<string, { distanceKm: number; commuteMinutes: number; label: string }> = {
  glenmarie: { distanceKm: 9, commuteMinutes: 18, label: "Glenmarie, Shah Alam" },
  "shah alam": { distanceKm: 13, commuteMinutes: 25, label: "Shah Alam, Selangor" },
  "bukit jelutong": { distanceKm: 0, commuteMinutes: 0, label: "Bukit Jelutong, Shah Alam" },
  "petaling jaya": { distanceKm: 16, commuteMinutes: 32, label: "Petaling Jaya" },
  "subang jaya": { distanceKm: 17, commuteMinutes: 35, label: "Subang Jaya" },
  kelana: { distanceKm: 18, commuteMinutes: 35, label: "Kelana Jaya" },
  "kuala lumpur": { distanceKm: 30, commuteMinutes: 55, label: "Kuala Lumpur" },
  cyberjaya: { distanceKm: 35, commuteMinutes: 50, label: "Cyberjaya" },
  remote: { distanceKm: 0, commuteMinutes: 0, label: "Remote Malaysia" }
};

export function extractJobListingFromText(input: JobExtractionInput): JobExtractionResult {
  const sourceText = normalizeSourceText(input.jobDescription ?? "");
  const promptSafety = sanitizeJobDescription(sourceText);
  const safeText = promptSafety.safeText;
  const warnings = [...promptSafety.warnings];

  if (safeText.length < 20) {
    throw new Error("Provide a full job description or a reachable job URL.");
  }

  const sourceUrl = input.sourceUrl?.trim();
  const sourcePlatform = detectSourcePlatform(safeText, sourceUrl);
  const title = extractTitle(safeText, input.roleFallback);
  const company = extractCompany(safeText, sourceUrl);
  const location = extractLocation(safeText, input.locationFallback);
  const workMode = detectWorkMode(safeText, location);
  const companyType = classifyCompanyType(company, safeText);
  const category = classifyCategory(title, safeText, companyType, workMode);
  const distance = estimateDistance(location, workMode);
  const requirements = extractSectionItems(safeText, ["requirements", "qualification", "skills", "must have", "what you need"]);
  const responsibilities = extractSectionItems(safeText, ["responsibilities", "job description", "what you will do", "duties", "role"]);
  const atsKeywords = extractAtsKeywords(safeText);
  const hrEmail = extractEmail(safeText);
  const applyLink = extractApplyLink(safeText, sourceUrl);
  const postedAgeDays = extractPostedAgeDays(safeText);

  if (!requirements.length && !atsKeywords.length) {
    warnings.push("Could not extract clear requirements; paste a fuller JD before applying.");
  }
  if (company === "Unknown Company") {
    warnings.push("Company could not be confidently extracted.");
  }

  const job: JobListing = {
    id: `job_${slugify(`${company}-${title}`) || "manual"}_${Date.now()}`,
    title,
    company,
    companyType,
    category,
    location,
    distanceKmFromBukitJelutong: distance.distanceKm,
    estimatedCommuteMinutes: distance.commuteMinutes,
    mapLink: buildMapLink(location),
    salary: extractSalary(safeText),
    source: sourceUrl || sourcePlatform,
    sourcePlatform,
    workMode,
    experienceLevel: detectExperienceLevel(title, safeText),
    applyLink,
    hrEmail,
    requirements: requirements.length ? requirements : atsKeywords.slice(0, 8),
    responsibilities,
    atsKeywords,
    postedAgeDays
  };
  const fit = input.resumeText ? analyzeJobAgainstResume(parseResumeProfile(input.resumeText), job) : null;

  return {
    job,
    fit,
    sourceText: safeText,
    promptSafety,
    warnings
  };
}

export function htmlToJobText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|section|article|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalizeSourceText(value: string): string {
  return htmlToJobText(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 120_000);
}

function extractTitle(text: string, fallback?: string): string {
  const labeled = matchLineValue(text, ["job title", "position", "role", "title"]);
  if (labeled) {
    return cleanTitle(labeled);
  }

  const candidate = text
    .split(/\n/)
    .find((line) => /\b(analyst|developer|engineer|support|operations|dashboard|reporting|data|business intelligence)\b/i.test(line) && line.length <= 90);

  return cleanTitle(candidate || fallback || "Analyst Role");
}

function extractCompany(text: string, sourceUrl?: string): string {
  const labeled = matchLineValue(text, ["company", "employer", "hiring company", "organisation", "organization"]);
  if (labeled) {
    return cleanupValue(labeled);
  }

  const atMatch = text.match(/\b(?:at|with)\s+([A-Z][A-Za-z0-9&.' -]{2,60})(?:\s+is|\s+seeks|\s+for|\n|$)/);
  if (atMatch) {
    return cleanupValue(atMatch[1]);
  }

  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
      return hostname.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    } catch {
      return "Unknown Company";
    }
  }

  return "Unknown Company";
}

function extractLocation(text: string, fallback?: string): string {
  const labeled = matchLineValue(text, ["location", "work location", "office", "based in"]);
  if (labeled) {
    return cleanupValue(labeled);
  }

  const lower = text.toLowerCase();
  const matched = Object.keys(locationDistance).find((location) => lower.includes(location));
  if (matched) {
    return locationDistance[matched].label;
  }

  return fallback || "Selangor";
}

function extractSalary(text: string): string {
  const salary = text.match(/\b(?:RM|MYR)\s?[\d,]+(?:\s?[-–]\s?(?:RM|MYR)?\s?[\d,]+)?(?:\s?(?:per month|monthly|\/month|p\.m\.|pa|per annum))?/i);

  return salary ? cleanupValue(salary[0]) : "Not disclosed";
}

function detectSourcePlatform(text: string, sourceUrl?: string): JobListing["sourcePlatform"] {
  const source = `${text} ${sourceUrl ?? ""}`.toLowerCase();
  if (source.includes("jobstreet")) return "JobStreet";
  if (source.includes("indeed")) return "Indeed";
  if (source.includes("linkedin")) return "LinkedIn";
  if (sourceUrl) return "Company Site";

  return "Public Listing";
}

function detectWorkMode(text: string, location: string): WorkMode {
  const lower = `${text} ${location}`.toLowerCase();
  if (/\b(remote|work from home|wfh)\b/.test(lower)) return "Remote";
  if (/\bhybrid\b/.test(lower)) return "Hybrid";
  if (/\b(onsite|on-site|office based|office-based)\b/.test(lower)) return "On-site";

  return "Hybrid";
}

function detectExperienceLevel(title: string, text: string): JobListing["experienceLevel"] {
  const lower = `${title} ${text}`.toLowerCase();
  if (/\b(fresh graduate|graduate trainee|entry level|internship)\b/.test(lower)) return "Fresh Graduate";
  if (/\b(entry|junior|associate)\b/.test(lower)) return "Junior";
  if (/\b(senior|lead|manager|principal)\b/.test(lower)) return "Senior";
  if (/\b(mid|2\+ years|3\+ years|4\+ years|5\+ years)\b/.test(lower)) return "Mid";

  return "Junior";
}

function classifyCompanyType(company: string, text: string): CompanyType {
  const lower = `${company} ${text}`.toLowerCase();
  if (/\b(government|kementerian|glc|petronas|tnb|tm\b|mdec|maybank|khazanah)\b/.test(lower)) return "GLC";
  if (/\b(mnc|global|regional|multinational|accenture|deloitte|ibm|microsoft|oracle|amazon|google)\b/.test(lower)) return "MNC";
  if (/\b(startup|scaleup|venture backed|seed|series a|saas)\b/.test(lower)) return "Startup";
  if (/\b(recruiter|recruitment|agency|headhunter|talent search)\b/.test(lower)) return "Agency";
  if (/\b(sdn bhd|sme|small medium)\b/.test(lower)) return "SME";

  return "Other";
}

function classifyCategory(title: string, text: string, companyType: CompanyType, workMode: WorkMode): JobCategory {
  const lower = `${title} ${text}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(lower)) return "Internship";
  if (/\b(fresh graduate|graduate trainee)\b/.test(lower)) return "Fresh Graduate";
  if (/\b(contract|6 months|12 months)\b/.test(lower)) return "Contract";
  if (workMode === "Remote") return "Remote";
  if (companyType === "MNC" || companyType === "SME") return companyType;

  return "Others";
}

function extractSectionItems(text: string, headings: string[]): string[] {
  const lines = text.split(/\n/);
  const items: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    if (!headings.some((heading) => line.includes(heading))) {
      continue;
    }

    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 12); cursor += 1) {
      const item = lines[cursor].replace(/^[-*•\d.)\s]+/, "").trim();
      if (!item || /^(requirements|responsibilities|benefits|about|salary|location)\b/i.test(item)) {
        break;
      }
      if (item.length >= 3 && item.length <= 160) {
        items.push(item);
      }
    }
  }

  return unique(items).slice(0, 12);
}

function extractAtsKeywords(text: string): string[] {
  const lower = text.toLowerCase();

  return unique(keywordCandidates.filter((keyword) => lower.includes(keyword.toLowerCase()))).slice(0, 16);
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractApplyLink(text: string, sourceUrl?: string): string {
  const link = text.match(/https?:\/\/[^\s)"]+/i)?.[0];

  return link || sourceUrl || "";
}

function extractPostedAgeDays(text: string): number {
  const lower = text.toLowerCase();
  if (/\btoday\b|just posted|baru/.test(lower)) return 0;
  const days = lower.match(/\b(\d{1,2})\s+days?\s+ago\b/);
  if (days) return Number(days[1]);
  if (/\b1-3 days\b/.test(lower)) return 2;
  if (/\b4-7 days\b/.test(lower)) return 5;
  if (/\b15\+ days\b/.test(lower)) return 16;

  return 3;
}

function estimateDistance(location: string, workMode: WorkMode): { distanceKm: number; commuteMinutes: number } {
  if (workMode === "Remote") {
    return { distanceKm: 0, commuteMinutes: 0 };
  }

  const lower = location.toLowerCase();
  const key = Object.keys(locationDistance).find((candidate) => lower.includes(candidate));
  if (key) {
    return locationDistance[key];
  }

  return { distanceKm: 20, commuteMinutes: 40 };
}

function buildMapLink(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Bukit Jelutong, Shah Alam")}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function matchLineValue(text: string, labels: string[]): string | null {
  for (const line of text.split(/\n/)) {
    const match = line.match(/^([A-Za-z /-]{2,30})\s*:\s*(.+)$/);
    if (match && labels.includes(match[1].trim().toLowerCase())) {
      return match[2].trim();
    }
  }

  return null;
}

function cleanTitle(value: string): string {
  return cleanupValue(value).replace(/\s*\|\s*.+$/, "").slice(0, 90);
}

function cleanupValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.;,\s]+$/g, "").trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
