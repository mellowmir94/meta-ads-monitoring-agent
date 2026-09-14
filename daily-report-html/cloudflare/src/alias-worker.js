// Keep the previously deployed Durable Object class export while this Worker
// acts only as a secure service-binding proxy to the main dashboard Worker.
// Cloudflare requires the class name to remain exported across versions.
export class ConcurrencyLimiter {
  constructor() {}
}

export default {
  async fetch(request, env) {
    return env.DAILY_REPORT_ORIGIN.fetch(request);
  }
};
