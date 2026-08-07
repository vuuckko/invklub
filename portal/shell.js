const NAV_ITEMS = [
  { href: "index.html", label: "Početna", page: "dashboard", index: "01" },
  { href: "clanovi.html", label: "Članovi", page: "clanovi", index: "02" },
  { href: "projekti.html", label: "Projekti", page: "projekti", index: "03" },
  { href: "partneri.html", label: "Partneri", page: "partneri", index: "04" },
];

function navLink(item) {
  const active = item.page === document.body.dataset.page;
  return `<a href="${item.href}" class="${active ? "is-active" : ""}">
    <span class="sidebar__nav-index">${item.index}</span>${item.label}
  </a>`;
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

const CALENDAR_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
  <rect x="3.5" y="5" width="17" height="16" rx="2.5"/>
  <path d="M8 3v4M16 3v4M3.5 10h17"/>
</svg>`;

async function renderShell() {
  const profile = await getCurrentProfile();
  const currentPage = document.body.dataset.page;
  const root = document.getElementById("sidebar-root");

  root.innerHTML = `
    <div class="sidebar__top">
      <a href="index.html" class="sidebar__brand">
        ${BRAND_MARK_SVG}
        <span>Investicioni klub<small>Portal za članove</small></span>
      </a>
      <nav class="sidebar__nav">
        ${NAV_ITEMS.map(navLink).join("")}
      </nav>
    </div>
    <div class="sidebar__bottom">
      <nav class="sidebar__nav">
        ${navLink({ href: "kalendar.html", label: "Kalendar", page: "kalendar", index: "05" })}
      </nav>
      <div class="sidebar__user">
        <p class="sidebar__name">${escapeHtml(profile.full_name || profile.email)}</p>
        <p class="sidebar__role"><span class="badge">${ROLE_LABELS[profile.role] ?? profile.role}</span></p>
        <button type="button" class="sidebar__signout" id="signOutBtn">Odjavi se</button>
      </div>
    </div>
  `;

  document.getElementById("signOutBtn").addEventListener("click", signOut);

  if (currentPage !== "kalendar") {
    const main = document.querySelector(".portal-main");
    if (main) {
      const shortcut = document.createElement("a");
      shortcut.href = "kalendar.html";
      shortcut.className = "cal-shortcut";
      shortcut.title = "Kalendar";
      shortcut.innerHTML = CALENDAR_ICON_SVG;
      main.prepend(shortcut);
    }
  }

  return profile;
}
