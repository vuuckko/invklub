let viewer;
let projects = [];
let documents = [];
const profileById = new Map();
let documentsByProject = new Map();

const DOWNLOAD_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M12 3.5v11.5M8 11l4 4 4-4"/>
  <path d="M5 17v1.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V17"/>
</svg>`;

const DELETE_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M4.5 7h15"/>
  <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/>
  <path d="M6.5 7l.9 12.3a1.8 1.8 0 0 0 1.8 1.7h5.6a1.8 1.8 0 0 0 1.8-1.7L18.5 7"/>
  <path d="M10 11v6M14 11v6"/>
</svg>`;

(async () => {
  viewer = await renderShell();
  if (viewer.role !== "admin") {
    window.location.href = "index.html";
    return;
  }

  const [{ data: projectsData }, { data: docsData }, { data: profilesData }] = await Promise.all([
    sb.from("projects").select("id, name").order("deadline", { ascending: true, nullsFirst: false }),
    sb.from("documents").select("*").order("created_at", { ascending: false }),
    sb.from("profiles").select("id, full_name, email"),
  ]);

  projects = projectsData ?? [];
  documents = docsData ?? [];
  for (const p of profilesData ?? []) profileById.set(p.id, p);

  rebuildGroups();
  renderGroups();

  document.getElementById("newDocBtn").addEventListener("click", openUploadForm);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
})();

function personName(id) {
  const p = profileById.get(id);
  return p ? p.full_name || p.email : "—";
}

function rebuildGroups() {
  documentsByProject = new Map();
  for (const doc of documents) {
    const key = doc.project_id; // null groups under "Opšti dokumenti"
    if (!documentsByProject.has(key)) documentsByProject.set(key, []);
    documentsByProject.get(key).push(doc);
  }
}

// ---------------------------------------------------------------------------
// List — grouped by project instead of one page-wide table (same complaint
// as the old Baza članova table: one shape for everything reads as noise).
// Only groups that actually have a file render, since the upload modal can
// already target any project regardless of whether it has files yet — an
// empty section here would just be a placeholder nobody needs.
// ---------------------------------------------------------------------------

function renderGroups() {
  const container = document.getElementById("docGroups");
  document.getElementById("docCount").textContent =
    `${documents.length} ${documents.length === 1 ? "dokument" : "dokumenata"} ukupno.`;

  if (!documents.length) {
    container.innerHTML = '<p class="empty-state">Još nema otpremljenih dokumenata.</p>';
    return;
  }

  const groups = [];
  for (const project of projects) {
    const docs = documentsByProject.get(project.id) ?? [];
    if (docs.length) groups.push({ name: project.name, docs });
  }
  const general = documentsByProject.get(null) ?? [];
  if (general.length) groups.push({ name: "Opšti dokumenti", docs: general });

  container.innerHTML = groups.map(groupHtml).join("");

  container.querySelectorAll("[data-download]").forEach((btn) =>
    btn.addEventListener("click", () => downloadDocument(btn.dataset.download)),
  );
  container.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => deleteDocument(btn.dataset.delete)),
  );
}

function groupHtml(group) {
  return `
    <div class="panel doc-group">
      <div class="doc-group__head">
        <h3>${escapeHtml(group.name)}</h3>
        <span class="text-muted" style="font-size:.85rem">${group.docs.length}</span>
      </div>
      ${group.docs.map(docRowHtml).join("")}
    </div>
  `;
}

function docRowHtml(doc) {
  const ext = fileExtension(doc.name);
  return `
    <div class="doc-row">
      <span class="doc-row__icon">${navIcon("dokumenti")}</span>
      <div class="doc-row__body">
        <p class="doc-row__name">${escapeHtml(doc.name)}</p>
        <p class="doc-row__meta">
          ${ext ? `<span class="doc-row__ext">${escapeHtml(ext)}</span>` : ""}${formatFileSize(doc.file_size)} · ${escapeHtml(personName(doc.uploaded_by))} · ${formatDate(doc.created_at)}
        </p>
      </div>
      <div class="doc-row__actions">
        <button type="button" title="Preuzmi" data-download="${doc.id}">${DOWNLOAD_ICON_SVG}</button>
        <button type="button" class="is-danger" title="Obriši" data-delete="${doc.id}">${DELETE_ICON_SVG}</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

function openUploadForm() {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Dodaj dokument</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="uploadForm">
      <label class="field-label">
        <span>Projekat</span>
        <select id="d_project">
          <option value="">Opšti dokument (nije vezan za projekat)</option>
          ${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field-label">
        <span>Fajl</span>
        <input id="d_file" type="file" required>
      </label>
      <label class="field-label">
        <span>Naziv (opciono, podrazumevano ime fajla)</span>
        <input id="d_name" placeholder="npr. Ugovor o sponzorstvu — Banca Intesa">
      </label>
      <div class="modal__actions">
        <button type="submit" class="btn btn--primary" id="uploadSubmitBtn">Otpremi</button>
        <button type="button" class="btn btn--ghost" id="mCancel">Otkaži</button>
      </div>
    </form>
  `;

  backdrop.hidden = false;
  document.getElementById("mClose").addEventListener("click", closeModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  document.getElementById("uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = document.getElementById("d_file").files[0];
    if (!file) return;

    const projectId = document.getElementById("d_project").value || null;
    const displayName = document.getElementById("d_name").value.trim() || file.name;
    const submitBtn = document.getElementById("uploadSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Otpremam…";

    try {
      await uploadDocument({ file, projectId, displayName });
      const { data: docsData } = await sb.from("documents").select("*").order("created_at", { ascending: false });
      documents = docsData ?? [];
      rebuildGroups();
      renderGroups();
      toast("Dokument otpremljen.");
      closeModal();
    } catch (err) {
      toast(err.message ?? "Greška pri otpremanju.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Otpremi";
    }
  });
}

async function uploadDocument({ file, projectId, displayName }) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${projectId ?? "opsti"}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await sb.storage.from("documents").upload(path, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await sb.from("documents").insert({
    project_id: projectId,
    name: displayName,
    storage_path: path,
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: viewer.id,
  });
  if (insertError) throw insertError;
}

async function downloadDocument(id) {
  const doc = documents.find((d) => d.id === id);
  if (!doc) return;
  const { data, error } = await sb.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (error) return toast(error.message, "error");
  window.open(data.signedUrl, "_blank", "noopener");
}

async function deleteDocument(id) {
  const doc = documents.find((d) => d.id === id);
  if (!doc) return;
  if (!confirm(`Obrisati "${doc.name}"?`)) return;

  await sb.storage.from("documents").remove([doc.storage_path]);
  const { error } = await sb.from("documents").delete().eq("id", doc.id);
  if (error) return toast(error.message, "error");

  documents = documents.filter((d) => d.id !== id);
  rebuildGroups();
  renderGroups();
  toast("Dokument obrisan.");
}
