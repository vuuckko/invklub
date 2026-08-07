let viewer;
let isAdmin = false;
let partners = [];
const profileById = new Map();

(async () => {
  viewer = await renderShell();
  isAdmin = viewer.role === "admin";

  const [{ data: partnersData }, { data: profilesData }] = await Promise.all([
    sb.from("partners").select("*").order("company_name"),
    sb.from("profiles").select("id, full_name, email"),
  ]);

  partners = partnersData ?? [];
  for (const p of profilesData ?? []) profileById.set(p.id, p);

  const statusFilter = document.getElementById("statusFilter");
  statusFilter.innerHTML += Object.entries(PARTNER_STATUS_LABELS)
    .map(([val, label]) => `<option value="${val}">${label}</option>`)
    .join("");

  const searchInput = document.getElementById("searchInput");
  [searchInput, statusFilter].forEach((el) => el.addEventListener("input", renderTable));

  renderTable();

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
      renderTable();
    })
    .subscribe();
})();

function personName(id) {
  const p = profileById.get(id);
  return p ? p.full_name || p.email : "—";
}

function renderTable() {
  document.getElementById("partnerCount").textContent = `${partners.length} partnera ukupno.`;

  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const tbody = document.getElementById("partnersBody");

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

  tbody.innerHTML = filtered.length
    ? filtered
        .map(
          (p) => `
      <tr class="partner-row" data-id="${p.id}" style="cursor:pointer">
        <td><strong>${escapeHtml(p.company_name)}</strong></td>
        <td class="text-muted">${escapeHtml(p.contact_person ?? "—")}</td>
        <td class="text-muted">${escapeHtml(p.email ?? "")}${p.email && p.phone ? " · " : ""}${escapeHtml(p.phone ?? "")}</td>
        <td><span class="status-dot ${PARTNER_STATUS_DOT[p.status] ?? ""}">${PARTNER_STATUS_LABELS[p.status] ?? p.status}</span></td>
        <td class="text-muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.notes ?? "")}</td>
        <td class="text-muted" style="font-size:.8rem">${p.updated_by ? personName(p.updated_by) + " · " : ""}${formatDate(p.updated_at)}</td>
      </tr>
    `,
        )
        .join("")
    : `<tr><td colspan="6" class="empty-state">Nema partnera koji odgovaraju filteru.</td></tr>`;

  tbody.querySelectorAll(".partner-row").forEach((row) => {
    row.addEventListener("click", () => openPartnerForm(partners.find((p) => p.id === row.dataset.id)));
  });
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
      <div class="ffield">
        <input id="pt_name" placeholder=" " value="${escapeHtml(partner?.company_name ?? "")}" required>
        <label for="pt_name">Naziv firme</label>
      </div>
      <div class="field-grid">
        <div class="ffield">
          <input id="pt_contact" placeholder=" " value="${escapeHtml(partner?.contact_person ?? "")}">
          <label for="pt_contact">Kontakt osoba</label>
        </div>
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
        <div class="ffield">
          <input id="pt_email" type="email" placeholder=" " value="${escapeHtml(partner?.email ?? "")}">
          <label for="pt_email">Email</label>
        </div>
        <div class="ffield">
          <input id="pt_phone" placeholder=" " value="${escapeHtml(partner?.phone ?? "")}">
          <label for="pt_phone">Telefon</label>
        </div>
      </div>
      <div class="ffield">
        <textarea id="pt_notes" placeholder=" ">${escapeHtml(partner?.notes ?? "")}</textarea>
        <label for="pt_notes">Beleške</label>
      </div>
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
    renderTable();
    closeModal();
  });

  document.getElementById("partnerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      company_name: document.getElementById("pt_name").value.trim(),
      contact_person: document.getElementById("pt_contact").value.trim() || null,
      status: document.getElementById("pt_status").value,
      email: document.getElementById("pt_email").value.trim() || null,
      phone: document.getElementById("pt_phone").value.trim() || null,
      notes: document.getElementById("pt_notes").value.trim() || null,
    };

    if (partner) {
      const { data, error } = await sb
        .from("partners")
        .update(values)
        .eq("id", partner.id)
        .select()
        .single();
      if (error) return toast(error.message, "error");
      Object.assign(partner, data);
    } else {
      const { data, error } = await sb
        .from("partners")
        .insert({ ...values, created_by: viewer.id })
        .select()
        .single();
      if (error) return toast(error.message, "error");
      partners.push(data);
    }

    toast("Sačuvano.");
    renderTable();
    closeModal();
  });
}
