const WEEKDAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const MONTH_NAMES = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

let itemsByDate = new Map();
let spanDates = new Set();
let viewYear, viewMonth;
let selectedDate = toDateKey(new Date());

(async () => {
  await renderShell();

  const [{ data: tasks }, { data: projects }] = await Promise.all([
    sb.from("tasks").select("id, title, due_date, status, project_id").not("due_date", "is", null),
    sb.from("projects").select("id, name, start_date, deadline, status"),
  ]);

  for (const t of tasks ?? []) {
    if (t.status === "zavrseno") continue;
    addItem(t.due_date, { type: "task", label: t.title, href: `projekti.html?id=${t.project_id}` });
  }
  for (const p of projects ?? []) {
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

  renderCalendar();
  renderSelectedDay();
})();

function addItem(dateStr, item) {
  const key = dateStr.slice(0, 10);
  if (!itemsByDate.has(key)) itemsByDate.set(key, []);
  itemsByDate.get(key).push(item);
}

function markSpan(startStr, endStr) {
  const cursor = new Date(startStr.slice(0, 10) + "T00:00:00");
  const end = new Date(endStr.slice(0, 10) + "T00:00:00");
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    spanDates.add(toDateKey(cursor));
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

        return `
        <div class="cal-day ${c.outside ? "is-outside" : ""} ${isToday ? "is-today" : ""} ${isSpan ? "is-span" : ""}" data-date="${key}">
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

function renderSelectedDay() {
  const items = itemsByDate.get(selectedDate) ?? [];
  const date = new Date(selectedDate + "T00:00:00");
  const isToday = selectedDate === toDateKey(new Date());

  document.getElementById("selectedDayTitle").textContent = isToday
    ? "Danas"
    : date.toLocaleDateString("sr-RS", { day: "numeric", month: "long", year: "numeric" });

  document.getElementById("selectedDayList").innerHTML = items.length
    ? items
        .map(
          (it) => `
      <a class="row-item" href="${it.href}" style="text-decoration:none">
        <span class="row-item__title">${escapeHtml(it.label)}</span>
        <span class="badge ${it.type === "task" ? "badge--light" : "badge--gain"}">${it.type === "task" ? "Zadatak" : "Projekat"}</span>
      </a>
    `,
        )
        .join("")
    : '<p class="empty-state">Nema rokova ovog dana.</p>';
}
