import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteMasterResumeRecord,
  getActiveMasterResumeRecord,
  listMasterResumeRecords,
  saveMasterResumeRecord,
  summarizeMasterResumes
} from "../lib/master-resume-store";

const firstResume = "Built Power BI dashboards with SQL reporting, Grafana monitoring, and Python automation for operations teams.";
const secondResume = "Delivered BigQuery analytics, SQL reports, dashboard reporting, and application support for business stakeholders.";

test("saves active master resumes and deactivates older versions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-master-resumes-"));
  const storePath = path.join(directory, "master-resumes.json");

  try {
    const first = await saveMasterResumeRecord({ title: "First Resume", rawText: firstResume, source: "paste" }, storePath);
    const second = await saveMasterResumeRecord({ title: "Second Resume", rawText: secondResume, source: "upload", originalFileName: "resume.docx" }, storePath);
    const active = await getActiveMasterResumeRecord(storePath);
    const resumes = await listMasterResumeRecords(storePath);
    const summary = summarizeMasterResumes(resumes);

    assert.equal(active?.id, second.id);
    assert.equal(resumes.length, 2);
    assert.equal(resumes.find((resume) => resume.id === first.id)?.active, false);
    assert.equal(resumes.find((resume) => resume.id === second.id)?.active, true);
    assert.equal(second.originalFileName, "resume.docx");
    assert.ok(second.profile.keywords.includes("sql"));
    assert.equal(summary.total, 2);
    assert.equal(summary.activeId, second.id);
    assert.ok(summary.activeKeywordCount > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deletes active master resume and promotes the newest remaining resume", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-master-resumes-"));
  const storePath = path.join(directory, "master-resumes.json");

  try {
    const first = await saveMasterResumeRecord({ title: "First Resume", rawText: firstResume }, storePath);
    const second = await saveMasterResumeRecord({ title: "Second Resume", rawText: secondResume }, storePath);
    const deleted = await deleteMasterResumeRecord(second.id, storePath);
    const active = await getActiveMasterResumeRecord(storePath);

    assert.equal(deleted.id, second.id);
    assert.equal(active?.id, first.id);
    assert.equal(active?.active, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
