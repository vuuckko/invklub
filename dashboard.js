(async () => {
  const profile = await renderShell();
  const firstName = (profile.full_name || profile.email).split(/\s+/)[0];
  document.getElementById("userFirstName").textContent = firstName;

  const [
    { count: activeMembers },
    { data: sectors },
    { data: profilesForChart },
    { data: projects },
    { data: tasks },
    { data: partners },
  ] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    sb.from("sectors").select("id, name").order("name"),
    sb.from("profiles").select("sector_id").eq("status", "active"),
    sb.from("projects").select("*").order("deadline", { ascending: true, nullsFirst: false }),
    sb.from("tasks").select("id, project_id, status, due_date, title"),
    sb.from("partners").select("id, status"),
  ]);

  const projectList = projects ?? [];
  const taskList = tasks ?? [];
  const partnerList = partners ?? [];

  // ---------- Ledger stat row ----------
  const activeProjectsCount = projectList.filter((p) => p.status !== "zavrsen").length;
  const activeSaradnja = partnerList.filter((p) => p.status === "aktivna_saradnja").length;
  document.getElementById("statGrid").innerHTML = `
    <div class="ledger__item">
      <span class="ledger__num">${activeMembers ?? 0}</span>
      <span class="ledger__label">Aktivnih članova</span>
    </div>
    <div class="ledger__item">
      <span class="ledger__num">${activeProjectsCount}</span>
      <span class="ledger__label">Aktivnih projekata</span>
    </div>
    <div class="ledger__item">
      <span class="ledger__num">${partnerList.length}</span>
      <span class="ledger__label">Partnera u bazi</span>
    </div>
    <div class="ledger__item ledger__item--gain">
      <span class="ledger__num">${activeSaradnja}</span>
      <span class="ledger__label">Aktivnih saradnji</span>
    </div>
  `;

  // ---------- Sector breakdown chart ----------
  const sectorCounts = new Map((sectors ?? []).map((s) => [s.id, { name: s.name, count: 0 }]));
  let noSector = 0;
  for (const p of profilesForChart ?? []) {
    if (p.sector_id && sectorCounts.has(p.sector_id)) sectorCounts.get(p.sector_id).count++;
    else noSector++;
  }
  const chartRows = [...sectorCounts.values()];
  if (noSector) chartRows.push({ name: "Bez sektora", count: noSector });
  const maxCount = Math.max(1, ...chartRows.map((s) => s.count));

  document.getElementById("sectorChart").innerHTML =
    chartRows
      .map(
        (s) => `
      <div class="barchart__row">
        <span class="barchart__label">${escapeHtml(s.name)}</span>
        <span class="barchart__track"><span class="barchart__fill" style="width:${(s.count / maxCount) * 100}%"></span></span>
        <span class="barchart__count">${s.count}</span>
      </div>
    `,
      )
      .join("") || '<p class="empty-state">Nema podataka.</p>';

  // ---------- Active projects with task progress ----------
  const tasksByProject = new Map();
  for (const t of taskList) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }
  const activeProjects = projectList.filter((p) => p.status !== "zavrsen").slice(0, 6);

  document.getElementById("activeProjects").innerHTML = activeProjects.length
    ? activeProjects
        .map((p) => {
          const pTasks = tasksByProject.get(p.id) ?? [];
          const done = pTasks.filter((t) => t.status === "zavrseno").length;
          const pct = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
          return `
          <div class="row-item" style="flex-direction:column;align-items:stretch;gap:6px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <a href="projekti.html?id=${p.id}" class="row-item__title">${escapeHtml(p.name)}</a>
              <span class="row-item__meta">${PROJECT_STATUS_LABELS[p.status] ?? p.status}</span>
            </div>
            <div class="progress"><div class="progress__fill" style="width:${pct}%"></div></div>
            <span class="row-item__meta">${done}/${pTasks.length} zadataka završeno${p.deadline ? " · do " + formatDate(p.deadline) : ""}${formatDuration(p.start_date, p.deadline) ? " · " + formatDuration(p.start_date, p.deadline) : ""}</span>
          </div>
        `;
        })
        .join("")
    : '<p class="empty-state">Nema aktivnih projekata.</p>';

  // ---------- Upcoming deadlines (tasks + projects, next 14 days) ----------
  const deadlineItems = [];
  for (const t of taskList) {
    if (t.due_date && t.status !== "zavrseno") {
      const d = daysUntil(t.due_date);
      if (d !== null && d <= 14) deadlineItems.push({ label: t.title, date: t.due_date, days: d });
    }
  }
  for (const p of projectList) {
    if (p.deadline && p.status !== "zavrsen") {
      const d = daysUntil(p.deadline);
      if (d !== null && d <= 14) deadlineItems.push({ label: p.name, date: p.deadline, days: d });
    }
  }
  deadlineItems.sort((a, b) => a.days - b.days);

  document.getElementById("upcomingDeadlines").innerHTML = deadlineItems.length
    ? deadlineItems
        .slice(0, 8)
        .map(
          (item) => `
        <div class="row-item">
          <span class="row-item__title">${escapeHtml(item.label)}</span>
          <span class="row-item__meta">${item.days < 0 ? "kasni" : item.days === 0 ? "danas" : "za " + item.days + " d."} · ${formatDate(item.date)}</span>
        </div>
      `,
        )
        .join("")
    : '<p class="empty-state">Nema rokova u narednih 14 dana.</p>';

  // ---------- Partner status breakdown ----------
  const partnerCounts = {};
  for (const p of partnerList) partnerCounts[p.status] = (partnerCounts[p.status] ?? 0) + 1;

  document.getElementById("partnerBreakdown").innerHTML = Object.keys(PARTNER_STATUS_LABELS)
    .map(
      (key) => `
      <div class="row-item">
        <span class="row-item__title">${PARTNER_STATUS_LABELS[key]}</span>
        <span class="badge ${PARTNER_STATUS_BADGE[key]}">${partnerCounts[key] ?? 0}</span>
      </div>
    `,
    )
    .join("");
})();
