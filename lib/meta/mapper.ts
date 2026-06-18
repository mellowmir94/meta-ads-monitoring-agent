import type { MetaApiEntity, MetaEntityLevel, MetaEntityStatus, MetaInsightsRow, NormalizedMetaSnapshot } from "@/lib/meta/types";

const defaultLeadActionMatchers = ["lead", "onsite_conversion.lead", "offsite_conversion.fb_pixel_lead"];

function toNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: string | undefined): number {
  return Math.round(toNumber(value));
}

export function normalizeMetaStatus(status: string | undefined): MetaEntityStatus {
  if (status === "ACTIVE" || status === "PAUSED" || status === "ARCHIVED" || status === "DELETED") {
    return status;
  }

  return "UNKNOWN";
}

export function countLeadActions(actions: MetaInsightsRow["actions"], matchers = defaultLeadActionMatchers): number {
  if (!actions?.length) {
    return 0;
  }

  return actions.reduce((total, action) => {
    const actionType = action.action_type?.toLowerCase() ?? "";
    const isLead = matchers.some((matcher) => actionType.includes(matcher.toLowerCase()));
    return isLead ? total + toInteger(action.value) : total;
  }, 0);
}

export function getMetaEntityIdentity(row: MetaInsightsRow, level: MetaEntityLevel) {
  if (level === "campaign") {
    return { id: row.campaign_id, name: row.campaign_name, parentMetaId: undefined };
  }

  if (level === "adset") {
    return { id: row.adset_id, name: row.adset_name, parentMetaId: row.campaign_id };
  }

  return { id: row.ad_id, name: row.ad_name, parentMetaId: row.adset_id };
}

export function normalizeInsightsRow(
  row: MetaInsightsRow,
  level: MetaEntityLevel,
  fallbackDate: string,
  status: MetaEntityStatus = "UNKNOWN"
): NormalizedMetaSnapshot {
  const identity = getMetaEntityIdentity(row, level);

  if (!identity.id) {
    throw new Error(`Meta insights row is missing ${level} id`);
  }

  const spend = toNumber(row.spend);
  const leads = countLeadActions(row.actions);
  const cpl = leads > 0 ? spend / leads : null;

  return {
    metaEntityId: identity.id,
    parentMetaId: identity.parentMetaId,
    level,
    name: identity.name ?? `${level} ${identity.id}`,
    date: row.date_start ?? fallbackDate,
    status,
    spend,
    impressions: toInteger(row.impressions),
    reach: toInteger(row.reach),
    clicks: toInteger(row.clicks),
    ctr: toNumber(row.ctr),
    cpc: toNumber(row.cpc),
    cpm: toNumber(row.cpm),
    leads,
    cpl,
    frequency: toNumber(row.frequency),
    raw: row
  };
}

export function entityToZeroSnapshot(entity: MetaApiEntity, level: MetaEntityLevel, date: string): NormalizedMetaSnapshot {
  return {
    metaEntityId: entity.id,
    parentMetaId: entity.adset_id ?? entity.campaign_id,
    level,
    name: entity.name,
    date,
    status: normalizeMetaStatus(entity.effective_status ?? entity.status),
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    leads: 0,
    cpl: null,
    frequency: 0
  };
}
