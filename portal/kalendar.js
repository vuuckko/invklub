const WEEKDAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const MONTH_NAMES = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

// Every dated thing on the calendar, normalised to the same shape:
// a start, an end (equal to start for single-day things) and a label.
// A month grid then only has to place ranges — it never needs to know
// whether something came from projects, tasks, transactions or
// calendar_events.
let entries = [];
let itemsByDate = new Map();
let viewYear, viewMonth;
let selectedDate = toDateKey(new Date());

let viewer;
let isAdmin = false;
let tasks = [];
let projects = [];
let payments = [];
let events = [];

(async () => {
  viewer = await renderShell();
  isAdmin = viewer.role === "admin";

  const [{ data: tasksData }, { data: projectsData }, { data: paymentsData }, { data: eventsData }] =
    await Promise.all([
      sb.from("tasks").select("id, title, due_date, status, project_id").not("due_date", "is", null),
      sb.from("projects").select("id, name, start_date, deadline, status"),
      // Empty for non-admins (RLS) — not an error, just nothing to plot.
      sb
        .from("transactions")
        .select("id, category, amount, date, status, partner_id, type")
        .eq("type", "prihod")
        .neq("status", "zavrseno")
        .neq("status", "odbijeno")
        .not("partner_id", "is", null),
      sb.from("calendar_events").select("*").order("start_date"),
    ]);

  tasks = tasksData ?? [];
  projects = projectsData ?? [];
  payments = paymentsData ?? [];
  events = eventsData ?? [];

  rebuildItems();

  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();

  document.getElementById("prevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => shiftMonth(1));
  document.getElementById("todayBtn").addEventListener("click", () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selectedDate = toDateKey(now);
    renderAll();
  });

  if (isAdmin) {
    const btn = document.getElementById("addEventBtn");
    btn.hidden = false;
    btn.addEventListener("click", () => openEventForm());
  }
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  renderAll();
})();

function renderAll() {
  renderCalendar();
  renderSelectedDay();
  renderUpcoming();
}

// ---------------------------------------------------------------------------
// Data -> entries
// ---------------------------------------------------------------------------

// How many distinct range colours exist — must match the .cal-ev--c0..cN
// rules in portal.css.
const SPAN_COLORS = 6;

// Stable colour per range, derived from its own id rather than from its
// position in the list: a project added later must not recolour every
// other project on the calendar.
function colorIndexFor(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
  return h % SPAN_COLORS;
}

function rebuildItems() {
  itemsByDate = new Map();
  entries = [];

  // --- ranges first, so colours can be resolved against real overlaps ---
  const ranges = [];
  for (const p of projects) {
    if (p.status === "zavrsen") continue;
    if (p.start_date && p.deadline) {
      ranges.push({
        id: p.id, kind: "project", label: p.name,
        start: p.start_date.slice(0, 10), end: p.deadline.slice(0, 10),
        href: `projekti.html?id=${p.id}`,
      });
    }
  }
  for (const ev of events) {
    if (ev.start_date !== ev.end_date) {
      ranges.push({
        id: ev.id, kind: "event", label: ev.title,
        start: ev.start_date.slice(0, 10), end: ev.end_date.slice(0, 10),
        href: null,
      });
    }
  }
  assignRangeColors(ranges);

  for (const r of ranges) {
    entries.push({ ...r, cls: `cal-ev--c${r.color}` });
    // Detail panel: the start and end days say so explicitly, and every
    // day in between reports the range as running. Without the middle
    // days, clicking the 20th of a month-long range showed "nothing on
    // this day", which is plainly false and was the least practical thing
    // about the old panel.
    addItem(r.start, { type: r.kind, id: r.id, label: `Početak: ${r.label}`, href: r.href });
    addItem(r.end, { type: r.kind, id: r.id, label: `Kraj: ${r.label}`, href: r.href });
    const cursor = new Date(r.start + "T00:00:00");
    const end = new Date(r.end + "T00:00:00");
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < end) {
      addItem(toDateKey(cursor), { type: "ongoing", id: r.id, label: r.label, href: r.href });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // --- single-day things ---
  const single = (date, o) => {
    const key = date.slice(0, 10);
    entries.push({ ...o, start: key, end: key });
    addItem(key, { type: o.kind, id: o.id, label: o.label, href: o.href });
  };

  for (const t of tasks) {
    if (t.status === "zavrseno") continue;
    single(t.due_date, {
      id: t.id, kind: "task", label: t.title,
      href: `projekti.html?id=${t.project_id}`, cls: "cal-ev--task",
    });
  }
  for (const p of projects) {
    if (p.status === "zavrsen") continue;
    // A project missing one of its two dates has no range to draw, so its
    // single known date shows on its own.
    if (p.start_date && p.deadline) continue;
    if (p.deadline) {
      single(p.deadline, { id: p.id, kind: "project", label: `Kraj: ${p.name}`, href: `projekti.html?id=${p.id}`, cls: "cal-ev--project" });
    } else if (p.start_date) {
      single(p.start_date, { id: p.id, kind: "project", label: `Početak: ${p.name}`, href: `projekti.html?id=${p.id}`, cls: "cal-ev--project" });
    }
  }
  for (const pay of payments) {
    single(pay.date, {
      id: pay.id, kind: "payment", label: `Uplata: ${formatCurrency(pay.amount)}`,
      href: "finansije.html", cls: "cal-ev--payment",
    });
  }
  for (const ev of events) {
    if (ev.start_date !== ev.end_date) continue;
    single(ev.start_date, { id: ev.id, kind: "event", label: ev.title, href: null, cls: "cal-ev--event" });
  }

  assignLanes();
}

// Lanes are assigned ONCE across the whole calendar, not per week. Packing
// each week independently looked tidier but made a range change rows from
// one week to the next (a month-long range sat on row 1 in its first week
// and row 4 in the next, purely because of how the week's own sort came
// out) — the bar appeared to jump, which reads as a rendering fault. A
// fixed lane costs the occasional empty row and is worth it.
//
// Longest-first within the same start date, so month-long ranges settle
// above one-day items rather than the order being an accident of which
// table was queried first.
function assignLanes() {
  const sorted = [...entries].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      dayDiff(b.start, b.end) - dayDiff(a.start, a.end) ||
      a.label.localeCompare(b.label),
  );
  const laneEnd = [];
  for (const e of sorted) {
    let lane = laneEnd.findIndex((end) => end < e.start);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = e.end;
    e.lane = lane;
  }
}

function addItem(dateKey, item) {
  if (!itemsByDate.has(dateKey)) itemsByDate.set(dateKey, []);
  itemsByDate.get(dateKey).push(item);
}

// Colour is the id hash by preference (so a project keeps its colour when
// an unrelated one is added), but that is only a preference: a plain hash
// can collide, and two ranges that collide WHILE OVERLAPPING would defeat
// the point of drawing them as separate bars. Any colour already held by a
// range this one overlaps is therefore skipped. Guaranteed distinct up to
// SPAN_COLORS concurrent ranges; beyond that colours must repeat, but the
// bars still sit on separate rows.
function assignRangeColors(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const placed = [];
  for (const r of sorted) {
    const taken = new Set(
      placed.filter((p) => p.end >= r.start && p.start <= r.end).map((p) => p.color),
    );
    let color = colorIndexFor(r.id);
    if (taken.has(color)) {
      for (let i = 1; i <= SPAN_COLORS; i++) {
        const candidate = (color + i) % SPAN_COLORS;
        if (!taken.has(candidate)) { color = candidate; break; }
      }
    }
    r.color = color;
    placed.push({ start: r.start, end: r.end, color });
  }
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(key, n) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

function shiftMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  else if (viewMonth > 11) { viewMonth = 0; viewYear++; }

  // Keep the day panel in the month you are actually looking at. It used to
  // keep showing e.g. "21. Avgust" while the grid had moved on to
  // Septembar, which read as a bug.
  const todayKey = toDateKey(new Date());
  const first = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
  selectedDate = todayKey.slice(0, 7) === first.slice(0, 7) ? todayKey : first;

  renderCalendar();
  renderSelectedDay();
}

// ---------------------------------------------------------------------------
// Month grid
//
// Each week is its own 7-column grid. Day cells occupy row 1 and stretch
// down through every row (grid-row:1/-1) as the clickable background;
// entries are placed on top of them with grid-column: <startDay> / span
// <days>, so a range becomes ONE bar carrying its own name across all the
// days it covers instead of an anonymous 4px line plus a chip truncated to
// "Poče…". Rows below the first are only created when something occupies
// them, so a quiet week collapses instead of reserving 96px per cell.
// ---------------------------------------------------------------------------

function renderCalendar() {
  document.getElementById("calTitle").textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  const gridStart = toDateKey(new Date(viewYear, viewMonth, 1 - startOffset));
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const weeks = [];
  for (let i = 0; i < cellCount; i += 7) {
    weeks.push(
      Array.from({ length: 7 }, (_, d) => {
        const key = addDays(gridStart, i + d);
        return { key, day: Number(key.slice(8, 10)), outside: Number(key.slice(5, 7)) !== viewMonth + 1 };
      }),
    );
  }

  const grid = document.getElementById("calGrid");
  grid.innerHTML =
    `<div class="cal-weekdays">${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join("")}</div>` +
    weeks.map((week) => weekHtml(week, todayKey)).join("");

  grid.querySelectorAll("[data-date]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedDate = el.dataset.date;
      renderCalendar();
      renderSelectedDay();
    });
  });
}

function weekHtml(week, todayKey) {
  const weekStart = week[0].key;
  const weekEnd = week[6].key;

  // Rows are packed per week, but in GLOBAL lane order — a hybrid, because
  // each pure approach fails on its own. Packing by the week's own sort
  // made ranges swap places between weeks (the bar appeared to jump).
  // Using the global lane as the literal grid row fixed that but left dead
  // gaps: in a week holding only lanes 1 and 6, rows 3-5 were still created
  // empty. Ordering by global lane keeps a range reliably above the same
  // neighbours everywhere, while re-packing keeps the rows contiguous.
  const inWeek = entries
    .filter((e) => e.end >= weekStart && e.start <= weekEnd)
    .map((e) => ({
      entry: e,
      from: e.start < weekStart ? weekStart : e.start,
      to: e.end > weekEnd ? weekEnd : e.end,
    }))
    .sort((a, b) => a.entry.lane - b.entry.lane);

  const rowEnd = [];
  const bars = inWeek.map((seg) => {
    const e = seg.entry;
    let lane = rowEnd.findIndex((end) => end < seg.from);
    if (lane === -1) lane = rowEnd.length;
    rowEnd[lane] = seg.to;

    const col = dayDiff(weekStart, seg.from) + 1;
    const span = dayDiff(seg.from, seg.to) + 1;
    const isStart = seg.from === e.start;
    const isEnd = seg.to === e.end;
    const attrs =
      `class="cal-ev ${e.cls}${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}" ` +
      `style="grid-column:${col} / span ${span};grid-row:${lane + 2}" ` +
      `title="${escapeHtml(e.label)}"`;

    return e.href
      ? `<a ${attrs} href="${e.href}">${escapeHtml(e.label)}</a>`
      : `<span ${attrs} data-date="${e.start}">${escapeHtml(e.label)}</span>`;
  });

  const days = week
    .map(
      (c, i) => `
      <div class="cal-day${c.outside ? " is-outside" : ""}${c.key === todayKey ? " is-today" : ""}${c.key === selectedDate ? " is-selected" : ""}"
           style="grid-column:${i + 1}" data-date="${c.key}">
        <span class="cal-day__num">${c.day}</span>
      </div>`,
    )
    .join("");

  return `<div class="cal-week">${days}${bars.join("")}</div>`;
}

function dayDiff(a, b) {
  return Math.round(
    (new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000,
  );
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------

const TYPE_BADGE = {
  task: "badge--light", project: "badge--gain", payment: "badge--warn",
  event: "badge--warn", ongoing: "badge--neutral",
};
const TYPE_LABEL = {
  task: "Zadatak", project: "Projekat", payment: "Uplata",
  event: "Rok", ongoing: "U toku",
};

function renderSelectedDay() {
  const items = itemsByDate.get(selectedDate) ?? [];
  const date = new Date(selectedDate + "T00:00:00");
  const isToday = selectedDate === toDateKey(new Date());

  document.getElementById("selectedDayTitle").textContent = isToday
    ? "Danas"
    : `${date.getDate()}. ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}.`;

  document.getElementById("selectedDayList").innerHTML = items.length
    ? items.map(rowItemHtml).join("")
    : '<p class="empty-state" style="padding:14px 0">Nema rokova ovog dana.</p>';

  bindDeleteButtons(document.getElementById("selectedDayList"));
}

// A month grid answers "what happens in August". The far more common
// question is "what is next", which used to need scrolling and counting.
function renderUpcoming() {
  const host = document.getElementById("upcomingList");
  if (!host) return;

  const todayKey = toDateKey(new Date());
  const soon = entries
    .filter((e) => e.end >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label))
    .slice(0, 7);

  host.innerHTML = soon.length
    ? soon.map(upcomingRowHtml).join("")
    : '<p class="empty-state" style="padding:14px 0">Nema predstojećih rokova.</p>';

  bindDeleteButtons(host);
}

function upcomingRowHtml(e) {
  const running = e.start <= toDateKey(new Date()) && e.end >= toDateKey(new Date());
  const days = dayDiff(toDateKey(new Date()), e.start);
  const when = running
    ? "u toku"
    : days === 0 ? "danas"
    : days === 1 ? "sutra"
    : `za ${days} dana`;

  const inner = `
    <span class="row-item__title">${escapeHtml(e.label)}</span>
    <span class="cal-when${running ? " is-running" : ""}">${when}</span>`;

  return e.href
    ? `<a class="row-item" href="${e.href}" style="text-decoration:none">${inner}</a>`
    : `<div class="row-item">${inner}</div>`;
}

function rowItemHtml(it) {
  const badge = `<span class="badge ${TYPE_BADGE[it.type] ?? "badge--light"}">${TYPE_LABEL[it.type] ?? it.type}</span>`;

  // Custom events have no target page — plain row, not a link — and admins
  // get an inline delete control since these are typed in by hand and will
  // occasionally need a quick fix. Only the real start/end rows carry it,
  // never an "u toku" row, so one range can't be deleted from 20 places.
  if (it.type === "event") {
    const del = isAdmin
      ? `<button type="button" class="row-item__delete" title="Obriši rok" data-delete-event="${it.id}">&times;</button>`
      : "";
    return `
      <div class="row-item">
        <span class="row-item__title">${escapeHtml(it.label)}</span>
        <span style="display:flex;align-items:center;gap:8px">${badge}${del}</span>
      </div>
    `;
  }

  if (!it.href) {
    return `
      <div class="row-item">
        <span class="row-item__title">${escapeHtml(it.label)}</span>
        ${badge}
      </div>
    `;
  }

  return `
    <a class="row-item" href="${it.href}" style="text-decoration:none">
      <span class="row-item__title">${escapeHtml(it.label)}</span>
      ${badge}
    </a>
  `;
}

function bindDeleteButtons(host) {
  host.querySelectorAll("[data-delete-event]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteEvent(btn.dataset.deleteEvent);
    }),
  );
}

// ---------------------------------------------------------------------------
// Add / delete standalone deadlines (admin only, enforced by RLS too).
// ---------------------------------------------------------------------------

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

function openEventForm() {
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");

  modalBody.innerHTML = `
    <div class="modal__head">
      <h3 style="margin:0">Dodaj rok</h3>
      <button type="button" class="modal__close" id="mClose">&times;</button>
    </div>
    <form id="eventForm">
      <label class="field-label">
        <span>Naziv</span>
        <input id="ev_title" placeholder="npr. Dan intervjua, Zatvaranje prijava" required>
      </label>
      <div class="field-grid">
        <label class="field-label">
          <span>Datum početka</span>
          <input id="ev_start" type="date" value="${selectedDate}" required>
        </label>
        <label class="field-label">
          <span>Datum završetka</span>
          <input id="ev_end" type="date" value="${selectedDate}" required>
        </label>
      </div>
      <label class="field-label">
        <span>Beleška (opciono)</span>
        <textarea id="ev_notes"></textarea>
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

  document.getElementById("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      title: document.getElementById("ev_title").value.trim(),
      start_date: document.getElementById("ev_start").value,
      end_date: document.getElementById("ev_end").value,
      notes: document.getElementById("ev_notes").value.trim() || null,
      created_by: viewer.id,
    };
    if (values.end_date < values.start_date) {
      return toast("Datum završetka mora biti isti ili posle datuma početka.", "error");
    }

    const { data, error } = await sb.from("calendar_events").insert(values).select().single();
    if (error) return toast(error.message, "error");

    events.push(data);
    rebuildItems();
    selectedDate = data.start_date;
    renderAll();
    toast("Rok dodat.");
    closeModal();
  });
}

async function deleteEvent(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  if (!confirm(`Obrisati rok "${ev.title}"?`)) return;

  const { error } = await sb.from("calendar_events").delete().eq("id", id);
  if (error) return toast(error.message, "error");

  events = events.filter((e) => e.id !== id);
  rebuildItems();
  renderAll();
  toast("Rok obrisan.");
}
