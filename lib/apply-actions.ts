export function buildMailtoHref(email: string, subject: string, body: string): string {
  const params = new URLSearchParams();
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();

  if (cleanSubject) {
    params.set("subject", cleanSubject);
  }
  if (cleanBody) {
    params.set("body", cleanBody);
  }

  const query = params.toString();

  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}

export function splitEmailDraft(draft: string): { subject: string; body: string } {
  const lines = draft.split(/\r?\n/);

  return {
    subject: lines[0]?.trim() ?? "",
    body: lines.slice(1).join("\n").trim()
  };
}
