const WEEKDAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const MONTH_NAMES = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

let itemsByDate = new Map();
let spanDates = new Set();
let eventSpanDates = new Set();
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
    renderCalendar();
    renderSelectedDay();
  });

  if (isAdmin) {
    const btn = document.getElementById("addEventBtn");
    btn.hidden = false;
    btn.addEventListener("click", () => openEventForm());
  }
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  renderCalendar();
  renderSelectedDay();
})();

// ---------------------------------------------------------------------------
// Items — tasks/projects/payments come from their own tables; calendar_events
// covers everything else (rokovi van projekta: dan intervjua, zatvaranje
// prijava, ...). Rebuilt from scratch whenever any source array changes, so
// adding/removing a custom event doesn't need its own incremental patch path.
// ---------------------------------------------------------------------------

function rebuildItems() {
  itemsByDate = new Map();
  spanDates = new Set();
  eventSpanDates = new Set();

  for (const t of tasks) {
    if (t.status === "zavrseno") continue;
    addItem(t.due_date, { type: "task", label: t.title, href: `projekti.html?id=${t.project_id}` });
  }
  for (const p of projects) {
    if (p.status === "zavrsen") continue;
    if (p.deadline) {
      addItem(p.deadline, { type: "project", label: `Kraj: ${p.name}`, href: `projekti.html?id=${p.id}` });
    }
    if (p.start_date) {
      addItem(p.start_date, { type: "project", label: `Početak: ${p.name}`, href: `projekti.html?id=${p.id}` });
    }
    if (p.start_date && p.deadline) {
      markSpan(p.start_date, p.deadline);
    }
  }
  for (const pay of payments) {
    addItem(pay.date, {
      type: "payment",
      label: `Uplata: ${formatCurrency(pay.amount)}`,
      href: "finansije.html",
    });
  }
  for (const ev of events) {
    // No href — a standalone deadline has no detail page to link to. Single-
    // day event (start === end, the common case: "dan intervjua") gets one
    // plain chip; a real range gets a Početak/Kraj pair plus the shaded
    // span between them, same convention as projects just below.
    const isSingleDay = ev.start_date === ev.end_date;
    addItem(ev.start_date, {
      type: "event",
      id: ev.id,
      label: isSingleDay ? ev.title : `Početak: ${ev.title}`,
      href: null,
    });
    if (!isSingleDay) {
      addItem(ev.end_date, { type: "event", id: ev.id, label: `Kraj: ${ev.title}`, href: null });
      markSpan(ev.start_date, ev.end_date, eventSpanDates);
    }
  }
}

function addItem(dateStr, item) {
  const key = dateStr.slice(0, 10);
  if (!itemsByDate.has(key)) itemsByDate.set(key, []);
  itemsByDate.get(key).push(item);
}

function markSpan(startStr, endStr, targetSet = spanDates) {
  const cursor = new Date(startStr.slice(0, 10) + "T00:00:00");
  const end = new Date(endStr.slice(0, 10) + "T00:00:00");
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    targetSet.add(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  } else if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }
  renderCalendar();
}

function renderCalendar() {
  document.getElementById("calTitle").textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const todayKey = toDateKey(new Date());

  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, month: prevMonth, year: prevYear, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: viewMonth, year: viewYear, outside: false });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, month: nextMonth, year: nextYear, outside: true });
  }

  const grid = document.getElementById("calGrid");
  grid.innerHTML =
    WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join("") +
    cells
      .map((c) => {
        const key = `${c.year}-${String(c.month + 1).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
        const items = itemsByDate.get(key) ?? [];
        const isToday = key === todayKey;
        const isSpan = spanDates.has(key);
        const isEventSpan = eventSpanDates.has(key);

        return `
        <div class="cal-day ${c.outside ? "is-outside" : ""} ${isToday ? "is-today" : ""} ${isSpan ? "is-span" : ""} ${isEventSpan ? "is-event-span" : ""}" data-date="${key}">
          <span class="cal-day__num">${c.day}</span>
          ${items
            .slice(0, 2)
            .map(
              (it) =>
                `<span class="cal-day__dot cal-day__dot--${it.type}">${escapeHtml(it.label)}</span>`,
            )
            .join("")}
          ${items.length > 2 ? `<span class="cal-day__more">+${items.length - 2} više</span>` : ""}
        </div>
      `;
      })
      .join("");

  grid.querySelectorAll(".cal-day").forEach((el) => {
    el.addEventListener("click", () => {
      selectedDate = el.dataset.date;
      renderSelectedDay();
    });
  });
}

const TYPE_BADGE = { task: "badge--light", project: "badge--gain", payment: "badge--warn", event: "badge--warn" };
const TYPE_LABEL = { task: "Zadatak", project: "Projekat", payment: "Uplata", event: "Rok" };

function renderSelectedDay() {
  const items = itemsByDate.get(selectedDate) ?? [];
  const date = new Date(selectedDate + "T00:00:00");
  const isToday = selectedDate === toDateKey(new Date());

  document.getElementById("selectedDayTitle").textContent = isToday
    ? "Danas"
    : `${date.getDate()}. ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}.`;

  document.getElementById("selectedDayList").innerHTML = items.length
    ? items.map(rowItemHtml).join("")
    : '<p class="empty-state">Nema rokova ovog dana.</p>';

  document.getElementById("selectedDayList")
    .querySelectorAll("[data-delete-event]")
    .forEach((btn) => btn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteEvent(btn.dataset.deleteEvent);
    }));
}

function rowItemHtml(it) {
  const badge = `<span class="badge ${TYPE_BADGE[it.type] ?? "badge--light"}">${TYPE_LABEL[it.type] ?? it.type}</span>`;

  // Custom events have no target page — plain row, not a link — and admins
  // get an inline delete control since these are typed in by hand and will
  // occasionally need a quick fix.
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

  return `
    <a class="row-item" href="${it.href}" style="text-decoration:none">
      <span class="row-item__title">${escapeHtml(it.label)}</span>
      ${badge}
    </a>
  `;
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
    renderCalendar();
    renderSelectedDay();
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
  renderCalendar();
  renderSelectedDay();
  toast("Rok obrisan.");
}
