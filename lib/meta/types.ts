export type MetaEntityLevel = "campaign" | "adset" | "ad";
export type MetaEntityStatus = "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED" | "UNKNOWN";

export type MetaAction = {
  action_type?: string;
  value?: string;
};

export type MetaInsightsRow = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: MetaAction[];
  date_start?: string;
  date_stop?: string;
};

export type MetaApiEntity = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
};

export type NormalizedMetaSnapshot = {
  metaEntityId: string;
  parentMetaId?: string;
  level: MetaEntityLevel;
  name: string;
  date: string;
  status: MetaEntityStatus;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  cpl: number | null;
  frequency: number;
  raw?: MetaInsightsRow;
};
