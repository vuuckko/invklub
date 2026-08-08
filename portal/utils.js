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
