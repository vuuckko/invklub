// Same construction as shell.js's NAV_ICONS (24x24, stroke 1.8, round
// caps/joins, fill:none on the parent svg) so a sector tag never looks
// like it came from a different icon set. Keyed by exact sector name —
// sectors have no other client-stable identifier, and in practice only
// change via direct SQL (no sector-management UI exists), so this is
// safe. Falls back to a plain dot for any name not in the map, so a
// sector added later without a matching code update still shows
// something instead of breaking.
const SECTOR_ICONS = {
  // Bulb + a small hexagon-with-bore standing in for a gear (a hub-and-4-
  // ticks version was tried first and, zoomed, read as a target/crosshair
  // instead — a hexagon is unambiguous at this size, full gear teeth are
  // not) + base + three rays. Zones don't overlap (rays above y3.5,
  // bulb+gear span y3.5-16.5, base below y16), which is what keeps a
  // multi-shape icon legible at 16-18px instead of crowding.
  "IT i inovacije": `<circle cx="12" cy="10" r="6.5"/><path d="M12 7.6 13.8 8.7v2.2L12 12l-1.8-1.1V8.7z"/><circle cx="12" cy="9.7" r=".6"/><path d="M9.3 16v1.3a1 1 0 0 0 1 1h3.4a1 1 0 0 0 1-1V16"/><path d="M10 20.3h4"/><path d="M12 1.3v1.8"/><path d="M5.6 4.1l1.3 1.3"/><path d="M18.4 4.1l-1.3 1.3"/>`,
  "Marketing i PR": `<path d="M4 10v4a1 1 0 0 0 1 1h2l6 3.5V5.5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17 9.5a3.2 3.2 0 0 1 0 5"/><path d="M19.5 7.5a6.5 6.5 0 0 1 0 9"/>`,
  // Same two-overlapping-circles as the Partneri nav icon — deliberate
  // reuse, this sector IS that domain, not a coincidence to avoid.
  "Sponzorstva i partnerstva": `<circle cx="9" cy="12" r="6.3"/><circle cx="15.5" cy="12" r="6.3"/>`,
  // Round 5, different concept entirely: a person with four connections
  // radiating out to other nodes — "one contact point, many relationships"
  // reads for corporate AND academic relations without trying to be a
  // literal handshake. User supplied this reference directly (a filled
  // person silhouette + radiating lines to small circles).
  // Attempt 1 kept the person as a thin stroke outline (matching every
  // other sector icon) — zoomed, a 1.8px-stroke head+shoulders that small
  // has almost no interior negative space, so it merged into a blob at
  // the hub where all four lines meet; the figure read as part of the
  // starburst, not a distinct shape.
  // Attempt 2 shrank the person and pushed the four line start-points
  // fully outside its bbox — better separation, but the shoulder arc was
  // still too thin-stroke-thin to register as "a person" next to four
  // bold lines competing for the same small canvas.
  // Fix, same lesson the handshake icon already taught: switch the person
  // to a small FILLED silhouette (`<g fill="currentColor" stroke="none">`,
  // same exception BRAND_MARK_SVG and the handshake use) instead of an
  // outline — solid shapes hold up at small sizes where thin strokes with
  // tiny gaps don't. Connector lines stay normal thin stroke outside the
  // silhouette's bbox (x 7.8-16.2, y 5.8-15.5), so the two elements read
  // as clearly separate: one bold shape, four fine lines around it.
  "Korporativni i akademski odnosi": `<g fill="currentColor" stroke="none"><circle cx="12" cy="7.7" r="1.9"/><path d="M7.8 15.5C7.8 12.3 9.6 10.6 12 10.6C14.4 10.6 16.2 12.3 16.2 15.5Z"/></g><path d="M6.5 8.5 2 4"/><circle cx="1.6" cy="3.6" r="1.2"/><path d="M17.5 8.5l4.5-4.5"/><circle cx="22.4" cy="3.6" r="1.2"/><path d="M7 15.8l-5 4.2"/><circle cx="1.6" cy="20.4" r="1.2"/><path d="M17 15.8l5 4.2"/><circle cx="22.4" cy="20.4" r="1.2"/>`,
  "Logistika i projekti": `<path d="M12 3.5 20 8v8l-8 4.5-8-4.5V8z"/><path d="M12 3.5 4 8l8 4.5 8-4.5"/><path d="M12 12.5v8"/>`,
  "Ljudski resursi": `<rect x="5" y="4.5" width="14" height="16" rx="2.5"/><circle cx="12" cy="10.5" r="2.3"/><path d="M8 16.5c.6-1.8 2-2.7 4-2.7s3.4.9 4 2.7"/>`,
};
const SECTOR_ICON_FALLBACK = `<circle cx="12" cy="12" r="8.5"/>`;

function sectorIcon(name) {
  const path = SECTOR_ICONS[name] ?? SECTOR_ICON_FALLBACK;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function escapeHtml(str) {
  // Manual replace, not textContent->innerHTML: that DOM round-trip only
  // escapes & < > (correct for text-node placement) and silently leaves
  // " and ' untouched, which breaks when the result is interpolated into
  // an HTML attribute like value="${escapeHtml(x)}" — a stored value
  // containing a `"` closes the attribute early and injects new ones.
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const MONTHS_SHORT = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];

function formatDate(value) {
  if (!value) return "—";
  // Not toLocaleDateString("sr-RS", ...) — that locale's short-month data is
  // Cyrillic in most browsers, which clashes with the all-Latin rest of the
  // site. Format manually to keep it Latin everywhere.
  const d = new Date(value);
  return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}.`;
}

function daysUntil(value) {
  if (!value) return null;
  const ms = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

function formatDuration(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const ms = new Date(endValue).setHours(0, 0, 0, 0) - new Date(startValue).setHours(0, 0, 0, 0);
  const days = Math.round(ms / 86400000) + 1;
  if (days <= 0) return null;
  if (days < 14) return `${days} ${days === 1 ? "dan" : "dana"}`;
  if (days < 60) return `${Math.round(days / 7)} ned.`;
  return `${Math.round(days / 30)} mes.`;
}

const STATUS_LABELS = {
  active: "Aktivan",
  alumni: "Alumni",
};

const ROLE_LABELS = {
  member: "Član",
  admin: "Uprava",
};

// The owner isn't a third `role` value in the DB (see is_owner() in
// schema.sql) — their row is still role='admin', identified here purely
// by email so every existing role==="admin" check elsewhere keeps working
// for them unchanged. This is the one place that email is allowed to leak
// into UI logic; everywhere else, gate on role.
const OWNER_EMAIL = "andrejvuckovic55@gmail.com";

function isOwner(profile) {
  return profile?.email === OWNER_EMAIL;
}

function roleLabelFor(profile) {
  if (isOwner(profile)) return "Admin";
  return ROLE_LABELS[profile.role] ?? profile.role;
}

const PROJECT_STATUS_LABELS = {
  planiranje: "Planiranje",
  u_toku: "U toku",
  zavrsen: "Završen",
  pauziran: "Pauziran",
};

const TASK_STATUS_LABELS = {
  todo: "Za uraditi",
  u_toku: "U toku",
  zavrseno: "Završeno",
};

const PARTNER_STATUS_LABELS = {
  nije_kontaktiran: "Nije kontaktiran",
  kontaktiran: "Kontaktiran",
  u_pregovorima: "U pregovorima",
  aktivna_saradnja: "Aktivna saradnja",
  neuspesno: "Neuspešno",
};

const PARTNER_STATUS_BADGE = {
  nije_kontaktiran: "badge--neutral",
  kontaktiran: "badge--light",
  u_pregovorima: "badge--light",
  aktivna_saradnja: "badge--gain",
  neuspesno: "badge--warn",
};

const PARTNER_STATUS_DOT = {
  nije_kontaktiran: "status-dot--neutral",
  kontaktiran: "status-dot--accent",
  u_pregovorima: "status-dot--accent",
  aktivna_saradnja: "status-dot--gain",
  neuspesno: "status-dot--warn",
};

const PROJECT_STATUS_DOT = {
  planiranje: "status-dot--neutral",
  u_toku: "status-dot--accent",
  zavrsen: "status-dot--gain",
  pauziran: "status-dot--warn",
};

const TRANSACTION_TYPE_LABELS = {
  prihod: "Prihod",
  rashod: "Rashod",
};

const TRANSACTION_STATUS_LABELS = {
  na_cekanju: "Čeka odobrenje",
  odobreno: "Odobreno",
  zavrseno: "Završeno",
  odbijeno: "Odbijeno",
};

const TRANSACTION_STATUS_DOT = {
  na_cekanju: "status-dot--warn",
  odobreno: "status-dot--accent",
  zavrseno: "status-dot--gain",
  odbijeno: "status-dot--neutral",
};

// Bare number, no unit — for statement columns where "RSD" sits in the
// header instead of being repeated on every row (printed statements never
// repeat the currency on each line).
function formatAmount(amount) {
  return Number(amount ?? 0).toLocaleString("sr-RS", { maximumFractionDigits: 0 });
}

function formatCurrency(amount) {
  return `${formatAmount(amount)} RSD`;
}

// U+2212 minus, not a hyphen — lines up with digits in tabular figures.
function formatSigned(amount) {
  const n = Number(amount ?? 0);
  return n < 0 ? `−${formatAmount(Math.abs(n))}` : formatAmount(n);
}

function formatFileSize(bytes) {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name ?? "");
  return match ? match[1].toUpperCase() : "";
}

function toast(message, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:#0b2233;color:#fff;padding:10px 18px;border-radius:999px;" +
      "font-size:.85rem;font-weight:600;z-index:200;box-shadow:0 14px 40px -14px rgba(0,0,0,.4);" +
      "transition:opacity .2s ease;";
    document.body.appendChild(el);
  }
  el.style.background = type === "error" ? "#b3261e" : "#0b2233";
  el.textContent = message;
  el.style.opacity = "1";
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.style.opacity = "0";
  }, 3200);
}
