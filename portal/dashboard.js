(async () => {
  const profile = await renderShell();
  const firstName = (profile.full_name || profile.email).split(/\s+/)[0];
  document.getElementById("userFirstName").textContent = firstName;
  const isAdmin = profile.role === "admin";

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
    sb.from("partners").select("id, company_name, status").order("company_name"),
  ]);

  const projectList = projects ?? [];
  const taskList = tasks ?? [];
  const partnerList = partners ?? [];
  const activeProjectsCount = projectList.filter((p) => p.status !== "zavrsen").length;

  // ---------- Hero ----------
  // Cash position, not progress toward a goal someone typed into settings.
  // The old hero led with collected-vs-annual_goal, which is a bad lead for
  // three reasons: the denominator is a guess (and defaults to 0, so the
  // biggest element on the page was usually empty), it counts only inflow so
  // the club could hit "100%" while insolvent, and it barely moves — a
  // yearly figure on a screen opened weekly. What the uprava actually needs
  // on open is "how much can we commit to right now", which is settled
  // balance minus money already promised.
  let finance = null;
  if (isAdmin) {
    const { data: tx } = await sb.from("transactions").select("type, status, amount");
    const list = tx ?? [];
    const sumOf = (type, status) =>
      list
        .filter((t) => t.type === type && t.status === status)
        .reduce((acc, t) => acc + Number(t.amount), 0);

    const primljeno = sumOf("prihod", "zavrseno");
    const potroseno = sumOf("rashod", "zavrseno");
    const stanje = primljeno - potroseno;
    // Approved but not yet settled: on the expense side that is money already
    // spoken for; on the income side it is contracted sponsorship not yet in
    // the account. Pending ('na_cekanju') is deliberately excluded from both —
    // nothing stands behind it yet except someone's request.
    const obaveze = sumOf("rashod", "odobreno");
    const ocekivano = sumOf("prihod", "odobreno");

    finance = {
      primljeno,
      potroseno,
      stanje,
      obaveze,
      ocekivano,
      raspolozivo: stanje - obaveze,
      pendingCount: list.filter((t) => t.status === "na_cekanju").length,
    };
  }

  const hero = document.getElementById("heroStats");
  if (isAdmin && finance) {
    const f = finance;
    hero.innerHTML = `
      <div>
        <p class="statement__folio">Stanje sredstava <span>na dan ${formatDate(new Date())}</span></p>
        <div class="statement__figure ${f.raspolozivo < 0 ? "is-negative" : ""}">
          ${formatSigned(f.raspolozivo)}<span class="statement__unit">RSD raspoloživo</span>
        </div>
        <p class="statement__note">
          Koliko klub sme da preuzme na sebe danas — stanje na računu umanjeno
          za rashode koji su već odobreni, a još nisu plaćeni.
        </p>
        ${
          f.pendingCount
            ? `<a class="statement__flag" href="finansije.html">${f.pendingCount} ${f.pendingCount === 1 ? "stavka čeka" : "stavki čeka"} tvoje odobrenje &rarr;</a>`
            : `<a class="statement__flag" href="finansije.html">Knjiga transakcija &rarr;</a>`
        }
      </div>

      <dl class="statement__calc">
        <div class="calc-row"><dt>Primljeno</dt><dd>${formatAmount(f.primljeno)}</dd></div>
        <div class="calc-row"><dt>Potrošeno</dt><dd>−${formatAmount(f.potroseno)}</dd></div>
        <div class="calc-row calc-row--sub"><dt>Stanje na računu</dt><dd>${formatSigned(f.stanje)}</dd></div>
        <div class="calc-row"><dt>Odobreni rashodi</dt><dd>−${formatAmount(f.obaveze)}</dd></div>
        <div class="calc-row calc-row--total"><dt>Raspoloživo</dt><dd>${formatSigned(f.raspolozivo)}</dd></div>
        <div class="calc-row calc-row--aside">
          <dt>Ugovoreno, nenaplaćeno<span class="calc-row__hint">Potpisana sponzorstva</span></dt>
          <dd>+${formatAmount(f.ocekivano)}</dd>
        </div>
      </dl>
    `;
  } else {
    hero.innerHTML = `
      <div>
        <p class="statement__folio">Sastav kluba <span>na dan ${formatDate(new Date())}</span></p>
        <div class="statement__figure">
          ${activeMembers ?? 0}<span class="statement__unit">aktivnih članova</span>
        </div>
        <p class="statement__note">
          ${activeProjectsCount} ${activeProjectsCount === 1 ? "projekat je" : "projekata je"} u radu
          kroz ${(sectors ?? []).length} ${(sectors ?? []).length === 1 ? "sektor" : "sektora"}.
        </p>
        <a class="statement__flag" href="projekti.html">Projekti kluba &rarr;</a>
      </div>

      <dl class="statement__calc">
        <div class="calc-row"><dt>Aktivnih projekata</dt><dd>${activeProjectsCount}</dd></div>
        <div class="calc-row"><dt>Partnera u bazi</dt><dd>${partnerList.length}</dd></div>
        <div class="calc-row"><dt>Sektora</dt><dd>${(sectors ?? []).length}</dd></div>
        <div class="calc-row calc-row--total"><dt>Aktivnih članova</dt><dd>${activeMembers ?? 0}</dd></div>
      </dl>
    `;
  }

  // ---------- Active projects (ledger rows) ----------
  const tasksByProject = new Map();
  for (const t of taskList) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id).push(t);
  }
  const activeProjects = projectList.filter((p) => p.status !== "zavrsen").slice(0, 6);
  document.getElementById("activeProjectsCount").textContent = activeProjectsCount;

  document.getElementById("activeProjects").innerHTML = activeProjects.length
    ? activeProjects
        .map((p) => {
          const pTasks = tasksByProject.get(p.id) ?? [];
          const done = pTasks.filter((t) => t.status === "zavrseno").length;
          const pct = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
          return `
          <a class="ledger-row" href="projekti.html?id=${p.id}">
            <div>
              <span class="ledger-row__name">${escapeHtml(p.name)}</span>
              <span class="ledger-row__meta">${PROJECT_STATUS_LABELS[p.status] ?? p.status}${p.deadline ? " · rok " + formatDate(p.deadline) : ""}</span>
            </div>
            <div class="ledger-row__value">
              <span class="ledger-row__pct">${pTasks.length ? pct + "%" : "—"}</span>
              <span class="ledger-row__sub">${done}/${pTasks.length} zadataka</span>
              ${pTasks.length ? `<div class="ledger-row__bar"><span style="width:${pct}%"></span></div>` : ""}
            </div>
          </a>
        `;
        })
        .join("")
    : '<p class="empty-state">Nema aktivnih projekata.</p>';

  // ---------- Upcoming deadlines ----------
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
        .slice(0, 6)
        .map(
          (item) => `
      <div class="mini-row mini-row--split">
        <span>${escapeHtml(item.label)}</span>
        <span class="text-muted" style="font-size:.85rem">${item.days < 0 ? "kasni" : item.days === 0 ? "danas" : "za " + item.days + " d."}</span>
      </div>
    `,
        )
        .join("")
    : '<p class="empty-state">Nema rokova u narednih 14 dana.</p>';

  // ---------- Sector composition ----------
  const sectorCounts = new Map((sectors ?? []).map((s) => [s.id, { name: s.name, count: 0 }]));
  let noSector = 0;
  for (const p of profilesForChart ?? []) {
    if (p.sector_id && sectorCounts.has(p.sector_id)) sectorCounts.get(p.sector_id).count++;
    else noSector++;
  }
  const sectorRows = [...sectorCounts.values()];
  if (noSector) sectorRows.push({ name: "Bez sektora", count: noSector });
  const maxSector = Math.max(1, ...sectorRows.map((s) => s.count));

  document.getElementById("sectorChart").innerHTML =
    sectorRows
      .map(
        (s) => `
      <div class="mini-row">
        <span class="mini-row__name mini-row__name--icon">${sectorIcon(s.name)}<span>${escapeHtml(s.name)}</span></span>
        <span class="mini-row__bar"><span style="width:${(s.count / maxSector) * 100}%"></span></span>
        <span class="mini-row__count">${s.count}</span>
      </div>
    `,
      )
      .join("") || '<p class="empty-state">Nema podataka.</p>';

  // ---------- Partners, by name (not grouped by status) ----------
  document.getElementById("partnerBreakdown").innerHTML = partnerList.length
    ? partnerList
        .map(
          (p) => `
      <div class="mini-row mini-row--split">
        <span>${escapeHtml(p.company_name)}</span>
        <span class="status-dot ${PARTNER_STATUS_DOT[p.status] ?? ""}">${PARTNER_STATUS_LABELS[p.status] ?? p.status}</span>
      </div>
    `,
        )
        .join("")
    : '<p class="empty-state">Još nema partnera u bazi.</p>';
})();
