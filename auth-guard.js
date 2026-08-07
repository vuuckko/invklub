async function requireSession() {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return new Promise(() => {});
  }

  return session;
}

async function getCurrentProfile() {
  const session = await requireSession();
  const { data, error } = await sb
    .from("profiles")
    .select("*, sector:sectors(id, name)")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;
  return data;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}
