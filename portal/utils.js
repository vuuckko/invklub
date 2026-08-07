function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("sr-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
