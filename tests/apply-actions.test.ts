import assert from "node:assert/strict";
import test from "node:test";
import { buildMailtoHref, splitEmailDraft } from "../lib/apply-actions";

test("builds mailto links with encoded subject and body", () => {
  const href = buildMailtoHref("hr@example.com", "Application for Power BI Analyst", "Hi Hiring Team,\nPlease find my application.");
  const url = new URL(href);

  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "hr@example.com");
  assert.equal(url.searchParams.get("subject"), "Application for Power BI Analyst");
  assert.equal(url.searchParams.get("body"), "Hi Hiring Team,\nPlease find my application.");
});

test("splits editable email draft into subject and body", () => {
  const parsed = splitEmailDraft("Application for Analyst\n\nHi Hiring Team,\nI would like to apply.");

  assert.equal(parsed.subject, "Application for Analyst");
  assert.equal(parsed.body, "Hi Hiring Team,\nI would like to apply.");
});
