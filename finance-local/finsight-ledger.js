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
  const formatMessage = (value) => escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
  const persist = () => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-12)));

  function addMessage(role, content, options = {}) {
    const entry = { role, content: String(content || ""), error: Boolean(options.error) };
    if (options.persist !== false) { history.push({ role, content: entry.content }); persist(); }
    const node = document.createElement("div");
    node.className = `finsight-message ${role}${entry.error ? " error" : ""}`;
    node.innerHTML = `<span class="finsight-message-role">${role === "user" ? "You" : "FinSight Agent"}</span>${formatMessage(entry.content)}`;
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
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
    addMessage("user", text);
    send.disabled = true;
    send.querySelector("span").textContent = "Analysing…";
    status.textContent = "Loading the selected Finance data securely…";
    const pending = addMessage("assistant", "Reviewing the current Ledger data…", { persist: false });
    try {
      if (!window.ledgerFinSightBridge?.context) throw new Error("FinSight data access is not ready. Refresh the page and try again.");
      const context = await window.ledgerFinSightBridge.context();
      const rowCount = context.datasets.reduce((total, dataset) => total + dataset.visibleRowCount, 0);
      status.textContent = `${rowCount.toLocaleString("en-MY")} commission rows · ${context.deductionHistory.recordCount.toLocaleString("en-MY")} deduction records`;
      const response = await fetch("/api/finsight-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, history: history.slice(-6, -1), context })
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
