let viewer;
let isAdmin = false;
let partners = [];
const profileById = new Map();
const projectById = new Map();
const projectsByPartner = new Map();
const supportByPartner = new Map();

// Forward pipeline only — "Neuspešno" is a dead end, not a 5th step, and is
// rendered separately (see renderPipeline).
const PIPELINE_STAGES = [
  { status: "nije_kontaktiran", label: "Lead" },
  { status: "kontaktiran", label: "Kontaktiran" },
  { status: "u_pregovorima", label: "Pregovori" },
  { status: "aktivna_saradnja", label: "Partner" },
];

(async () => {
  viewer = await renderShell();
  isAdmin = viewer.role === "admin";

  const [{ data: partnersData }, { data: profilesData }, { data: projectsData }, { data: projectPartnersData }] =
    await Promise.all([
      sb.from("partners").select("*").order("company_name"),
      sb.from("profiles").select("id, full_name, email"),
      sb.from("projects").select("id, name, status"),
      sb.from("project_partners").select("project_id, partner_id"),
    ]);

  partners = partnersData ?? [];
  for (const p of profilesData ?? []) profileById.set(p.id, p);
  for (const p of projectsData ?? []) projectById.set(p.id, p);
  for (const pp of projectPartnersData ?? []) {
    const project = projectById.get(pp.project_id);
    if (!project) continue;
    if (!projectsByPartner.has(pp.partner_id)) projectsByPartner.set(pp.partner_id, []);
    projectsByPartner.get(pp.partner_id).push(project);
  }

  // Admin-only — RLS already returns nothing to a regular member here, but
  // skipping the call entirely matches how dashboard.js/finansije.js treat
  // the same table, and avoids a request that can only ever come back empty.
  if (isAdmin) {
    const { data: tx } = await sb
      .from("transactions")
      .select("partner_id, amount, type, status")
      .not("partner_id", "is", null);
    for (const t of tx ?? []) {
      if (t.type !== "prihod" || t.status !== "zavrseno") continue;
      supportByPartner.set(t.partner_id, (supportByPartner.get(t.partner_id) ?? 0) + Number(t.amount));
    }
  }

  const statusFilter = document.getElementById("statusFilter");
  statusFilter.innerHTML += Object.entries(PARTNER_STATUS_LABELS)
    .map(([val, label]) => `<option value="${val}">${label}</option>`)
    .join("");

  const searchInput = document.getElementById("searchInput");
  [searchInput, statusFilter].forEach((el) => el.addEventListener("input", renderGrid));

  renderGrid();

  document.getElementById("newPartnerBtn").addEventListener("click", () => openPartnerForm(null));

  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Live sync — everyone sees edits from everyone else instantly.
  sb.channel("partners-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "partners" }, (payload) => {
      if (payload.eventType === "INSERT") {
        if (!partners.some((p) => p.id === payload.new.id)) partners.push(payload.new);
      } else if (payload.eventType === "UPDATE") {
        const idx = partners.findIndex((p) => p.id === payload.new.id);
        if (idx >= 0) partners[idx] = payload.new;
      } else if (payload.eventType === "DELETE") {
        partners = partners.filter((p) => p.id !== payload.old.id);
      }
      partners.sort((a, b) => a.company_name.localeCompare(b.company_name));
      renderGrid();
    })
    .subscribe();
})();

function personName(id) {
  const p = profileById.get(id);
  return p ? p.full_name || p.email : "—";
}

// ---------------------------------------------------------------------------
// Pipeline widget — segments of the existing .progress bar language, not a
// new "stepper" component. See the CSS comment on .partner-pipeline.
// ---------------------------------------------------------------------------

function renderPipeline(status) {
  if (status === "neuspesno") {
    return `
      <div class="partner-pipeline partner-pipeline--lost">
        <div class="partner-pipeline__track">
          ${PIPELINE_STAGES.map(() => `<span class="partner-pipeline__seg"></span>`).join("")}
        </div>
        <p class="partner-pipeline__stage">Neuspešno</p>
      </div>
    `;
  }
  const activeIdx = Math.max(0, PIPELINE_STAGES.findIndex((s) => s.status === status));
  return `
    <div class="partner-pipeline">
      <div class="partner-pipeline__track">
        ${PIPELINE_STAGES.map((s, i) => `<span class="partner-pipeline__seg ${i <= activeIdx ? "is-filled" : ""}"></span>`).join("")}
      </div>
      <p class="partner-pipeline__stage">${PIPELINE_STAGES[activeIdx].label}</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function renderGrid() {
  document.getElementById("partnerCount").textContent = `${partners.length} partnera ukupno.`;

  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const grid = document.getElementById("partnersGrid");

  const q = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;

  const filtered = partners.filter((p) => {
    const matchesQ =
      !q ||
      (p.company_name ?? "").toLowerCase().includes(q) ||
      (p.contact_person ?? "").toLowerCase().includes(q);
    const matchesStatus = statusVal === "all" || p.status === statusVal;
    return matchesQ && matchesStatus;
  });

  grid.innerHTML = filtered.length
    ? filtered.map(partnerCardHtml).join("")
    : '<p class="empty-state">Nema partnera koji odgovaraju filteru.</p>';

  grid.querySelectorAll(".partner-card").forEach((card) => {
    card.addEventListener("click", () => openPartnerForm(partners.find((p) => p.id === card.dataset.id)));
  });
}

function partnerCardHtml(p) {
  const allProjects = projectsByPartner.get(p.id) ?? [];
  const activeProjects = allProjects.filter((pr) => pr.status !== "zavrsen");
  const totalSupport = supportByPartner.get(p.id) ?? 0;

  return `
    <div class="partner-card" data-id="${p.id}">
      <p class="partner-card__name">${escapeHtml(p.company_name)}</p>
      ${renderPipeline(p.status)}

      <div class="partner-card__block">
        <div class="kv-row"><dt>Kontakt</dt><dd>${escapeHtml(p.contact_person) || "—"}</dd></div>
        <div class="kv-row"><dt>Poslednji kontakt</dt><dd>${p.last_contact_date ? formatDate(p.last_contact_date) : "—"}</dd></div>
        <div class="kv-row"><dt>Sledeći kontakt</dt><dd>${p.next_contact_date ? formatDate(p.next_contact_date) : "—"}</dd></div>
      </div>

      <div class="partner-card__block partner-card__stats">
        <div class="partner-card__stat"><b>${allProjects.length}</b><span>Saradnje</span></div>
        ${isAdmin ? `<div class="partner-card__stat"><b>${formatAmount(totalSupport)}</b><span>Ukupna podrška, RSD</span></div>` : ""}
      </div>

      <div class="partner-card__block">
        <p class="partner-card__label">Aktivni projekti</p>
        <div class="tag-list" style="margin-top:6px">
          ${
            activeProjects.length
              ? activeProjects.map((pr) => `<span class="tag-pill">${escapeHtml(pr.name)}</span>`).join("")
              : '<span class="text-muted" style="font-size:.85rem">Nema aktivnih projekata.</span>'
          }
        </div>
      </div>

      <p class="partner-card__foot">${p.updated_by ? personName(p.updated_by) + " · " : ""}${formatDate(p.updated_at)}</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Add / edit modal
// ---------------------------------------------------------------------------

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

function openPartnerForm(partner) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">${partner ? "Uredi partnera" : "Dodaj partnera"}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="partnerForm">
      <label class="field-label">
        <span>Naziv firme</span>
        <input id="pt_name" value="${escapeHtml(partner?.company_name ?? "")}" required>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Kontakt osoba</span>
          <input id="pt_contact" value="${escapeHtml(partner?.contact_person ?? "")}">
        </label>
        <label class="field-label">
          <span>Status</span>
          <select id="pt_status">
            ${Object.entries(PARTNER_STATUS_LABELS)
              .map(
                ([val, label]) =>
                  `<option value="${val}" ${(partner?.status ?? "nije_kontaktiran") === val ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Email</span>
          <input id="pt_email" type="email" value="${escapeHtml(partner?.email ?? "")}">
        </label>
        <label class="field-label">
          <span>Telefon</span>
          <input id="pt_phone" value="${escapeHtml(partner?.phone ?? "")}">
        </label>
        <label class="field-label">
          <span>Poslednji kontakt</span>
          <input id="pt_last_contact" type="date" value="${partner?.last_contact_date ?? ""}">
        </label>
        <label class="field-label">
          <span>Sledeći kontakt</span>
          <input id="pt_next_contact" type="date" value="${partner?.next_contact_date ?? ""}">
        </label>
      </div>
      <label class="field-label">
        <span>Beleške</span>
        <textarea id="pt_notes">${escapeHtml(partner?.notes ?? "")}</textarea>
      </label>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Sačuvaj</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
        ${
          partner && isAdmin
            ? `<button type="button" class="btn btn--ghost" id="mDelete" style="margin-left:auto;color:#b3261e">Obriši</button>`
            : ""
        }
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("mDelete")?.addEventListener("click", async () => {
    if (!confirm(`Obrisati partnera "${partner.company_name}"?`)) return;
    const { error } = await sb.from("partners").delete().eq("id", partner.id);
    if (error) return toast(error.message, "error");
    partners = partners.filter((p) => p.id !== partner.id);
    toast("Partner obrisan.");
    renderGrid();
    closeModal();
  });

  document.getElementById("partnerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const previousStatus = partner?.status;
    const values = {
      company_name: document.getElementById("pt_name").value.trim(),
      contact_person: document.getElementById("pt_contact").value.trim() || null,
      status: document.getElementById("pt_status").value,
      email: document.getElementById("pt_email").value.trim() || null,
      phone: document.getElementById("pt_phone").value.trim() || null,
      last_contact_date: document.getElementById("pt_last_contact").value || null,
      next_contact_date: document.getElementById("pt_next_contact").value || null,
      notes: document.getElementById("pt_notes").value.trim() || null,
    };

    let savedPartner;
    if (partner) {
      const { data, error } = await sb
        .from("partners")
        .update(values)
        .eq("id", partner.id)
        .select()
        .single();
      if (error) return toast(error.message, "error");
      Object.assign(partner, data);
      savedPartner = partner;
    } else {
      const { data, error } = await sb
        .from("partners")
        .insert({ ...values, created_by: viewer.id })
        .select()
        .single();
      if (error) return toast(error.message, "error");
      partners.push(data);
      savedPartner = data;
    }

    if (values.status === "aktivna_saradnja" && previousStatus !== "aktivna_saradnja") {
      toast("Sačuvano.");
      renderGrid();
      openSponsorshipInstallmentsForm(savedPartner);
      return;
    }

    toast("Sačuvano.");
    renderGrid();
    closeModal();
  });
}

// ---------------------------------------------------------------------------
// Sponsorship payment schedule — shown right after a partner flips to
// "aktivna_saradnja". Supports one or more installments; each becomes a
// transaction row (income, linked to this partner) so it shows up in
// Finansije and on the Kalendar once its due date approaches.
// ---------------------------------------------------------------------------

function openSponsorshipInstallmentsForm(partner) {
  const modalBody = document.getElementById("modalBody");
  let rowCount = 0;

  function rowHtml(i) {
    return `
      <div class="field-grid" data-installment-row="${i}" style="margin-bottom:10px">
        <label class="field-label">
          <span>Iznos (RSD)</span>
          <input type="number" min="0.01" step="0.01" class="inst-amount" required>
        </label>
        <label class="field-label">
          <span>Datum uplate</span>
          <input type="date" class="inst-date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>
    `;
  }

  function addRow() {
    document.getElementById("installmentRows").insertAdjacentHTML("beforeend", rowHtml(rowCount++));
  }

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Uplate — ${escapeHtml(partner.company_name)}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <p class="text-muted" style="margin:0 0 14px">
      Ugovor je potpisan — unesi jednu ili više planiranih uplata (ako plaćaju u ratama, dodaj svaku posebno).
      ${isAdmin ? "" : "Ide na odobrenje upravi."}
    </p>
    <form id="installmentsForm">
      <div id="installmentRows"></div>
      <button type="button" class="btn btn--ghost btn--sm" id="addInstallmentBtn" style="margin-bottom:14px">+ Dodaj ratu</button>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Sačuvaj uplate</button>
        <button type="button" class="btn btn--ghost" id="mSkip">Preskoči</button>
      </div>
    </form>
  `;

  addRow();
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mSkip").addEventListener("click", closeModal);
  document.getElementById("addInstallmentBtn").addEventListener("click", addRow);

  document.getElementById("installmentsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rows = [...document.querySelectorAll("[data-installment-row]")].map((row) => ({
      type: "prihod",
      category: "Sponzorstvo",
      amount: Number(row.querySelector(".inst-amount").value),
      date: row.querySelector(".inst-date").value,
      description: `Sponzorstvo — ${partner.company_name}`,
      status: isAdmin ? "odobreno" : "na_cekanju",
      partner_id: partner.id,
      created_by: viewer.id,
    }));

    const { error } = await sb.from("transactions").insert(rows);
    if (error) return toast(error.message, "error");
    toast("Uplate sačuvane.");
    closeModal();
  });
}
