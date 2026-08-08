let viewer;
let isAdmin = false;
let profiles = [];
let projects = [];
let projectMembers = [];
let projectPartnersRows = [];
let partners = [];
let tasks = [];

const profileById = new Map();
const partnerById = new Map();
const membersByProject = new Map();
const partnersByProject = new Map();
const tasksByProject = new Map();

(async () => {
  viewer = await renderShell();
  isAdmin = viewer.role === "admin";

  const [
    profilesRes,
    projectsRes,
    projectMembersRes,
    projectPartnersRes,
    partnersRes,
    tasksRes,
  ] = await Promise.all([
    sb.from("profiles").select("id, full_name, email, status").order("full_name"),
    sb.from("projects").select("*").order("deadline", { ascending: true, nullsFirst: false }),
    sb.from("project_members").select("project_id, profile_id"),
    sb.from("project_partners").select("project_id, partner_id"),
    sb.from("partners").select("id, company_name").order("company_name"),
    sb.from("tasks").select("*").order("created_at"),
  ]);

  profiles = profilesRes.data ?? [];
  projects = projectsRes.data ?? [];
  projectMembers = projectMembersRes.data ?? [];
  projectPartnersRows = projectPartnersRes.data ?? [];
  partners = partnersRes.data ?? [];
  tasks = tasksRes.data ?? [];

  for (const p of profiles) profileById.set(p.id, p);
  for (const p of partners) partnerById.set(p.id, p);
  for (const pm of projectMembers) {
    if (!membersByProject.has(pm.project_id)) membersByProject.set(pm.project_id, []);
    membersByProject.get(pm.project_id).push(pm.profile_id);
  }
  for (const pp of projectPartnersRows) {
    if (!partnersByProject.has(pp.project_id)) partnersByProject.set(pp.project_id, []);
    partnersByProject.get(pp.project_id).push(pp.partner_id);
  }
  for (const t of tasks) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");

  if (projectId) {
    renderDetail(projectId);
  } else {
    renderList();
  }
})();

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function progressFor(projectId) {
  const list = tasksByProject.get(projectId) ?? [];
  const done = list.filter((t) => t.status === "zavrseno").length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// List view — few projects, so a detailed vertical list beats a card grid.
// ---------------------------------------------------------------------------

function renderList() {
  document.getElementById("projectCount").textContent = `${projects.length} projekata ukupno.`;

  if (isAdmin) {
    const btn = document.getElementById("newProjectBtn");
    btn.hidden = false;
    btn.addEventListener("click", () => openProjectForm(null));
  }

  const list = document.getElementById("projectList");
  list.innerHTML = projects.length
    ? projects
        .map((p) => {
          const memberIds = membersByProject.get(p.id) ?? [];
          const partnerIds = partnersByProject.get(p.id) ?? [];
          const { done, total, pct } = progressFor(p.id);
          const duration = formatDuration(p.start_date, p.deadline);
          const dateRange = p.start_date && p.deadline
            ? `${formatDate(p.start_date)} → ${formatDate(p.deadline)}`
            : p.deadline
              ? `Do ${formatDate(p.deadline)}`
              : "Bez datuma";
          const memberLabel = memberIds.length ? `${memberIds.length} ${memberIds.length === 1 ? "član" : "članova"}` : null;
          const partnerLabel = partnerIds.length ? `${partnerIds.length} ${partnerIds.length === 1 ? "partner" : "partnera"}` : null;

          return `
        <a class="ledger-row" href="projekti.html?id=${p.id}">
          <div>
            <span class="ledger-row__name">${escapeHtml(p.name)}</span>
            <span class="ledger-row__meta">
              <span class="status-dot ${PROJECT_STATUS_DOT[p.status] ?? ""}" style="margin-right:8px">${PROJECT_STATUS_LABELS[p.status] ?? p.status}</span>
              ${dateRange}${duration ? ` · ${duration}` : ""}${memberLabel ? ` · ${memberLabel}` : ""}${partnerLabel ? ` · ${partnerLabel}` : ""}
            </span>
          </div>
          <div class="ledger-row__value">
            <span class="ledger-row__pct">${total ? pct + "%" : "—"}</span>
            <span class="ledger-row__sub">${done}/${total} zadataka</span>
            ${total ? `<div class="ledger-row__bar"><span style="width:${pct}%"></span></div>` : ""}
          </div>
        </a>
      `;
        })
        .join("")
    : '<p class="empty-state">Još nema projekata.</p>';
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function renderDetail(id) {
  const project = projects.find((p) => p.id === id);
  document.getElementById("projectListView").hidden = true;
  const view = document.getElementById("projectDetailView");
  view.hidden = false;

  if (!project) {
    view.innerHTML = '<p class="empty-state">Projekat nije pronađen.</p>';
    return;
  }

  document.getElementById("detailName").textContent = project.name;
  document.getElementById("detailStatus").textContent = PROJECT_STATUS_LABELS[project.status] ?? project.status;
  document.getElementById("detailDescription").textContent = project.description || "Bez opisa.";

  const days = daysUntil(project.deadline);
  document.getElementById("metaStart").textContent = project.start_date ? formatDate(project.start_date) : "—";
  document.getElementById("metaDeadline").textContent = project.deadline ? formatDate(project.deadline) : "Bez roka";
  document.getElementById("metaDuration").textContent = formatDuration(project.start_date, project.deadline) ?? "—";
  document.getElementById("metaDaysLeft").textContent =
    project.deadline == null ? "—" : days < 0 ? `Kasni ${-days} d.` : days === 0 ? "Danas" : `${days} d.`;
  const { done, total } = progressFor(project.id);
  document.getElementById("metaTasks").textContent = `${done}/${total}`;
  document.getElementById("metaCreated").textContent = formatDate(project.created_at);

  const memberIds = membersByProject.get(project.id) ?? [];
  document.getElementById("detailMembers").innerHTML = memberIds.length
    ? memberIds
        .map((mid) => {
          const m = profileById.get(mid);
          return `<span class="member-chip"><span class="member-chip__avatar">${initials(m?.full_name)}</span>${escapeHtml(m?.full_name ?? "?")}</span>`;
        })
        .join("")
    : '<p class="text-muted">Nema dodeljenih članova.</p>';

  const partnerIds = partnersByProject.get(project.id) ?? [];
  document.getElementById("detailPartners").innerHTML = partnerIds.length
    ? partnerIds
        .map((pid) => {
          const partner = partnerById.get(pid);
          return `<a class="partner-chip" href="partneri.html">${escapeHtml(partner?.company_name ?? "?")}</a>`;
        })
        .join("")
    : '<p class="text-muted">Nema povezanih partnera.</p>';

  if (isAdmin) {
    const editBtn = document.getElementById("editProjectBtn");
    editBtn.hidden = false;
    editBtn.onclick = () => openProjectForm(project);

    const newTaskBtn = document.getElementById("newTaskBtn");
    newTaskBtn.hidden = false;
    newTaskBtn.onclick = () => openTaskForm(project);
  }

  renderFinanceSection(project);
  renderTaskColumns(project);
}

// ---------------------------------------------------------------------------
// Finance panel — admin sees budget/spent/remaining + can add transactions;
// everyone else just gets a submission button (RLS keeps it write-only for
// them, so there's nothing to read back into this section either way).
// ---------------------------------------------------------------------------

async function renderFinanceSection(project) {
  const container = document.getElementById("financeSection");

  if (!isAdmin) {
    container.innerHTML = `
      <div class="panel">
        <h3>Troškovi</h3>
        <p class="text-muted" style="margin:0 0 12px">Potrošio/la si nešto za ovaj projekat? Prijavi trošak — uprava ga odobrava.</p>
        <button type="button" class="btn btn--ghost btn--sm" id="submitExpenseBtn">Prijavi trošak</button>
      </div>
    `;
    document
      .getElementById("submitExpenseBtn")
      .addEventListener("click", () => openExpenseSubmitForm(project));
    return;
  }

  const { data: projectTx } = await sb
    .from("transactions")
    .select("*")
    .eq("project_id", project.id)
    .order("date", { ascending: false });

  const list = projectTx ?? [];
  const spent = list
    .filter((t) => t.type === "rashod" && t.status !== "odbijeno")
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const budget = Number(project.budget_amount ?? 0);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  container.innerHTML = `
    <div class="panel">
      <div class="portal-head-row" style="margin-bottom:10px">
        <h3 style="margin:0">Finansije projekta</h3>
        <button type="button" class="btn btn--ghost btn--sm" id="addProjectTxBtn">+ Transakcija</button>
      </div>
      ${
        budget > 0
          ? `<p class="text-muted" style="margin:0 0 8px">Potrošeno ${formatCurrency(spent)} / Budžet ${formatCurrency(budget)}</p>
             <div class="progress" style="height:8px;margin-bottom:14px"><div class="progress__fill" style="width:${pct}%;background:${pct > 100 ? "#b3261e" : "var(--gain)"}"></div></div>`
          : `<p class="text-muted" style="margin:0 0 14px">Potrošeno ${formatCurrency(spent)} — budžet nije postavljen (uredi projekat da ga dodaš).</p>`
      }
      <div id="projectTxList" class="row-list"></div>
    </div>
  `;

  document.getElementById("projectTxList").innerHTML = list.length
    ? list
        .map(
          (t) => `
      <div class="row-item">
        <span class="row-item__title">${TRANSACTION_TYPE_LABELS[t.type]} · ${escapeHtml(t.category)}</span>
        <span class="row-item__meta">
          <span class="status-dot ${TRANSACTION_STATUS_DOT[t.status] ?? ""}">${TRANSACTION_STATUS_LABELS[t.status] ?? t.status}</span>
          · ${formatCurrency(t.amount)}
        </span>
      </div>
    `,
        )
        .join("")
    : '<p class="empty-state">Još nema transakcija za ovaj projekat.</p>';

  document.getElementById("addProjectTxBtn").addEventListener("click", () => openProjectTxForm(project));
}

function openExpenseSubmitForm(project) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Prijavi trošak — ${escapeHtml(project.name)}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="expenseForm">
      <label class="field-label">
        <span>Kategorija (npr. Prevoz, Ketering)</span>
        <input id="e_category" required>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Iznos (RSD)</span>
          <input id="e_amount" type="number" min="0.01" step="0.01" required>
        </label>
        <label class="field-label">
          <span>Datum</span>
          <input id="e_date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>
      <label class="field-label">
        <span>Za šta je potrošeno</span>
        <textarea id="e_description" required></textarea>
      </label>
      <p class="text-muted" style="font-size:.82rem">Ide na čekanje odobrenja upravi — nećeš moći da vidiš status ovde, ali javiće ti se ako nešto ne štima.</p>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Pošalji na odobrenje</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("expenseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.from("transactions").insert({
      type: "rashod",
      category: document.getElementById("e_category").value.trim(),
      amount: Number(document.getElementById("e_amount").value),
      date: document.getElementById("e_date").value,
      description: document.getElementById("e_description").value.trim(),
      status: "na_cekanju",
      project_id: project.id,
      created_by: viewer.id,
    });
    if (error) return toast(error.message, "error");
    toast("Poslato na odobrenje.");
    closeModal();
  });
}

function openProjectTxForm(project) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Nova transakcija — ${escapeHtml(project.name)}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="pTxForm">
      <label class="field-label">
        <span>Tip</span>
        <select id="pt_type">
          <option value="rashod" selected>Rashod</option>
          <option value="prihod">Prihod</option>
        </select>
      </label>
      <label class="field-label">
        <span>Kategorija</span>
        <input id="pt_category" list="categoryOptions" required>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Iznos (RSD)</span>
          <input id="pt_amount" type="number" min="0.01" step="0.01" required>
        </label>
        <label class="field-label">
          <span>Datum</span>
          <input id="pt_date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>
      <label class="field-label">
        <span>Status</span>
        <select id="pt_status">
          <option value="odobreno" selected>Odobreno</option>
          <option value="zavrseno">Završeno</option>
          <option value="na_cekanju">Čeka odobrenje</option>
        </select>
      </label>
      <label class="field-label">
        <span>Opis</span>
        <textarea id="pt_description"></textarea>
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

  document.getElementById("pTxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.from("transactions").insert({
      type: document.getElementById("pt_type").value,
      category: document.getElementById("pt_category").value.trim(),
      amount: Number(document.getElementById("pt_amount").value),
      date: document.getElementById("pt_date").value,
      status: document.getElementById("pt_status").value,
      description: document.getElementById("pt_description").value.trim() || null,
      project_id: project.id,
      created_by: viewer.id,
    });
    if (error) return toast(error.message, "error");
    toast("Sačuvano.");
    closeModal();
    renderFinanceSection(project);
  });
}

function renderTaskColumns(project) {
  const list = tasksByProject.get(project.id) ?? [];
  const columns = { todo: [], u_toku: [], zavrseno: [] };
  for (const t of list) (columns[t.status] ?? columns.todo).push(t);

  for (const status of Object.keys(columns)) {
    const el = document.getElementById(`col_${status}`);
    el.innerHTML = columns[status].length
      ? columns[status].map((t) => taskCardHtml(t)).join("")
      : '<p class="text-muted" style="font-size:.8rem">Nema zadataka.</p>';
  }

  list.forEach((t) => {
    const select = document.getElementById(`taskStatus_${t.id}`);
    if (!select) return;
    const canEdit = isAdmin || t.assignee_id === viewer.id;
    select.disabled = !canEdit;
    if (canEdit) {
      select.addEventListener("change", async () => {
        const { error } = await sb.from("tasks").update({ status: select.value }).eq("id", t.id);
        if (error) {
          toast(error.message, "error");
          return;
        }
        t.status = select.value;
        document.getElementById("metaTasks").textContent = (() => {
          const { done, total } = progressFor(project.id);
          return `${done}/${total}`;
        })();
        toast("Status ažuriran.");
        renderTaskColumns(project);
      });
    }
  });
}

function taskCardHtml(t) {
  const assignee = t.assignee_id ? profileById.get(t.assignee_id) : null;
  return `
    <div class="task-card">
      <p class="task-card__title">${escapeHtml(t.title)}</p>
      <div class="task-card__meta">
        <span>${assignee ? escapeHtml(assignee.full_name) : "Nedodeljeno"}${t.due_date ? " · " + formatDate(t.due_date) : ""}</span>
      </div>
      <select id="taskStatus_${t.id}" style="margin-top:8px">
        ${Object.entries(TASK_STATUS_LABELS)
          .map(([val, label]) => `<option value="${val}" ${t.status === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Project create/edit modal (admin only)
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

function openProjectForm(project) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");
  const memberIds = new Set(project ? membersByProject.get(project.id) ?? [] : []);
  const partnerIds = new Set(project ? partnersByProject.get(project.id) ?? [] : []);
  const activeProfiles = profiles.filter((p) => p.status === "active");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">${project ? "Uredi projekat" : "Novi projekat"}</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="projectForm">
      <label class="field-label">
        <span>Naziv</span>
        <input id="p_name" value="${escapeHtml(project?.name ?? "")}" required>
      </label>
      <label class="field-label">
        <span>Opis</span>
        <textarea id="p_description">${escapeHtml(project?.description ?? "")}</textarea>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Datum početka</span>
          <input id="p_start" type="date" value="${project?.start_date ?? ""}">
        </label>
        <label class="field-label">
          <span>Datum završetka</span>
          <input id="p_deadline" type="date" value="${project?.deadline ?? ""}">
        </label>
      </div>
      <div class="field-grid">
        <label class="field-label">
          <span>Status</span>
          <select id="p_status">
            ${Object.entries(PROJECT_STATUS_LABELS)
              .map(
                ([val, label]) =>
                  `<option value="${val}" ${project?.status === val ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Budžet (RSD, opciono)</span>
          <input id="p_budget" type="number" min="0" step="1" value="${project?.budget_amount ?? ""}">
        </label>
      </div>
      <h4 style="margin:14px 0 8px">Članovi na projektu</h4>
      <div class="tag-picker" id="memberPicker">
        ${activeProfiles
          .map(
            (p) => `
          <button type="button" class="tag-picker__option ${memberIds.has(p.id) ? "is-selected" : ""}" data-id="${p.id}">${escapeHtml(p.full_name || p.email)}</button>
        `,
          )
          .join("")}
      </div>
      <h4 style="margin:14px 0 8px">Partneri uključeni u projekat</h4>
      <div class="tag-picker" id="partnerPicker">
        ${
          partners.length
            ? partners
                .map(
                  (p) => `
          <button type="button" class="tag-picker__option ${partnerIds.has(p.id) ? "is-selected" : ""}" data-id="${p.id}">${escapeHtml(p.company_name)}</button>
        `,
                )
                .join("")
            : '<p class="text-muted" style="font-size:.85rem;margin:0">Još nema partnera u bazi.</p>'
        }
      </div>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Sačuvaj</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("memberPicker").querySelectorAll(".tag-picker__option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (memberIds.has(id)) memberIds.delete(id);
      else memberIds.add(id);
      btn.classList.toggle("is-selected");
    });
  });

  document.getElementById("partnerPicker").querySelectorAll(".tag-picker__option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (partnerIds.has(id)) partnerIds.delete(id);
      else partnerIds.add(id);
      btn.classList.toggle("is-selected");
    });
  });

  document.getElementById("projectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      name: document.getElementById("p_name").value.trim(),
      description: document.getElementById("p_description").value.trim() || null,
      start_date: document.getElementById("p_start").value || null,
      deadline: document.getElementById("p_deadline").value || null,
      status: document.getElementById("p_status").value,
      budget_amount: document.getElementById("p_budget").value
        ? Number(document.getElementById("p_budget").value)
        : null,
    };

    let savedId = project?.id;
    if (project) {
      const { error } = await sb.from("projects").update(values).eq("id", project.id);
      if (error) return toast(error.message, "error");
      Object.assign(project, values);
    } else {
      const { data, error } = await sb
        .from("projects")
        .insert({ ...values, created_by: viewer.id })
        .select()
        .single();
      if (error) return toast(error.message, "error");
      savedId = data.id;
      projects.unshift(data);
    }

    await syncJoinTable("project_members", "profile_id", savedId, membersByProject, memberIds);
    await syncJoinTable("project_partners", "partner_id", savedId, partnersByProject, partnerIds);

    toast("Sačuvano.");
    closeModal();
    window.location.href = `projekti.html?id=${savedId}`;
  });
}

async function syncJoinTable(table, otherKey, projectId, cacheMap, desiredIds) {
  const existing = new Set(cacheMap.get(projectId) ?? []);
  const toAdd = [...desiredIds].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !desiredIds.has(id));

  if (toAdd.length) {
    await sb.from(table).insert(toAdd.map((id) => ({ project_id: projectId, [otherKey]: id })));
  }
  for (const id of toRemove) {
    await sb.from(table).delete().eq("project_id", projectId).eq(otherKey, id);
  }
  cacheMap.set(projectId, [...desiredIds]);
}

// ---------------------------------------------------------------------------
// Task create modal (admin only)
// ---------------------------------------------------------------------------

function openTaskForm(project) {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");
  const memberIds = membersByProject.get(project.id) ?? [];
  const assignable = memberIds.map((id) => profileById.get(id)).filter(Boolean);

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Novi zadatak</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="taskForm">
      <label class="field-label">
        <span>Naziv</span>
        <input id="t_title" required>
      </label>
      <label class="field-label">
        <span>Opis (opciono)</span>
        <textarea id="t_description"></textarea>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Zadužen</span>
          <select id="t_assignee">
            <option value="">Nedodeljeno</option>
            ${assignable.map((p) => `<option value="${p.id}">${escapeHtml(p.full_name || p.email)}</option>`).join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Rok</span>
          <input id="t_due" type="date">
        </label>
      </div>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary">Dodaj zadatak</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      project_id: project.id,
      title: document.getElementById("t_title").value.trim(),
      description: document.getElementById("t_description").value.trim() || null,
      assignee_id: document.getElementById("t_assignee").value || null,
      due_date: document.getElementById("t_due").value || null,
      created_by: viewer.id,
    };
    const { data, error } = await sb.from("tasks").insert(values).select().single();
    if (error) return toast(error.message, "error");

    if (!tasksByProject.has(project.id)) tasksByProject.set(project.id, []);
    tasksByProject.get(project.id).push(data);

    toast("Zadatak dodat.");
    closeModal();
    renderTaskColumns(project);
  });
}
