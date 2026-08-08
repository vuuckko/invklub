let viewer;
let note = { id: null, content: "", updated_by: null, updated_at: null };
const profileById = new Map();

(async () => {
  viewer = await renderShell();

  const [{ data: noteData }, { data: profilesData }] = await Promise.all([
    sb.from("club_notes").select("*").limit(1).maybeSingle(),
    sb.from("profiles").select("id, full_name, email"),
  ]);

  if (noteData) note = noteData;
  for (const p of profilesData ?? []) profileById.set(p.id, p);

  renderView();

  document.getElementById("editNoteBtn").addEventListener("click", enterEditMode);
  document.getElementById("cancelEditBtn").addEventListener("click", renderView);
  document.getElementById("notesEditForm").addEventListener("submit", saveNote);

  // Live sync — if someone else saves while you're just reading, pick it
  // up without a reload. Never while you're mid-edit: don't clobber a
  // draft you're actively typing under someone else's save.
  sb.channel("club-notes-realtime")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_notes" }, (payload) => {
      note = payload.new;
      if (document.getElementById("notesEditForm").hidden) renderView();
    })
    .subscribe();
})();

function personName(id) {
  const p = profileById.get(id);
  return p ? p.full_name || p.email : "—";
}

// Plain text, not markdown — a blank line starts a new paragraph, single
// line breaks stay inside one. escapeHtml() first, always: this is the
// one table in the app every member (not just admins) can write into, so
// it's the one place a stored-XSS attempt is most likely to land.
function renderContent(text) {
  if (!text || !text.trim()) {
    return '<p class="empty-state">Još nema beležaka. Klikni na olovčicu da napišeš prve.</p>';
  }
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderView() {
  document.getElementById("notesFolio").innerHTML = note.updated_at
    ? `Beleške<span>${note.updated_by ? escapeHtml(personName(note.updated_by)) + " · " : ""}${formatDate(note.updated_at)}</span>`
    : `Beleške<span>Još nije menjano</span>`;
  document.getElementById("notesBody").innerHTML = renderContent(note.content);
  document.getElementById("notesView").hidden = false;
  document.getElementById("notesEditForm").hidden = true;
}

function enterEditMode() {
  document.getElementById("notesTextarea").value = note.content ?? "";
  document.getElementById("notesView").hidden = true;
  document.getElementById("notesEditForm").hidden = false;
  document.getElementById("notesTextarea").focus();
}

async function saveNote(e) {
  e.preventDefault();
  const content = document.getElementById("notesTextarea").value;
  const saveBtn = document.getElementById("saveNoteBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Čuvam…";

  const { data, error } = await sb.from("club_notes").update({ content }).eq("id", note.id).select().single();

  saveBtn.disabled = false;
  saveBtn.textContent = "Sačuvaj";

  if (error) {
    toast(error.message, "error");
    return;
  }
  note = data;
  toast("Sačuvano.");
  renderView();
}
