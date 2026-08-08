let viewer;
let transactions = [];
let projects = [];
let partners = [];
let clubSettings = null;

const projectById = new Map();
const partnerById = new Map();

(async () => {
  viewer = await renderShell();
  if (viewer.role !== "admin") {
    window.location.href = "index.html";
    return;
  }

  const [txRes, projectsRes, partnersRes, settingsRes] = await Promise.all([
    sb.from("transactions").select("*").order("date", { ascending: false }),
    sb.from("projects").select("id, name"),
    sb.from("partners").select("id, company_name"),
    sb.from("club_settings").select("*").limit(1).maybeSingle(),
  ]);

  transactions = txRes.data ?? [];
  projects = projectsRes.data ?? [];
  partners = partnersRes.data ?? [];
  clubSettings = settingsRes.data ?? { annual_goal: 0 };

  for (const p of projects) projectById.set(p.id, p);
  for (const p of partners) partnerById.set(p.id, p);

  const statusFilter = document.getElementById("statusFilter");
  statusFilter.innerHTML += Object.entries(TRANSACTION_STATUS_LABELS)
    .map(([val, label]) => `<option value="${val}">${label}</option>`)
    .join("");

  renderHero();
  renderPending();
  renderCategoryChart();
  renderUpcomingPayments();
  renderTable();

  [document.getElementById("searchInput"), document.getElementById("typeFilter"), statusFilter].forEach(
    (el) => el.addEventListener("input", renderTable),
  );

  document.getElementById("newTransactionBtn").addEventListener("click", () => openTransactionForm());
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("printBtn").addEventListener("click", () => window.print());

  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
})();

function sum(list) {
  return list.reduce((acc, t) => acc + Number(t.amount), 0);
}

function renderHero() {
  const sumOf = (type, status) =>
    sum(transactions.filter((t) => t.type === type && t.status === status));

  // Same reconciliation as the dashboard — see the comment there for why the
  // annual goal no longer leads. On this page the goal survives as a footnote
  // under the position, since fundraising targets do belong in Finansije.
  const primljeno = sumOf("prihod", "zavrseno");
  const potroseno = sumOf("rashod", "zavrseno");
  const stanje = primljeno - potroseno;
  const obaveze = sumOf("rashod", "odobreno");
  const ocekivano = sumOf("prihod", "odobreno");
  const raspolozivo = stanje - obaveze;
  const pendingCount = transactions.filter((t) => t.status === "na_cekanju").length;

  const goal = Number(clubSettings.annual_goal ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((primljeno / goal) * 100)) : 0;

  document.getElementById("heroStats").innerHTML = `
    <div>
      <p class="statement__folio">Stanje sredstava <span>na dan ${formatDate(new Date())}</span></p>
      <div class="statement__figure ${raspolozivo < 0 ? "is-negative" : ""}">
        ${formatSigned(raspolozivo)}<span class="statement__unit">RSD raspoloživo</span>
      </div>
      <p class="statement__note">
        Stanje na računu umanjeno za rashode koji su odobreni, a još nisu plaćeni.
      </p>
      ${
        pendingCount
          ? `<a class="statement__flag" href="#pendingList">${pendingCount} ${pendingCount === 1 ? "stavka čeka" : "stavki čeka"} odobrenje &darr;</a>`
          : ""
      }

      <div class="statement__goal">
        <div class="statement__goal-head">
          <span>Godišnji cilj prihoda</span>
          <b>${goal > 0 ? pct + "%" : "nije postavljen"}</b>
        </div>
        ${goal > 0 ? `<div class="statement__goal-track"><span style="width:${pct}%"></span></div>` : ""}
        <div class="statement__goal-foot">
          <span>${goal > 0 ? `${formatAmount(primljeno)} od ${formatAmount(goal)} RSD` : "—"}</span>
          <button type="button" id="editGoalBtn">Uredi</button>
        </div>
      </div>
    </div>

    <dl class="statement__calc">
      <div class="calc-row"><dt>Primljeno</dt><dd>${formatAmount(primljeno)}</dd></div>
      <div class="calc-row"><dt>Potrošeno</dt><dd>−${formatAmount(potroseno)}</dd></div>
      <div class="calc-row calc-row--sub"><dt>Stanje na računu</dt><dd>${formatSigned(stanje)}</dd></div>
      <div class="calc-row"><dt>Odobreni rashodi</dt><dd>−${formatAmount(obaveze)}</dd></div>
      <div class="calc-row calc-row--total"><dt>Raspoloživo</dt><dd>${formatSigned(raspolozivo)}</dd></div>
      <div class="calc-row calc-row--aside">
        <dt>Ugovoreno, nenaplaćeno<span class="calc-row__hint">Potpisana sponzorstva</span></dt>
        <dd>+${formatAmount(ocekivano)}</dd>
      </div>
    </dl>
  `;
  document.getElementById("editGoalBtn").addEventListener("click", openGoalForm);
}

function renderPending() {
  const pending = transactions.filter((t) => t.status === "na_cekanju");
  document.getElementById("pendingCount").textContent = pending.length || "";
  const el = document.getElementById("pendingList");

  el.innerHTML = pending.length
    ? pending
        .map(
          (t) => `
      <div class="ledger-row">
        <div>
          <span class="ledger-row__name">${TRANSACTION_TYPE_LABELS[t.type]} · ${escapeHtml(t.category)}</span>
          <span class="ledger-row__meta">${escapeHtml(t.description ?? "")} · ${formatDate(t.date)}</span>
        </div>
        <div class="ledger-row__value" style="display:flex;align-items:center;gap:16px">
          <span class="ledger-row__pct">${formatCurrency(t.amount)}</span>
          <span style="display:flex;gap:6px">
            <button type="button" class="btn btn--ghost btn--sm" data-approve="${t.id}">Odobri</button>
            <button type="button" class="btn btn--ghost btn--sm" data-reject="${t.id}" style="color:#b3261e">Odbij</button>
          </span>
        </div>
      </div>
    `,
        )
        .join("")
    : '<p class="empty-state">Nema transakcija na čekanju.</p>';

  el.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => setStatus(btn.dataset.approve, "odobreno")),
  );
  el.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", () => setStatus(btn.dataset.reject, "odbijeno")),
  );
}

async function setStatus(id, status) {
  const { error } = await sb.from("transactions").update({ status }).eq("id", id);
  if (error) return toast(error.message, "error");
  const t = transactions.find((x) => x.id === id);
  if (t) t.status = status;
  toast("Ažurirano.");
  renderHero();
  renderPending();
  renderCategoryChart();
  renderUpcomingPayments();
  renderTable();
}

function renderCategoryChart() {
  const relevant = transactions.filter((t) => t.type === "rashod" && t.status !== "odbijeno");
  const byCategory = new Map();
  for (const t of relevant) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Number(t.amount));
  }
  const rows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));

  document.getElementById("categoryChart").innerHTML = rows.length
    ? rows
        .map(
          ([cat, val]) => `
      <div class="mini-row">
        <span class="mini-row__name" style="width:150px">${escapeHtml(cat)}</span>
        <span class="mini-row__bar"><span style="width:${(val / max) * 100}%"></span></span>
        <span class="mini-row__count" style="width:auto;font-size:.82rem">${formatCurrency(val)}</span>
      </div>
    `,
        )
        .join("")
    : '<p class="empty-state">Još nema rashoda.</p>';
}

function renderUpcomingPayments() {
  const upcoming = transactions
    .filter((t) => t.type === "prihod" && t.status !== "zavrseno" && t.status !== "odbijeno" && t.partner_id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  document.getElementById("upcomingPayments").innerHTML = upcoming.length
    ? upcoming
        .map((t) => {
          const partner = partnerById.get(t.partner_id);
          const days = daysUntil(t.date);
          return `
        <div class="mini-row mini-row--split">
          <span>${escapeHtml(partner?.company_name ?? "?")}</span>
          <span class="text-muted" style="font-size:.85rem">${formatCurrency(t.amount)} · ${days < 0 ? "kasni" : "za " + days + " d."}</span>
        </div>
      `;
        })
        .join("")
    : '<p class="empty-state">Nema planiranih uplata.</p>';
}

function renderTable() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const typeVal = document.getElementById("typeFilter").value;
  const statusVal = document.getElementById("statusFilter").value;

  const filtered = transactions.filter((t) => {
    const matchesQ =
      !q ||
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.category ?? "").toLowerCase().includes(q);
    const matchesType = typeVal === "all" || t.type === typeVal;
    const matchesStatus = statusVal === "all" || t.status === statusVal;
    return matchesQ && matchesType && matchesStatus;
  });

  document.getElementById("transactionsBody").innerHTML = filtered.length
    ? filtered
        .map((t) => {
          const link = t.project_id
            ? escapeHtml(projectById.get(t.project_id)?.name ?? "")
            : t.partner_id
              ? escapeHtml(partnerById.get(t.partner_id)?.company_name ?? "")
              : "—";
          return `
      <tr class="tx-row" data-id="${t.id}" style="cursor:pointer">
        <td class="text-muted">${formatDate(t.date)}</td>
        <td>${TRANSACTION_TYPE_LABELS[t.type]}</td>
        <td class="text-muted">${escapeHtml(t.category)}</td>
        <td class="text-muted">${escapeHtml(t.description ?? "")}</td>
        <td class="text-muted">${link}</td>
        <td><span class="status-dot ${TRANSACTION_STATUS_DOT[t.status] ?? ""}">${TRANSACTION_STATUS_LABELS[t.status] ?? t.status}</span></td>
        <td class="num" style="font-weight:600">${t.type === "rashod" ? "−" : "+"}${formatCurrency(t.amount)}</td>
      </tr>
    `;
        })
        .join("")
    : `<tr><td colspan="7" class="empty-state">Nema transakcija koje odgovaraju filteru.</td></tr>`;

  document.querySelectorAll(".tx-row").forEach((row) => {
    row.addEventListener("click", () => openTransactionForm(transactions.find((t) => t.id === row.dataset.id)));
  });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

function openGoalForm() {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Godišnji cilj</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="goalForm">
      <label class="field-label">
        <span>Cilj (RSD)</span>
        <input id="g_amount" type="number" min="0" step="1" value="${clubSettings.annual_goal ?? 0}">
      </label>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Sačuvaj</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
      </div>
    </form>
  `;
  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("goalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById("g_amount").value || 0);
    const { error } = await sb.from("club_settings").update({ annual_goal: amount }).eq("id", clubSettings.id);
    if (error) return toast(error.message, "error");
    clubSettings.annual_goal = amount;
    toast("Sačuvano.");
    renderHero();
    closeModal();
  });
}

function openTransactionForm(existing) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">${existing ? "Transakcija" : "Nova transakcija"}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="txForm">
      <div class="field-grid">
        <label class="field-label">
          <span>Tip</span>
          <select id="t_type">
            <option value="prihod" ${existing?.type === "prihod" ? "selected" : ""}>Prihod</option>
            <option value="rashod" ${!existing || existing?.type === "rashod" ? "selected" : ""}>Rashod</option>
          </select>
        </label>
        <label class="field-label">
          <span>Kategorija</span>
          <input id="t_category" list="categoryOptions" value="${escapeHtml(existing?.category ?? "")}" required>
        </label>
        <label class="field-label">
          <span>Iznos (RSD)</span>
          <input id="t_amount" type="number" min="0.01" step="0.01" value="${existing?.amount ?? ""}" required>
        </label>
        <label class="field-label">
          <span>Datum</span>
          <input id="t_date" type="date" value="${existing?.date ?? new Date().toISOString().slice(0, 10)}">
        </label>
        <label class="field-label">
          <span>Status</span>
          <select id="t_status">
            ${Object.entries(TRANSACTION_STATUS_LABELS)
              .map(([val, label]) => `<option value="${val}" ${(existing?.status ?? "odobreno") === val ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Projekat (opciono)</span>
          <select id="t_project">
            <option value="">—</option>
            ${projects.map((p) => `<option value="${p.id}" ${existing?.project_id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Partner (opciono)</span>
          <select id="t_partner">
            <option value="">—</option>
            ${partners.map((p) => `<option value="${p.id}" ${existing?.partner_id === p.id ? "selected" : ""}>${escapeHtml(p.company_name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="field-label">
        <span>Opis</span>
        <textarea id="t_description">${escapeHtml(existing?.description ?? "")}</textarea>
      </label>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Sačuvaj</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
        ${existing ? `<button type="button" class="btn btn--ghost" id="mDelete" style="margin-left:auto;color:#b3261e">Obriši</button>` : ""}
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("mDelete")?.addEventListener("click", async () => {
    if (!confirm("Obrisati ovu transakciju?")) return;
    const { error } = await sb.from("transactions").delete().eq("id", existing.id);
    if (error) return toast(error.message, "error");
    transactions = transactions.filter((t) => t.id !== existing.id);
    toast("Obrisano.");
    renderAll();
    closeModal();
  });

  document.getElementById("txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      type: document.getElementById("t_type").value,
      category: document.getElementById("t_category").value.trim(),
      amount: Number(document.getElementById("t_amount").value),
      date: document.getElementById("t_date").value,
      status: document.getElementById("t_status").value,
      project_id: document.getElementById("t_project").value || null,
      partner_id: document.getElementById("t_partner").value || null,
      description: document.getElementById("t_description").value.trim() || null,
    };

    if (existing) {
      const { error } = await sb.from("transactions").update(values).eq("id", existing.id);
      if (error) return toast(error.message, "error");
      Object.assign(existing, values);
    } else {
      const { data, error } = await sb
        .from("transactions")
        .insert({ ...values, created_by: viewer.id })
        .select()
        .single();
      if (error) return toast(error.message, "error");
      transactions.unshift(data);
    }

    toast("Sačuvano.");
    renderAll();
    closeModal();
  });
}

function renderAll() {
  renderHero();
  renderPending();
  renderCategoryChart();
  renderUpcomingPayments();
  renderTable();
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCsv() {
  const rows = [["Datum", "Tip", "Kategorija", "Opis", "Projekat/Partner", "Status", "Iznos (RSD)"]];
  document.querySelectorAll("#transactionsBody tr[data-id]").forEach((row) => {
    const t = transactions.find((x) => x.id === row.dataset.id);
    if (!t) return;
    const link = t.project_id
      ? projectById.get(t.project_id)?.name ?? ""
      : t.partner_id
        ? partnerById.get(t.partner_id)?.company_name ?? ""
        : "";
    rows.push([
      t.date,
      TRANSACTION_TYPE_LABELS[t.type],
      t.category,
      t.description ?? "",
      link,
      TRANSACTION_STATUS_LABELS[t.status] ?? t.status,
      t.amount,
    ]);
  });

  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finansije-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
