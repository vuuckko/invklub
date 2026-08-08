// Icons: one silhouette family, 24x24, stroke 1.8, round caps/joins, no
// fill — same construction as CALENDAR_ICON_SVG below, so a new item never
// looks imported from a different set. Each shape is deliberately distinct
// (peaked roof / two circles / three-column board / two wide overlapping
// circles / rising trend line / folded-corner page) so they read apart at
// 18px without relying on colour. An earlier Projekti draft used three
// solid bars, but every shape here is stroke-only (fill:none on the
// parent svg) — unfilled rounded-rect outlines merge into an unreadable
// blob at this size, confirmed by zooming the rendered sidebar. Kanban
// columns (one frame, two dividers) stayed pure outline and reads
// cleanly, and it also maps onto the page's actual todo/u_toku/zavrseno
// board. Partneri's two overlapping circles echo the brand mark's
// concentric arcs instead of a literal handshake (which draws badly this
// small). Finansije's first draft (a torn receipt outline) read as
// generic clutter next to the rest of the set — a rising zigzag with a
// corner arrowhead is the standard "performance" mark, on-domain for an
// investment club, and a single continuous line rather than the receipt's
// several small competing shapes.
const NAV_ICONS = {
  dashboard: `<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5a1 1 0 0 0 1 1h3.5v-5.5h3v5.5H17a1 1 0 0 0 1-1V10"/>`,
  clanovi: `<circle cx="9" cy="8.5" r="3"/><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6"/><circle cx="17.5" cy="9" r="2.3"/><path d="M16.3 14.2c2.3.4 4.1 2.5 4.1 5.8"/>`,
  projekti: `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M10 4.5v15M16.5 4.5v15"/>`,
  partneri: `<circle cx="9" cy="12" r="6.3"/><circle cx="15.5" cy="12" r="6.3"/>`,
  finansije: `<path d="M4 17 9 12 12.5 14.5 20 6"/><path d="M14.5 6h5.5v5.5"/>`,
  dokumenti: `<path d="M7 3.5h7l4 4v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/><path d="M9 12.3h6M9 15.8h4"/>`,
  kalendar: `<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>`,
};

function navIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">${NAV_ICONS[key] ?? ""}</svg>`;
}

const NAV_ITEMS = [
  { href: "index.html", label: "Početna", page: "dashboard", icon: "dashboard" },
  { href: "clanovi.html", label: "Članovi", page: "clanovi", icon: "clanovi" },
  { href: "projekti.html", label: "Projekti", page: "projekti", icon: "projekti" },
  { href: "partneri.html", label: "Partneri", page: "partneri", icon: "partneri" },
  { href: "finansije.html", label: "Finansije", page: "finansije", icon: "finansije", adminOnly: true },
  { href: "dokumenti.html", label: "Dokumenti", page: "dokumenti", icon: "dokumenti", adminOnly: true },
];

function navLink(item) {
  const active = item.page === document.body.dataset.page;
  // Label needs its own element so the active entry can carry a rule under
  // just the words (contents-page marker) rather than the whole row.
  return `<a href="${item.href}" class="${active ? "is-active" : ""}">${navIcon(item.icon)}<span class="sidebar__nav-label">${item.label}</span></a>`;
}

const BRAND_MARK_SVG = `
<svg class="ik-mark" viewBox="0 0 100 100" aria-hidden="true">
  <g fill="none" stroke="#a9c4dc" stroke-linecap="round" stroke-width="7">
    <circle cx="50" cy="50" r="44" stroke-dasharray="205 72" transform="rotate(-25 50 50)"/>
    <circle cx="50" cy="50" r="33" stroke-dasharray="150 57" transform="rotate(130 50 50)"/>
    <circle cx="50" cy="50" r="22" stroke-dasharray="92 46" transform="rotate(230 50 50)"/>
  </g>
  <g fill="currentColor">
    <rect x="33" y="54" width="5" height="10" rx="1.4"/>
    <rect x="40.5" y="49" width="5" height="15" rx="1.4"/>
    <rect x="48" y="43" width="5" height="21" rx="1.4"/>
    <rect x="55.5" y="37" width="5" height="27" rx="1.4"/>
    <rect x="63" y="31" width="5" height="33" rx="1.4"/>
  </g>
</svg>`;

async function renderShell() {
  const profile = await getCurrentProfile();
  const root = document.getElementById("sidebar-root");

  root.innerHTML = `
    <div class="sidebar__top">
      <a href="index.html" class="sidebar__brand">
        ${BRAND_MARK_SVG}
        <span>Investicioni klub<small>Portal za članove</small></span>
      </a>
      <nav class="sidebar__nav">
        ${NAV_ITEMS.filter((item) => !item.adminOnly || profile.role === "admin")
          .map(navLink)
          .join("")}
      </nav>
    </div>
    <div class="sidebar__bottom">
      <nav class="sidebar__nav">
        ${navLink({ href: "kalendar.html", label: "Kalendar", page: "kalendar", icon: "kalendar" })}
      </nav>
      <div class="sidebar__user">
        <p class="sidebar__name">${escapeHtml(profile.full_name || profile.email)}</p>
        <p class="sidebar__role"><span class="badge">${roleLabelFor(profile)}</span></p>
        <button type="button" class="sidebar__signout" id="signOutBtn">Odjavi se</button>
      </div>
    </div>
  `;

  document.getElementById("signOutBtn").addEventListener("click", signOut);

  return profile;
}
