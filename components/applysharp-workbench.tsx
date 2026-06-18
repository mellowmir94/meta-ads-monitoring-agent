"use client";

import { applicationStatuses, type ApplicationStatus, type CompanyType, type FitResult, type JobCategory, type JobListing, type ResumeProfile, type TailoredApplicationAssets } from "@/lib/applysharp";
import { buildMailtoHref, splitEmailDraft } from "@/lib/apply-actions";
import type { ApplicationRecord } from "@/lib/application-store";
import { buildResumeVersionHistory, summarizeResumeVersionHistory } from "@/lib/resume-version-history";
import { AlertTriangle, ArrowUpRight, Download, FileText, Mail, MapPin, Search, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

type SearchResult = {
  job: JobListing;
  fit: FitResult | null;
};

type MasterResumeClientRecord = {
  id: string;
  title: string;
  rawText: string;
  profile: ResumeProfile;
  source: "paste" | "upload" | "import";
  originalFileName?: string;
  updatedAt: string;
};

const starterResume = `Data and application support profile with SQL, Power BI, dashboard reporting, Grafana monitoring, Laravel/PHP support, and Python automation exposure.
Built operational dashboards, automated reporting workflows, supported production issues, and translated business needs into clear metrics.
Tools: SQL, Power BI, Excel, Grafana, BigQuery, Python, Laravel, PHP, MySQL.`;

export function ApplySharpWorkbench() {
  const [resumeText, setResumeText] = useState(starterResume);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [masterResumeTitle, setMasterResumeTitle] = useState("Active Master Resume");
  const [activeMasterResume, setActiveMasterResume] = useState<MasterResumeClientRecord | null>(null);
  const [role, setRole] = useState("Analyst");
  const [location, setLocation] = useState("Selangor");
  const [category, setCategory] = useState<JobCategory | "All">("All");
  const [companyType, setCompanyType] = useState<CompanyType | "All">("All");
  const [experienceLevel, setExperienceLevel] = useState<JobListing["experienceLevel"] | "All">("All");
  const [workMode, setWorkMode] = useState<JobListing["workMode"] | "All">("All");
  const [sourcePlatform, setSourcePlatform] = useState<JobListing["sourcePlatform"] | "All">("All");
  const [salary, setSalary] = useState("");
  const [industry, setIndustry] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobs, setJobs] = useState<SearchResult[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [assets, setAssets] = useState<TailoredApplicationAssets | null>(null);
  const [resumeDraft, setResumeDraft] = useState("");
  const [coverDraft, setCoverDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [savedApplications, setSavedApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const resumeVersions = buildResumeVersionHistory(savedApplications);
  const resumeVersionSummary = summarizeResumeVersionHistory(resumeVersions);

  useEffect(() => {
    loadSavedApplications();
    loadActiveMasterResume();
  }, []);

  function persistApplications(next: ApplicationRecord[]) {
    setSavedApplications(next);
    window.localStorage.setItem("applysharp-applications", JSON.stringify(next));
  }

  async function loadSavedApplications() {
    try {
      const response = await fetch("/api/applications");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Application tracker load failed");
      }
      persistApplications(payload.applications);
    } catch {
      const saved = window.localStorage.getItem("applysharp-applications");
      if (saved) {
        setSavedApplications(JSON.parse(saved).map(normalizeStoredApplication).filter(Boolean));
      }
    }
  }

  async function loadActiveMasterResume() {
    try {
      const response = await fetch("/api/master-resume");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Master resume load failed");
      }
      if (payload.active) {
        setActiveMasterResume(payload.active);
        setMasterResumeTitle(payload.active.title);
        setResumeText(payload.active.rawText);
        setProfile(payload.active.profile);
        setMessage("Active master resume loaded");
      }
    } catch {
      // Keep starter resume available for first-run local use.
    }
  }

  async function parseResume() {
    setLoading(true);
    setMessage("Parsing and saving master resume");

    try {
      const response = await fetch("/api/resumes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Resume parsing failed");
      }
      setProfile(payload.profile);
      await saveMasterResumeSnapshot(resumeText, "paste");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resume parsing failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResumeFile(file: File | null) {
    if (!file) {
      return;
    }

    setLoading(true);
    setMessage(`Uploading ${file.name}`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resumes/upload", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Resume upload parsing failed");
      }

      setResumeText(payload.resumeText);
      setProfile(payload.profile);
      await saveMasterResumeSnapshot(payload.resumeText, "upload", {
        originalFileName: payload.file.name,
        fileType: payload.file.type,
        sizeBytes: payload.file.sizeBytes
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resume upload parsing failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveMasterResumeSnapshot(
    text: string,
    source: MasterResumeClientRecord["source"],
    file?: { originalFileName?: string; fileType?: string; sizeBytes?: number }
  ) {
    const response = await fetch("/api/master-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: masterResumeTitle,
        resumeText: text,
        source,
        ...file
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Master resume save failed");
    }

    setActiveMasterResume(payload.masterResume);
    setMasterResumeTitle(payload.masterResume.title);
    setProfile(payload.masterResume.profile);
    setMessage(`Active master resume saved${payload.warning ? " with storage fallback" : ""}`);
  }

  async function searchJobs() {
    setLoading(true);
    setMessage("Searching jobs");

    try {
      const response = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, role, location, salary, industry, category, companyType, experienceLevel, workMode, sourcePlatform })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Job search failed");
      }
      setJobs(payload.jobs);
      setSelectedJob(payload.jobs[0]?.job ?? null);
      setFit(payload.jobs[0]?.fit ?? null);
      setAssets(null);
      setMessage(`${payload.jobs.length} jobs found`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job search failed");
    } finally {
      setLoading(false);
    }
  }

  async function extractJobDescription() {
    if (!jobDescription.trim() && !jobUrl.trim()) {
      setMessage("Paste a JD or job URL first");
      return;
    }

    setLoading(true);
    setMessage("Extracting JD");

    try {
      const response = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          sourceUrl: jobUrl || undefined,
          fetchUrl: Boolean(jobUrl && !jobDescription.trim()),
          roleFallback: role,
          locationFallback: location,
          resumeText
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "JD extraction failed");
      }

      setJobs([{ job: payload.job, fit: payload.fit }]);
      setSelectedJob(payload.job);
      setFit(payload.fit);
      setAssets(null);
      setMessage(`JD extracted: ${payload.job.title} at ${payload.job.company}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JD extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeSelectedJob(job = selectedJob) {
    if (!job) {
      setMessage("Select a job first");
      return;
    }

    setLoading(true);
    setMessage("Analyzing JD");

    try {
      const response = await fetch("/api/jobs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          job,
          jobDescription: buildJobDescription(job)
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Job analysis failed");
      }
      setSelectedJob(payload.job);
      setFit(payload.fit);
      setAssets(payload.assets);
      setResumeDraft(payload.assets.resumeMarkdown);
      setCoverDraft(payload.assets.coverLetter);
      setEmailDraft(`${payload.assets.emailSubject}\n\n${payload.assets.emailBody}`);
      setMessage("Analysis ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveApplication(status: ApplicationStatus = "saved") {
    if (!selectedJob || !fit) {
      setMessage("Analyze a job first");
      return;
    }

    const emailParts = emailDraft.split(/\r?\n/);

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          job: selectedJob,
          fit,
          resumeMarkdown: resumeDraft || assets?.resumeMarkdown,
          pdfFileName: assets?.pdfFileName,
          coverLetter: coverDraft || assets?.coverLetter,
          emailSubject: emailParts[0] || assets?.emailSubject,
          emailBody: emailParts.slice(1).join("\n").trim() || assets?.emailBody,
          note: `Saved from ApplySharp workbench as ${status}.`
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Application save failed");
      }

      persistApplications([payload.application, ...savedApplications.filter((application) => application.id !== payload.application.id)]);
      setMessage(`Application saved as ${status}`);
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}; saved locally` : "Application save failed; saved locally");
      persistApplications([createLocalApplicationRecord(status, selectedJob, fit, assets, resumeDraft, coverDraft, emailDraft), ...savedApplications]);
    }
  }

  function downloadResume() {
    if (!resumeDraft) {
      setMessage("Generate a tailored resume first");
      return;
    }

    const blob = new Blob([resumeDraft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = assets?.pdfFileName.replace(/\.pdf$/, ".md") ?? "tailored-resume.md";
    link.click();
    URL.revokeObjectURL(url);
    void saveApplication("downloaded");
  }

  async function downloadPdfResume() {
    if (!resumeDraft) {
      setMessage("Generate a tailored resume first");
      return;
    }

    setLoading(true);
    setMessage("Generating ATS PDF");

    try {
      const response = await fetch("/api/resumes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeMarkdown: resumeDraft,
          fileName: assets?.pdfFileName ?? "tailored-resume.pdf",
          title: selectedJob ? `${selectedJob.company} - ${selectedJob.title}` : "Tailored ATS Resume"
        })
      });

      if (!response.ok) {
        let errorMessage = "PDF generation failed";
        try {
          const payload = await response.json();
          errorMessage = payload.error ?? errorMessage;
        } catch {
          // Keep the generic message if the server did not return JSON.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = assets?.pdfFileName ?? "tailored-resume.pdf";
      link.click();
      URL.revokeObjectURL(url);
      await saveApplication("downloaded");
      setMessage("ATS PDF downloaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF generation failed");
    } finally {
      setLoading(false);
    }
  }

  function openApplyAction(action: TailoredApplicationAssets["applyActions"][number]) {
    const href = resolveApplyActionHref(action);

    if (!window.confirm(`Open ${action.label}? Review everything before submitting. ApplySharp will not auto-submit or mark this as applied yet.`)) {
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
    if (action.type !== "map") {
      void saveApplication("tailored");
    }
    setMessage("Apply channel opened. Submit manually, then click Mark applied after submission.");
  }

  function resolveApplyActionHref(action: TailoredApplicationAssets["applyActions"][number]) {
    if (action.type === "email" && selectedJob?.hrEmail) {
      const emailParts = splitEmailDraft(emailDraft);

      return buildMailtoHref(selectedJob.hrEmail, emailParts.subject || assets?.emailSubject || `Application for ${selectedJob.title}`, emailParts.body || assets?.emailBody || "");
    }

    return action.href;
  }

  async function markAppliedAfterSubmission() {
    if (!selectedJob || !fit) {
      setMessage("Analyze a job first");
      return;
    }
    if (!window.confirm("Mark as applied only after you manually submitted the application on email or the official job site.")) {
      return;
    }
    await saveApplication("applied");
    setMessage("Application marked as applied");
  }

  async function updateSavedApplicationStatus(application: ApplicationRecord, status: ApplicationStatus) {
    const timestamp = new Date().toISOString();
    const localUpdate: ApplicationRecord = {
      ...application,
      status,
      updatedAt: timestamp,
      statusHistory: [{ status, note: "Updated from tracker UI.", at: timestamp }, ...application.statusHistory]
    };

    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: "Updated from tracker UI." })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Status update failed");
      }

      persistApplications(savedApplications.map((item) => (item.id === application.id ? payload.application : item)));
      setMessage(`Application moved to ${status}`);
    } catch (error) {
      persistApplications(savedApplications.map((item) => (item.id === application.id ? localUpdate : item)));
      setMessage(error instanceof Error ? `${error.message}; updated locally` : "Status update failed; updated locally");
    }
  }

  async function deleteSavedApplication(application: ApplicationRecord) {
    if (!window.confirm(`Delete ${application.job.title} at ${application.job.company}? This removes the saved resume, cover letter, email draft, score, and tracker history from ApplySharp.`)) {
      return;
    }

    const nextApplications = savedApplications.filter((item) => item.id !== application.id);

    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Application delete failed");
      }

      persistApplications(nextApplications);
      setMessage("Application record deleted");
    } catch (error) {
      persistApplications(nextApplications);
      setMessage(error instanceof Error ? `${error.message}; removed locally` : "Application delete failed; removed locally");
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="flex flex-col gap-4">
        <Panel title="1. Upload and parse master resume" icon={<UploadCloud className="h-5 w-5 text-palm" />}>
          <div className="mb-3 rounded-md border border-line bg-field p-3 text-sm text-ink/65">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Active source: {activeMasterResume ? `${activeMasterResume.title} / ${activeMasterResume.source}` : "not saved yet"}
              </span>
              <span>{activeMasterResume ? new Date(activeMasterResume.updatedAt).toLocaleString() : "Paste or upload once to save."}</span>
            </div>
          </div>
          <Input label="Master resume title" value={masterResumeTitle} onChange={setMasterResumeTitle} placeholder="Active Master Resume" />
          <input
            className="mb-3 mt-3 w-full rounded-md border border-line bg-field px-3 py-2 text-sm"
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx"
            onChange={(event) => handleResumeFile(event.target.files?.[0] ?? null)}
          />
          <textarea
            className="min-h-40 w-full rounded-md border border-line bg-white p-3 text-sm"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-md bg-palm px-3 py-2 text-sm font-semibold text-white" onClick={parseResume} disabled={loading}>
              Parse and save active resume
            </button>
            <button className="rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold" onClick={() => setResumeText("")}>
              Clear
            </button>
          </div>
          {profile ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.keywords.map((keyword) => (
                <span key={keyword} className="rounded-sm bg-skyglass px-2 py-1 text-xs font-semibold text-palm">
                  {keyword}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink/60">No parsed profile yet.</p>
          )}
        </Panel>

        <Panel title="2. Search suitable jobs" icon={<Search className="h-5 w-5 text-palm" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Target role" value={role} onChange={setRole} />
            <Input label="Location" value={location} onChange={setLocation} />
            <Input label="Salary keyword" value={salary} onChange={setSalary} placeholder="MYR 5,000 / 7,000 / Not disclosed" />
            <Input label="Industry keyword" value={industry} onChange={setIndustry} placeholder="SaaS / finance / support" />
            <Select label="Company type" value={companyType} onChange={(value) => setCompanyType(value as CompanyType | "All")} values={["All", "MNC", "SME", "Startup", "Agency", "GLC", "Other"]} />
            <Select label="Experience level" value={experienceLevel} onChange={(value) => setExperienceLevel(value as JobListing["experienceLevel"] | "All")} values={["All", "Fresh Graduate", "Entry", "Junior", "Mid", "Senior"]} />
            <Select label="Work mode" value={workMode} onChange={(value) => setWorkMode(value as JobListing["workMode"] | "All")} values={["All", "Remote", "Hybrid", "On-site"]} />
            <Select label="Source" value={sourcePlatform} onChange={(value) => setSourcePlatform(value as JobListing["sourcePlatform"] | "All")} values={["All", "JobStreet", "Indeed", "LinkedIn", "Company Site", "Public Listing"]} />
          </div>
          <CategoryButtons value={category} onChange={setCategory} />
          <button className="mt-3 rounded-md bg-palm px-3 py-2 text-sm font-semibold text-white" onClick={searchJobs} disabled={loading}>
            Search jobs
          </button>
        </Panel>

        <Panel title="2b. Extract pasted JD or URL" icon={<Sparkles className="h-5 w-5 text-palm" />}>
          <Input label="Job URL" value={jobUrl} onChange={setJobUrl} />
          <label className="mt-3 grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">Full job description</span>
            <textarea
              className="min-h-36 rounded-md border border-line bg-white px-3 py-2"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Paste the full JD from JobStreet, LinkedIn, Indeed, company site, or HR email."
            />
          </label>
          <button className="mt-3 rounded-md bg-palm px-3 py-2 text-sm font-semibold text-white" onClick={extractJobDescription} disabled={loading}>
            Extract JD
          </button>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-line bg-ink p-4 text-white shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Live workflow</h2>
              <p className="mt-1 text-sm text-white/65">{loading ? "Working..." : message}</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-skyglass" />
          </div>
        </div>

        <Panel title="3. Analyze job and generate assets" icon={<Sparkles className="h-5 w-5 text-palm" />}>
          <div className="grid gap-3">
            {jobs.length === 0 ? (
              <EmptyState text="Search jobs to populate suitable listings." />
            ) : (
              jobs.map(({ job, fit: jobFit }) => (
                <button
                  key={job.id}
                  className={`rounded-md border p-3 text-left ${selectedJob?.id === job.id ? "border-palm bg-skyglass" : "border-line bg-field"}`}
                  onClick={() => {
                    setSelectedJob(job);
                    setFit(jobFit);
                    setAssets(null);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{job.title}</span>
                    <span className="text-xs font-semibold text-palm">{jobFit ? `${jobFit.fitScore}% fit` : "Not scored"}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">
                    {job.company} / {job.location} / {job.sourcePlatform}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/55">
                    <MapPin className="h-3.5 w-3.5 text-palm" />
                    {job.workMode === "Remote"
                      ? "Remote / no commute"
                      : `${job.distanceKmFromBukitJelutong ?? "?"}km from Bukit Jelutong / ${job.estimatedCommuteMinutes ?? "?"} min est.`}
                    {job.mapLink ? (
                      <span className="text-palm">Map available</span>
                    ) : null}
                  </p>
                </button>
              ))
            )}
          </div>
          <button className="mt-3 rounded-md bg-palm px-3 py-2 text-sm font-semibold text-white" onClick={() => analyzeSelectedJob()} disabled={loading || !selectedJob}>
            Analyze selected JD
          </button>
        </Panel>

        {fit && selectedJob ? (
          <Panel title="4. Scores, gaps, and recruiter concerns" icon={<AlertTriangle className="h-5 w-5 text-palm" />}>
            <div className="grid gap-2 md:grid-cols-4">
              <Score label="Fit" value={fit.fitScore} />
              <Score label="ATS" value={fit.atsScore} />
              <Score label="Location" value={fit.locationScore} />
              <Score label="Decision" value={fit.decision} />
              <Score label="Commute" value={selectedJob.workMode === "Remote" ? "Remote" : `${selectedJob.distanceKmFromBukitJelutong ?? "?"}km`} />
            </div>
              {selectedJob.mapLink ? (
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold"
                onClick={() => openApplyAction({ label: "commute map", type: "map", href: selectedJob.mapLink!, requiresConfirmation: true })}
              >
                <MapPin className="h-4 w-4" />
                Open Google Maps route
              </button>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <List title="Missing keywords" items={fit.missingKeywords} />
              <List title="Recruiter concerns" items={fit.recruiterConcerns} />
              <List title="Matched keywords" items={fit.matchedKeywords} />
              <List title="Improvements" items={fit.improvements} />
            </div>
          </Panel>
        ) : null}

        {assets ? (
          <Panel title="5. Edit, download, and apply" icon={<FileText className="h-5 w-5 text-palm" />}>
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">Tailored resume preview</label>
            <textarea className="mt-2 min-h-56 w-full rounded-md border border-line bg-white p-3 text-sm" value={resumeDraft} onChange={(event) => setResumeDraft(event.target.value)} />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">Cover letter</label>
            <textarea className="mt-2 min-h-36 w-full rounded-md border border-line bg-white p-3 text-sm" value={coverDraft} onChange={(event) => setCoverDraft(event.target.value)} />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">Application email</label>
            <textarea className="mt-2 min-h-36 w-full rounded-md border border-line bg-white p-3 text-sm" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-2 rounded-md bg-palm px-3 py-2 text-sm font-semibold text-white" onClick={downloadResume}>
                <Download className="h-4 w-4" />
                Download markdown
              </button>
              <button className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold" onClick={downloadPdfResume} disabled={loading}>
                <Download className="h-4 w-4" />
                Download ATS PDF
              </button>
              <button className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold" onClick={() => saveApplication("tailored")}>
                <ShieldCheck className="h-4 w-4" />
                Save as tailored
              </button>
              {assets.applyActions.map((action) => (
                <button key={action.href} className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold" onClick={() => openApplyAction(action)}>
                  {action.type === "email" ? <Mail className="h-4 w-4" /> : action.type === "map" ? <MapPin className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  {action.label}
                </button>
              ))}
              <button className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white" onClick={markAppliedAfterSubmission}>
                <ShieldCheck className="h-4 w-4" />
                Mark applied after submission
              </button>
            </div>
            <p className="mt-3 rounded-md border border-line bg-field p-3 text-sm text-ink/65">
              ApplySharp opens email, map, or official apply channels only. It saves preparation as tailored; use Mark applied only after you manually submit.
            </p>
            <List title="Unsupported claims blocked" items={assets.unsupportedClaims} />
          </Panel>
        ) : null}

        <Panel title="Saved application tracker" icon={<FileText className="h-5 w-5 text-palm" />}>
          {savedApplications.length === 0 ? (
            <EmptyState text="No saved applications yet." />
          ) : (
            <div className="grid gap-2">
              {savedApplications.map((application) => (
                <div key={application.id} className="rounded-md border border-line bg-field p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{application.job.title} / {application.job.company}</p>
                      <p className="mt-1 text-ink/60">
                        {application.score}% fit / {application.sourcePlatform} / {application.resumeVersion.pdfFileName ?? "PDF pending"}
                      </p>
                    </div>
                    <select
                      className="rounded-md border border-line bg-white px-2 py-1 text-sm font-semibold"
                      value={application.status}
                      onChange={(event) => updateSavedApplicationStatus(application, event.target.value as ApplicationStatus)}
                    >
                      {applicationStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <details className="mt-3 rounded-md border border-line bg-white p-3">
                    <summary className="cursor-pointer font-semibold text-ink/70">Version and history</summary>
                    <div className="mt-3 grid gap-2 text-ink/65">
                      <p>Apply link: {application.applyLink || "Not available"}</p>
                      <p>HR email: {application.hrEmail ?? "Not available"}</p>
                      <p>Resume characters: {application.resumeVersion.markdown?.length ?? 0}</p>
                      <p>Cover letter: {application.coverLetter.body ? "saved" : "not saved"}</p>
                      <p>Email draft: {application.coverLetter.emailBody ? "saved" : "not saved"}</p>
                      <p>Latest status: {application.statusHistory[0]?.status ?? application.status}</p>
                      <button
                        className="mt-2 w-fit rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700"
                        onClick={() => deleteSavedApplication(application)}
                        type="button"
                      >
                        Delete saved application data
                      </button>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Resume version history" icon={<Download className="h-5 w-5 text-palm" />}>
          {resumeVersions.length === 0 ? (
            <EmptyState text="No tailored resume versions yet. Analyze a JD and save or download a tailored resume." />
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Score label="Versions" value={resumeVersionSummary.total} />
                <Score label="PDFs" value={resumeVersionSummary.withPdf} />
                <Score label="Cover letters" value={resumeVersionSummary.withCoverLetter} />
                <Score label="Avg score" value={`${resumeVersionSummary.averageScore}%`} />
              </div>
              {resumeVersions.slice(0, 6).map((version) => (
                <article key={version.id} className="rounded-md border border-line bg-field p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{version.jobTitle}</h3>
                      <p className="mt-1 text-ink/60">
                        {version.company} / {version.sourcePlatform} / {version.score}% / {version.applicationStatus}
                      </p>
                    </div>
                    <span className="rounded-sm bg-white px-2 py-1 text-xs font-semibold text-palm">{version.pdfFileName ?? "Markdown only"}</span>
                  </div>
                  <p className="mt-2 text-ink/55">
                    Resume chars: {version.markdownCharacters} / Cover letter: {version.coverLetterSaved ? "yes" : "no"} / Email draft: {version.emailDraftSaved ? "yes" : "no"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {icon}
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <input className="rounded-md border border-line bg-white px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function CategoryButtons({ value, onChange }: { value: JobCategory | "All"; onChange: (value: JobCategory | "All") => void }) {
  const categories: Array<JobCategory | "All"> = ["All", "MNC", "SME", "Fresh Graduate", "Remote", "Internship", "Contract", "Others"];

  return (
    <div className="mt-3">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">Category buttons</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${value === category ? "border-palm bg-skyglass text-palm" : "border-line bg-field text-ink/70"}`}
            onClick={() => onChange(category)}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <select className="rounded-md border border-line bg-white px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}

function Score({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line bg-field p-3">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{label}</span>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-field p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">None</p>
      ) : (
        <ul className="mt-2 grid gap-1 text-sm text-ink/68">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-line bg-field p-4 text-sm text-ink/60">{text}</div>;
}

function buildJobDescription(job: JobListing) {
  return [
    job.title,
    job.company,
    job.requirements.join(", "),
    job.responsibilities.join(", "),
    job.atsKeywords.join(", ")
  ].join("\n");
}

function createLocalApplicationRecord(
  status: ApplicationStatus,
  job: JobListing,
  fit: FitResult,
  assets: TailoredApplicationAssets | null,
  resumeMarkdown: string,
  coverLetter: string,
  emailDraft: string
): ApplicationRecord {
  const now = new Date().toISOString();
  const emailParts = emailDraft.split(/\r?\n/);

  return {
    id: `local-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    status,
    job,
    fit,
    score: fit.fitScore,
    applyLink: job.applyLink,
    hrEmail: job.hrEmail,
    sourcePlatform: job.sourcePlatform,
    resumeVersion: {
      markdown: resumeMarkdown || assets?.resumeMarkdown,
      pdfFileName: assets?.pdfFileName
    },
    coverLetter: {
      body: coverLetter || assets?.coverLetter,
      emailSubject: emailParts[0] || assets?.emailSubject,
      emailBody: emailParts.slice(1).join("\n").trim() || assets?.emailBody
    },
    statusHistory: [{ status, at: now }]
  };
}

function normalizeStoredApplication(value: unknown): ApplicationRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<ApplicationRecord> & {
    title?: string;
    company?: string;
  };

  if (record.job && record.fit && record.resumeVersion && record.coverLetter) {
    return record as ApplicationRecord;
  }

  if (record.title && record.company && record.status) {
    const now = new Date().toISOString();
    return {
      id: record.id ?? `legacy-${Date.now()}`,
      createdAt: record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
      status: record.status,
      job: {
        id: record.id ?? "legacy-job",
        title: record.title,
        company: record.company,
        companyType: "Other",
        category: "Others",
        location: "Unknown",
        salary: "Not disclosed",
        source: "Legacy localStorage",
        sourcePlatform: "Public Listing",
        workMode: "Hybrid",
        experienceLevel: "Junior",
        applyLink: record.applyLink ?? "",
        requirements: [],
        responsibilities: [],
        atsKeywords: [],
        postedAgeDays: 0
      },
      fit: {
        fitScore: record.score ?? 0,
        atsScore: 0,
        locationScore: 0,
        decision: "Skip",
        missingKeywords: [],
        matchedKeywords: [],
        skillGaps: [],
        recruiterConcerns: [],
        improvements: []
      },
      score: record.score ?? 0,
      applyLink: record.applyLink ?? "",
      sourcePlatform: "Public Listing",
      resumeVersion: {},
      coverLetter: {},
      statusHistory: [{ status: record.status, at: now }]
    };
  }

  return null;
}
