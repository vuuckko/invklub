let viewer;
let members = [];
let sectors = [];
let allTags = [];

(async () => {
  viewer = await renderShell();

  const [membersRes, sectorsRes, tagsRes] = await Promise.all([
    sb.from("profiles").select("*, sector:sectors(id, name)").order("full_name"),
    sb.from("sectors").select("*").order("name"),
    sb.from("tags").select("*").order("name"),
  ]);

  members = membersRes.data ?? [];
  sectors = sectorsRes.data ?? [];
  allTags = tagsRes.data ?? [];

  document.getElementById("memberCount").textContent = `${members.length} članova ukupno.`;

  const sectorFilter = document.getElementById("sectorFilter");
  sectorFilter.innerHTML +=
    sectors.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  [searchInput, sectorFilter, statusFilter].forEach((el) =>
    el.addEventListener("input", renderGrid),
  );

  renderGrid();
})();

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// A wide table forced every member into one row shape regardless of how
// much they'd actually filled in, which is why it read as a dense,
// hard-to-scan strip. Cards let each member take only the space their own
// data needs and scan like a contact sheet instead of a spreadsheet.
function renderGrid() {
  const searchInput = document.getElementById("searchInput");
  const sectorFilter = document.getElementById("sectorFilter");
  const statusFilter = document.getElementById("statusFilter");
  const grid = document.getElementById("membersGrid");

  const q = searchInput.value.trim().toLowerCase();
  const sectorVal = sectorFilter.value;
  const statusVal = statusFilter.value;

  const filtered = members.filter((m) => {
    const matchesQ =
      !q ||
      (m.full_name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q);
    const matchesSector = sectorVal === "all" || m.sector_id === sectorVal;
    const matchesStatus = statusVal === "all" || m.status === statusVal;
    return matchesQ && matchesSector && matchesStatus;
  });

  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-state">Nema članova koji odgovaraju filteru.</p>';
    return;
  }

  // Grouped by sector — app's own order (same as the filter dropdown, both
  // come from the same alphabetically-sorted `sectors` fetch) — so the
  // directory scans by section instead of a shuffled contact sheet.
  // "Bez sektora" is a catch-all, always last. A sector with zero matches
  // under the current search/filter just doesn't render a heading, same
  // as Dokumenti's project groups.
  const bySector = new Map();
  for (const m of filtered) {
    const key = m.sector_id ?? "none";
    if (!bySector.has(key)) bySector.set(key, []);
    bySector.get(key).push(m);
  }

  const groups = [
    ...sectors.map((s) => ({ name: s.name, members: bySector.get(s.id) ?? [] })),
    { name: "Bez sektora", members: bySector.get("none") ?? [] },
  ].filter((g) => g.members.length);

  grid.innerHTML = groups.map(memberSectionHtml).join("");

  grid.querySelectorAll(".member-card").forEach((card) => {
    card.addEventListener("click", () => openMemberModal(card.dataset.id));
  });
}

// The sector icon lives here, on the heading, and NOT on each card — one
// icon per sector instead of the same icon repeated on every member in it.
// "Bez sektora" isn't a real sectors row, so it falls through to
// SECTOR_ICON_FALLBACK's plain ring, same as the dashboard's synthetic row.
function memberSectionHtml(group) {
  return `
    <div class="member-section">
      <div class="member-section__head">
        <h3>${sectorIcon(group.name)}<span>${escapeHtml(group.name)}</span></h3>
        <span class="member-section__count">${group.members.length}</span>
      </div>
      <div class="member-grid">
        ${group.members.map(memberCardHtml).join("")}
      </div>
    </div>
  `;
}

// Deliberately omits three things the pre-grouping card carried:
//   - the sector name: the section heading above states it once, so
//     printing it again on all 11 cards was pure repetition;
//   - "Aktivan": when nearly every member is active the label is noise,
//     so only the exception (Alumni) is marked — unmarked means active,
//     and the status filter still queries it explicitly;
//   - the email: it only ever rendered ellipsized ("nikolaa@gmail…"),
//     which looks like data without being usable. It's in the modal, whole.
function memberCardHtml(m) {
  const marks = [
    m.role === "admin" ? `<span class="badge badge--light">${roleLabelFor(m)}</span>` : "",
    m.status !== "active"
      ? `<span class="badge badge--neutral">${STATUS_LABELS[m.status] ?? m.status}</span>`
      : "",
  ].join("");

  return `
    <div class="member-card" data-id="${m.id}">
      <span class="member-card__avatar">${escapeHtml(initials(m.full_name))}</span>
      <div class="member-card__body">
        <p class="member-card__name">${escapeHtml(m.full_name || "(bez imena)")}</p>
        ${m.position ? `<p class="member-card__position">${escapeHtml(m.position)}</p>` : ""}
        ${marks ? `<div class="member-card__marks">${marks}</div>` : ""}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Member detail / edit modal
// ---------------------------------------------------------------------------

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById("modalBackdrop");
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
});

async function openMemberModal(memberId) {
  const member = members.find((m) => m.id === memberId);
  if (!member) return;

  const isSelf = viewer.id === member.id;
  const isAdmin = viewer.role === "admin";
  const canEditPersonal = isSelf || isAdmin;
  const canEditAdminFields = isAdmin;
  // Role changes are owner-only now, even for Uprava — protect_profile_fields()
  // in the DB rejects the update either way, but disabling the control here
  // avoids a confusing raw error toast for an admin who tries.
  const canEditRole = isOwner(viewer);

  const { data: profileTags } = await sb
    .from("profile_tags")
    .select("tag_id")
    .eq("profile_id", member.id);
  const selectedTagIds = new Set((profileTags ?? []).map((t) => t.tag_id));

  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  if (!canEditPersonal) {
    renderMemberReport(member, selectedTagIds);
    backdrop.hidden = false;
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    return;
  }

  modalBody.innerHTML = `
    <div class="modal__head">
      <div>
        <h3 style="margin:0">${escapeHtml(member.full_name || member.email)}</h3>
        <p class="text-muted" style="margin:4px 0 0;font-size:.85rem">Član od ${new Date(member.join_date).toLocaleDateString("sr-RS")}</p>
      </div>
      <button type="button" class="modal__close" id="modalCloseBtn">&times;</button>
    </div>

    <form id="memberForm">
      <div class="field-grid">
        <label class="field-label">
          <span>Ime i prezime</span>
          <input id="f_full_name" value="${escapeHtml(member.full_name ?? "")}" ${canEditPersonal ? "" : "disabled"}>
        </label>
        <label class="field-label">
          <span>Email</span>
          <input value="${escapeHtml(member.email)}" disabled>
        </label>
        <label class="field-label">
          <span>Telefon</span>
          <input id="f_phone" value="${escapeHtml(member.phone ?? "")}" ${canEditPersonal ? "" : "disabled"}>
        </label>
        <label class="field-label">
          <span>LinkedIn</span>
          <input id="f_linkedin" value="${escapeHtml(member.linkedin_url ?? "")}" ${canEditPersonal ? "" : "disabled"}>
        </label>
        <label class="field-label">
          <span>Sektor</span>
          <select id="f_sector" ${canEditAdminFields ? "" : "disabled"}>
            <option value="">Bez sektora</option>
            ${sectors.map((s) => `<option value="${s.id}" ${s.id === member.sector_id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Pozicija</span>
          <input id="f_position" value="${escapeHtml(member.position ?? "")}" ${canEditAdminFields ? "" : "disabled"}>
        </label>
        <label class="field-label">
          <span>Status</span>
          <select id="f_status" ${canEditAdminFields ? "" : "disabled"}>
            <option value="active" ${member.status === "active" ? "selected" : ""}>Aktivan</option>
            <option value="alumni" ${member.status === "alumni" ? "selected" : ""}>Alumni</option>
          </select>
        </label>
        <label class="field-label">
          <span>Uloga</span>
          <select id="f_role" ${canEditRole ? "" : "disabled"}>
            <option value="member" ${member.role === "member" ? "selected" : ""}>Član</option>
            <option value="admin" ${member.role === "admin" ? "selected" : ""}>Uprava</option>
          </select>
        </label>
      </div>

      <h4 style="margin:18px 0 6px">Veštine</h4>
      <div id="skillsPicker"></div>

      <h4 style="margin:18px 0 6px">Interesovanja</h4>
      <div id="interestsPicker"></div>

      ${
        canEditPersonal
          ? `<div class="modal__actions">
              <button type="submit" class="btn btn--primary">Sačuvaj izmene</button>
              <button type="button" class="btn btn--ghost" id="modalCancelBtn">Zatvori</button>
            </div>`
          : `<div class="modal__actions">
              <button type="button" class="btn btn--ghost" id="modalCancelBtn">Zatvori</button>
            </div>`
      }
    </form>
  `;

  backdrop.hidden = false;

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("modalCancelBtn")?.addEventListener("click", closeModal);

  renderTagPicker("skillsPicker", "skill", selectedTagIds, canEditPersonal, member.id);
  renderTagPicker("interestsPicker", "interest", selectedTagIds, canEditPersonal, member.id);

  if (canEditPersonal) {
    document.getElementById("memberForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const updates = {
        full_name: document.getElementById("f_full_name").value.trim(),
        phone: document.getElementById("f_phone").value.trim() || null,
        linkedin_url: document.getElementById("f_linkedin").value.trim() || null,
      };
      if (canEditAdminFields) {
        updates.sector_id = document.getElementById("f_sector").value || null;
        updates.position = document.getElementById("f_position").value.trim() || null;
        updates.status = document.getElementById("f_status").value;
      }
      if (canEditRole) {
        updates.role = document.getElementById("f_role").value;
      }

      const { error } = await sb.from("profiles").update(updates).eq("id", member.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Sačuvano.");
      Object.assign(member, updates);
      renderGrid();
      closeModal();
    });
  }
}

function renderMemberReport(member, selectedTagIds) {
  const modalBody = document.getElementById("modalBody");
  const skills = allTags.filter((t) => t.type === "skill" && selectedTagIds.has(t.id));
  const interests = allTags.filter((t) => t.type === "interest" && selectedTagIds.has(t.id));
  const sector = sectors.find((s) => s.id === member.sector_id);

  modalBody.innerHTML = `
    <div class="modal__head">
      <div>
        <h3 style="margin:0">${escapeHtml(member.full_name || member.email)}</h3>
        <p class="text-muted" style="margin:4px 0 0;font-size:.85rem">
          ${[member.position, sector?.name].filter(Boolean).map(escapeHtml).join(" · ") || "Član kluba"}
        </p>
      </div>
      <button type="button" class="modal__close" id="modalCloseBtn">&times;</button>
    </div>

    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <span class="detail-meta-item__label">Email</span>
        <span class="detail-meta-item__value" style="font-size:.95rem">${escapeHtml(member.email)}</span>
      </div>
      <div class="detail-meta-item">
        <span class="detail-meta-item__label">Telefon</span>
        <span class="detail-meta-item__value" style="font-size:.95rem">${escapeHtml(member.phone) || "—"}</span>
      </div>
      <div class="detail-meta-item">
        <span class="detail-meta-item__label">LinkedIn</span>
        <span class="detail-meta-item__value" style="font-size:.95rem">${
          member.linkedin_url && /^https?:\/\//i.test(member.linkedin_url)
            ? `<a href="${escapeHtml(member.linkedin_url)}" target="_blank" rel="noopener">Profil &rarr;</a>`
            : member.linkedin_url
              ? escapeHtml(member.linkedin_url)
              : "—"
        }</span>
      </div>
      <div class="detail-meta-item">
        <span class="detail-meta-item__label">Status</span>
        <span class="detail-meta-item__value" style="font-size:.95rem">${STATUS_LABELS[member.status] ?? member.status}</span>
      </div>
      <div class="detail-meta-item">
        <span class="detail-meta-item__label">Član od</span>
        <span class="detail-meta-item__value" style="font-size:.95rem">${new Date(member.join_date).toLocaleDateString("sr-RS")}</span>
      </div>
    </div>

    <h4 style="margin:20px 0 8px">Veštine</h4>
    <div class="tag-list">
      ${skills.length ? skills.map((t) => `<span class="tag-pill">${escapeHtml(t.name)}</span>`).join("") : '<p class="text-muted" style="margin:0;font-size:.88rem">Nije navedeno.</p>'}
    </div>

    <h4 style="margin:16px 0 8px">Interesovanja</h4>
    <div class="tag-list">
      ${interests.length ? interests.map((t) => `<span class="tag-pill tag-pill--interest">${escapeHtml(t.name)}</span>`).join("") : '<p class="text-muted" style="margin:0;font-size:.88rem">Nije navedeno.</p>'}
    </div>

    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="modalCancelBtn">Zatvori</button>
    </div>
  `;
}

function renderTagPicker(containerId, type, selectedTagIds, canEdit, profileId) {
  const container = document.getElementById(containerId);
  const relevant = allTags.filter((t) => t.type === type);

  container.innerHTML = `
    <div class="tag-picker">
      ${relevant
        .map(
          (t) => `
        <button type="button" class="tag-picker__option ${selectedTagIds.has(t.id) ? "is-selected" : ""} ${type === "interest" ? "tag-pill--interest" : ""}"
          data-tag-id="${t.id}" ${canEdit ? "" : "disabled"}>${escapeHtml(t.name)}</button>
      `,
        )
        .join("")}
    </div>
    ${
      canEdit
        ? `<div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" class="new-tag-input" placeholder="Dodaj novo…"
              style="flex:1;border:1.5px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit">
            <button type="button" class="btn btn--ghost btn--sm add-tag-btn">Dodaj</button>
          </div>`
        : ""
    }
  `;

  if (!canEdit) return;

  container.querySelectorAll(".tag-picker__option").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tagId = btn.dataset.tagId;
      const isSelected = btn.classList.contains("is-selected");
      if (isSelected) {
        await sb.from("profile_tags").delete().eq("profile_id", profileId).eq("tag_id", tagId);
        selectedTagIds.delete(tagId);
      } else {
        await sb.from("profile_tags").insert({ profile_id: profileId, tag_id: tagId });
        selectedTagIds.add(tagId);
      }
      btn.classList.toggle("is-selected");
    });
  });

  const input = container.querySelector(".new-tag-input");
  const addBtn = container.querySelector(".add-tag-btn");
  addBtn?.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) return;
    const { data: newTag, error } = await sb
      .from("tags")
      .insert({ name, type })
      .select()
      .single();
    if (error) {
      const { data: existing } = await sb
        .from("tags")
        .select("*")
        .ilike("name", name)
        .eq("type", type)
        .maybeSingle();
      if (!existing) {
        toast(error.message, "error");
        return;
      }
      await sb.from("profile_tags").insert({ profile_id: profileId, tag_id: existing.id });
      allTags.push(existing);
      selectedTagIds.add(existing.id);
    } else {
      await sb.from("profile_tags").insert({ profile_id: profileId, tag_id: newTag.id });
      allTags.push(newTag);
      selectedTagIds.add(newTag.id);
    }
    input.value = "";
    renderTagPicker(containerId, type, selectedTagIds, canEdit, profileId);
  });
}
