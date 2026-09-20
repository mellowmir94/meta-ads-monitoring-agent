(() => {
  const STORAGE_KEY = "ledger-finsight-chat-v1";
  const suggestions = ["Summarise the current commission period", "Which riders have the highest commission?", "What deductions are still upcoming?", "Which rider deductions need finance follow-up?"];
  const $ = (selector) => document.querySelector(selector);
  const messages = $("#finsightMessages");
  const form = $("#finsightForm");
  const question = $("#finsightQuestion");
  const send = $("#finsightSend");
  const status = $("#finsightContextStatus");
  const prompts = $("#finsightPrompts");
  if (!messages || !form || !question || !send || !status || !prompts) return;

  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); } catch { history = []; }
  if (!Array.isArray(history)) history = [];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const formatInline = (value) => escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\\\|/g, "|");
  const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
  const formatMessage = value => {
    const lines = String(value ?? '').split(/\r?\n/), blocks = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && i + 1 < lines.length && tableCells(lines[i + 1]).every(cell => /^:?-{3,}:?$/.test(cell))) {
        const headers = tableCells(lines[i]), rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const cells = tableCells(lines[i]);
          rows.push('<tr>' + headers.map((_, index) => '<td>' + formatInline(cells[index] || '') + '</td>').join('') + '</tr>');
          i++;
        }
        i--;
        blocks.push('<div class="finsight-table-scroll" tabindex="0" role="region" aria-label="FinSight results table"><table><thead><tr>' + headers.map(cell => '<th scope="col">' + formatInline(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
      } else if (/^#{1,3}\s/.test(lines[i])) {
        blocks.push('<h3>' + formatInline(lines[i].replace(/^#{1,3}\s+/, '')) + '</h3>');
      } else if (lines[i].trim()) {
        blocks.push('<p>' + formatInline(lines[i]) + '</p>');
      }
    }
    return blocks.join('');
  };
  const persist = () => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-12)));

  // Presentation-only summary; it reads the existing authorized Ledger scope.
  const snapshot = document.createElement('section');
  snapshot.className = 'finsight-snapshot';
  snapshot.setAttribute('aria-label', 'Finance snapshot');
  messages.before(snapshot);
  let snapshotBusy = false;
  function snapshotDate(value) {
    const text = String(value || '').slice(0, 10);
    const date = new Date(text + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime())) return text;
    const day = date.getUTCDate();
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
    return day + suffix + ' ' + date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  async function renderSnapshot() {
    if (snapshotBusy || document.getElementById('tab-finsight')?.hidden) return;
    snapshotBusy = true;
    snapshot.innerHTML = '<div class="finsight-snapshot-top"><span>FINANCE SNAPSHOT</span><strong>Loading current Ledger data…</strong></div>';
    try {
      const data = await window.ledgerFinSightBridge.snapshot();
      const money = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const period = data.period.start && data.period.end ? snapshotDate(data.period.start) + ' - ' + snapshotDate(data.period.end) : 'Current commission scope';
      snapshot.innerHTML = '<div class="finsight-snapshot-top"><span>FINANCE SNAPSHOT</span><small>' + escapeHtml(data.riders) + ' riders</small><strong>' + escapeHtml(period) + '</strong></div><div class="finsight-snapshot-total"><span>TOTAL COMMISSION</span><strong>RM ' + money.format(data.commission) + '</strong><p>Current dashboard filters · Before deductions</p></div><div class="finsight-snapshot-metrics"><div><span>DEDUCTION RECORDS</span><strong>' + escapeHtml(data.records) + '</strong></div><div><span>ACTIVE REQUESTS</span><strong>' + escapeHtml(data.active) + '</strong></div><div><span>COMPLETED REQUESTS</span><strong>' + escapeHtml(data.completed) + '</strong></div></div><footer>Source: Commission Rider · Full Deduction History register</footer>';
    } catch {
      snapshot.innerHTML = '<div class="finsight-snapshot-top"><span>FINANCE SNAPSHOT</span><strong>Current figures are unavailable</strong><p>Reload the summary when the Ledger connection is ready.</p><button type="button">Reload summary</button></div>';
      snapshot.querySelector('button').onclick = renderSnapshot;
    } finally { snapshotBusy = false; }
  }
  const panel = document.getElementById('tab-finsight');
  if (panel) new MutationObserver(() => { if (!panel.hidden) void renderSnapshot(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  void renderSnapshot();

  function addMessage(role, content, options = {}) {
    const entry = { role, content: String(content || ""), error: Boolean(options.error) };
    if (options.persist !== false) { history.push({ role, content: entry.content }); persist(); }
    const node = document.createElement("div");
    node.className = `finsight-message ${role}${entry.error ? " error" : ""}`;
    node.innerHTML = `<span class="finsight-message-role">${role === "user" ? "You" : "FinSight Agent"}</span>${formatMessage(entry.content)}`;
    if (node.querySelector('table')) node.classList.add('has-table');
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
    if (node.classList.contains('has-table')) requestAnimationFrame(() => {
      messages.scrollTop += node.getBoundingClientRect().top - messages.getBoundingClientRect().top;
    });
    return node;
  }

  function renderHistory() {
    messages.replaceChildren();
    if (!history.length) addMessage("assistant", "Hello. Ask me about Commission Rider or Rider Deduction History in this Ledger.", { persist: false });
    else history.forEach((item) => addMessage(item.role === "user" ? "user" : "assistant", item.content, { persist: false }));
  }

  function renderPrompts() {
    prompts.replaceChildren();
    for (const text of suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => { question.value = text; question.focus(); });
      prompts.append(button);
    }
  }

  async function ask(text) {
    const tableRequest = /\b(table|tabular|jadual)\b/i.test(text);
    const formatOnly = tableRequest && !/\d|payment|rider|deduction|commission|ansuran|potongan|komisen/i.test(text);
    const previous = [...history].reverse().find(item => item.role === 'user' && (!/\b(table|tabular|jadual)\b/i.test(item.content) || /\d|payment|rider|deduction|commission|ansuran|potongan|komisen/i.test(item.content)));
    const analysisQuestion = formatOnly && previous ? previous.content + '\n' + text : text;
    addMessage("user", text);
    send.disabled = true;
    send.querySelector("span").textContent = "Analysing…";
    status.textContent = "Loading the selected Finance data securely…";
    const pending = addMessage("assistant", "Reviewing the current Ledger data…", { persist: false });
    try {
      if (!window.ledgerFinSightBridge?.context) throw new Error("FinSight data access is not ready. Refresh the page and try again.");
      const context = await window.ledgerFinSightBridge.context(analysisQuestion);
      const rowCount = context.datasets.reduce((total, dataset) => total + dataset.visibleRowCount, 0);
      status.textContent = `${rowCount.toLocaleString("en-MY")} commission rows · ${context.deductionHistory.recordCount.toLocaleString("en-MY")} deduction records`;
      if (context.directAnswer) {
        pending.remove();
        addMessage('assistant', context.directAnswer);
        return;
      }
      const response = await fetch("/api/finsight-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: tableRequest ? analysisQuestion + '\nPresent the requested results as a Markdown table with a No. column and clear column headers. Do not use a bullet list instead.' : text, history: history.slice(-6, -1), context })
      });
      let payload = {};
      try { payload = await response.json(); } catch { /* A generic error below is safer than exposing an edge response. */ }
      if (!response.ok) throw new Error(payload.error || "FinSight could not complete this request.");
      pending.remove();
      addMessage("assistant", payload.answer || "No answer was returned.");
      if (Array.isArray(payload.suggestions) && payload.suggestions.length) {
        prompts.replaceChildren();
        payload.suggestions.slice(0, 4).forEach((item) => {
          const button = document.createElement("button"); button.type = "button"; button.textContent = item.label || item.question; button.addEventListener("click", () => { question.value = item.question || item.label; question.focus(); }); prompts.append(button);
        });
      }
    } catch (error) {
      pending.remove();
      addMessage("assistant", error?.message || "FinSight is temporarily unavailable. Please try again.", { error: true });
      status.textContent = "FinSight could not load the selected scope.";
    } finally {
      send.disabled = false;
      send.querySelector("span").textContent = "Ask FinSight";
      question.focus();
    }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); const text = question.value.trim(); if (!text || send.disabled) return; question.value = ""; void ask(text); });
  question.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  $("#finsightClear")?.addEventListener("click", () => { history = []; persist(); renderHistory(); renderPrompts(); status.textContent = "Chat cleared. Ask a Commission Rider or Deduction History question."; });
  renderHistory();
  renderPrompts();
})();
