import type { MetaAdsAgentRun } from "@prisma/client";

export function buildRunStartedMessage() {
  return "Meta Ads Agent Status\n\nRun started.";
}

export function buildRunCompletedMessage(data: {
  campaignsChecked: number;
  adSetsChecked: number;
  adsChecked: number;
  alertsGenerated: number;
  reportSent: boolean;
}) {
  return [
    "Meta Ads Agent Status",
    "",
    "Run completed.",
    `- Campaigns checked: ${data.campaignsChecked}`,
    `- Ad sets checked: ${data.adSetsChecked}`,
    `- Ads checked: ${data.adsChecked}`,
    `- Alerts generated: ${data.alertsGenerated}`,
    `- Report sent: ${data.reportSent ? "yes" : "no"}`
  ].join("\n");
}

export function buildRunFailedMessage(errorMessage: string) {
  return ["Meta Ads Agent Status", "", "Run failed.", `- Error: ${errorMessage}`].join("\n");
}

export function buildStatusCommandMessage(run: MetaAdsAgentRun | null) {
  if (!run) {
    return "Meta Ads Agent Status\n\nNo runs recorded yet.";
  }

  return [
    "Meta Ads Agent Status",
    "",
    `Last run: ${run.status}`,
    `Started: ${run.startedAt.toISOString()}`,
    `Completed: ${run.completedAt?.toISOString() ?? "n/a"}`,
    `Campaigns checked: ${run.campaignsChecked}`,
    `Ad sets checked: ${run.adSetsChecked}`,
    `Ads checked: ${run.adsChecked}`,
    `Alerts generated: ${run.alertsGenerated}`,
    `Report sent: ${run.reportSent ? "yes" : "no"}`
  ].join("\n");
}
