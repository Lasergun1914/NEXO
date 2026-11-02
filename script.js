// ============================================
// NEXO 4.0 – SOZIALES NETZWERK + CHAT
// ============================================

const SUPABASE_URL = "https://kimddjclrchrhhzrpceb.supabase.co";
const SUPABASE_KEY = "sb_publishable_giemz4pb0IzxDIYeGn2phw_FTfGGYir";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const app = document.getElementById("app");

let currentUser = null;
let currentProfile = null;
let currentPage = "home";

let allPosts = [];
let allProfiles = {};
let allLikes = [];
let allComments = [];
let allFollows = [];

let currentChatId = null;
let currentChatMember = false;
let currentChatReadOnly = false;
let chatRefreshTimer = null;
let refreshTimer = null;


// ============================================
// HILFSFUNKTIONEN
// ============================================

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function initials(name) {
  return esc((name || "?").trim().charAt(0).toUpperCase());
}

function avatar(profile, small = false) {
  const size = small ? "small" : "";

  if (profile?.avatar_url) {
    return `
      <div class="avatar ${size}">
        <img src="${esc(profile.avatar_url)}"
          alt="Profilbild"
          style="width:100%;height:100%;object-fit:cover;border-radius:50%">
      </div>
    `;
  }

  return `
    <div class="avatar ${size}">
      ${initials(profile?.display_name || "N")}
    </div>
  `;
}

function message(text, error = false) {
  return `<div class="message ${error ? "error" : ""}">${esc(text)}</div>`;
}

function formatDate(date) {
  return new Date(date).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });
}


// ============================================
// ANMELDUNG
// ============================================

function showAuth(mode = "login", info = "") {
  clearInterval(refreshTimer);
  clearInterval(chatRefreshTimer);

  const register = mode === "register";

  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="logo">NEX<span>O</span></div>

        <h2>${register ? "Account erstellen" : "Willkommen zurück!"}</h2>

        <p class="auth-subtitle">
          ${register
            ? "Werde Teil der NEXO-Community."
            : "Melde dich bei deinem NEXO-Account an."}
        </p>

        <form id="authForm">

          ${register ? `
            <div class="field">
              <label>Dein Name</label>
              <input id="authName" required maxlength="40"
                placeholder="Dein Name">
            </div>
          ` : ""}

          <div class="field">
            <label>E-Mail-Adresse</label>
            <input id="authEmail" type="email" required
              autocomplete="email"
              placeholder="name@example.com">
          </div>

          <div class="field">
            <label>Passwort</label>
            <input id="authPassword" type="password"
              required minlength="8"
              autocomplete="${register ? "new-password" : "current-password"}"
              placeholder="Mindestens 8 Zeichen">
          </div>

          <button class="primary" id="authSubmit" type="submit">
            ${register ? "Account erstellen" : "Einloggen"}
          </button>
        </form>

        <div id="authMessage">
          ${info ? message(info) : ""}
        </div>

        <div class="auth-switch">
          ${register
            ? `Du hast schon einen Account?
               <button id="switchAuth">Einloggen</button>`
            : `Noch kein Account?
               <button id="switchAuth">Registrieren</button>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById("switchAuth").onclick = () => {
    showAuth(register ? "login" : "register");
  };

  document.getElementById("authForm").onsubmit = async e => {
    e.preventDefault();

    const button = document.getElementById("authSubmit");
    const output = document.getElementById("authMessage");

    button.disabled = true;
    button.textContent = "Bitte warten ...";
    output.innerHTML = "";

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;

    try {
      let result;

      if (register) {
        const name = document.getElementById("authName").value.trim();

        result = await db.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name
            }
          }
        });

        if (result.error) throw result.error;

        if (result.data.session) {
          await startApp(result.data.session.user);
        } else {
          showAuth(
            "login",
            "Bitte bestätige deine E-Mail-Adresse und melde dich danach an."
          );
        }

      } else {
        result = await db.auth.signInWithPassword({
          email,
          password
        });

        if (result.error) throw result.error;

        await startApp(result.data.user);
      }

    } catch (error) {
      output.innerHTML = message(error.message, true);
      button.disabled = false;
      button.textContent = register ? "Account erstellen" : "Einloggen";
    }
  };
}


// ============================================
// APP STARTEN
// ============================================

async function startApp(user) {
  currentUser = user;

  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    showAuth("login", "Profil konnte nicht geladen werden: " + error.message);
    return;
  }

  if (!profile) {
    showAuth("login", "Dein Profil wird noch eingerichtet. Bitte lade neu.");
    return;
  }

  currentProfile = profile;

  renderLayout();
  await loadFeed();

  clearInterval(refreshTimer);

  refreshTimer = setInterval(() => {
    if (currentUser) loadFeed();
  }, 12000);
}


// ============================================
// LAYOUT
// ============================================

function renderLayout() {
  app.innerHTML = `
    <div class="app-layout">

      <aside class="sidebar">

        <div class="brand">NEX<span>O</span></div>

        <nav class="nav">
          <button data-page="home">🏠 Startseite</button>
          <button data-page="explore">🔍 Entdecken</button>
          <button data-page="profile">👤 Mein Profil</button>
          <button data-page="chats">💬 Chats</button>

          ${currentProfile.is_admin === true ? `
            <button data-page="admin">🛡️ Admin-Panel</button>
          ` : ""}
        </nav>

        <div class="user-mini">
          ${avatar(currentProfile)}
          <div>
            <strong>${esc(currentProfile.display_name)}</strong>
            <small>@${esc(currentProfile.username)}</small>
          </div>
        </div>

        <button class="secondary" id="logoutButton">
          ↪ Abmelden
        </button>

      </aside>

      <main class="content">

        <div class="topbar">
          <h1 id="pageTitle">Startseite</h1>
          <span class="muted">NEXO 4.0</span>
        </div>

        <section id="pageContent"></section>

      </main>

      <aside class="right-panel">

        <div class="card">
          <h3>🌍 Willkommen bei NEXO</h3>
          <p class="muted">
            Dein soziales Netzwerk. Teile deine Gedanken,
            entdecke Beiträge und lerne andere Mitglieder kennen.
          </p>
        </div>

        <div class="card">
          <h3>✨ NEXO-Info</h3>
          <p class="muted">
            Deine Beiträge werden online gespeichert.
            Andere angemeldete Mitglieder können sie sehen.
          </p>
        </div>

      </aside>

    </div>
  `;

  document.querySelectorAll(".nav button").forEach(button => {
    button.onclick = () => navigate(button.dataset.page);
  });

  document.getElementById("logoutButton").onclick = logout;

  navigate("home");
}


// ============================================
// SEITENWECHSEL
// ============================================

function navigate(page) {
  currentPage = page;

  if (page !== "chats") {
    clearInterval(chatRefreshTimer);
  }

  document.querySelectorAll(".nav button").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const titles = {
    home: "Startseite",
    explore: "Entdecken",
    profile: "Mein Profil",
    chats: "Chats",
    admin: "Admin-Panel"
  };

  document.getElementById("pageTitle").textContent =
    titles[page] || "NEXO";

  if (page === "home") renderHome();
  if (page === "explore") renderExplore();
  if (page === "profile") renderProfile();
  if (page === "chats") renderChats();
  if (page === "admin") renderAdmin();
}


// ============================================
// BEITRÄGE LADEN
// ============================================

async function loadFeed() {
  if (!currentUser) return;

  try {
    const [
      postsResult,
      profilesResult,
      likesResult,
      commentsResult,
      followsResult
    ] = await Promise.all([

      db.from("posts")
        .select("id,user_id,content,image_url,created_at")
        .order("created_at", { ascending: false }),

      db.from("profiles").select("*"),

      db.from("likes").select("user_id,post_id"),

      db.from("comments")
        .select("id,post_id,user_id,content,created_at")
        .order("created_at", { ascending: true }),

      db.from("follows").select("follower_id,following_id")
    ]);

    const error =
      postsResult.error ||
      profilesResult.error ||
      likesResult.error ||
      commentsResult.error ||
      followsResult.error;

    if (error) throw error;

    allPosts = postsResult.data || [];
    allProfiles = {};

    (profilesResult.data || []).forEach(profile => {
      allProfiles[profile.id] = profile;
    });

    allLikes = likesResult.data || [];
    allComments = commentsResult.data || [];
    allFollows = followsResult.data || [];

    if (currentPage === "home") renderHome();
    if (currentPage === "explore") renderExplore();
    if (currentPage === "profile") renderProfile();

  } catch (error) {
    console.error(error);

    const content = document.getElementById("pageContent");

    if (content) {
      content.innerHTML = message(
        "Beiträge konnten nicht geladen werden: " + error.message,
        true
      );
    }
  }
}


// ============================================
// BEITRAG ERSTELLEN
// ============================================

async function createPost() {
  const input = document.getElementById("newPost");
  const button = document.getElementById("publishButton");
  const imageInput = document.getElementById("postImageInput");

  const content = input.value.trim();
  const file = imageInput?.files?.[0] || null;

  if (!content && !file) {
    alert("Schreibe etwas oder wähle ein Bild aus.");
    return;
  }

  button.disabled = true;
  button.textContent = "Wird veröffentlicht ...";

  try {
    let imageUrl = null;

    if (file) {
      if (!file.type.startsWith("image/")) {
        throw new Error("Bitte wähle eine Bilddatei aus.");
      }

      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Das Bild darf höchstens 8 MB groß sein.");
      }

      const extension = (file.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const filePath =
        `${currentUser.id}/${Date.now()}-post.${extension}`;

      const { error: uploadError } = await db.storage
        .from("post-images")
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data } = db.storage
        .from("post-images")
        .getPublicUrl(filePath);

      imageUrl = data.publicUrl;
    }

    const { error } = await db.from("posts").insert({
      user_id: currentUser.id,
      content,
      image_url: imageUrl
    });

    if (error) throw error;

    input.value = "";
    if (imageInput) imageInput.value = "";

    await loadFeed();

  } catch (error) {
    alert("Beitrag konnte nicht veröffentlicht werden: " + error.message);

  } finally {
    button.disabled = false;
    button.textContent = "Veröffentlichen";
  }
}


// ============================================
// STARTSEITE
// ============================================

function renderHome() {
  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card composer">

      <h3>Was gibt es Neues?</h3>

      <textarea id="newPost" maxlength="2000"
        placeholder="Was möchtest du der NEXO-Community mitteilen?"></textarea>

      <div style="margin-top:12px">

        <label class="secondary"
          style="display:inline-block;cursor:pointer;padding:10px 14px">

          🖼️ Bild hinzufügen

          <input type="file" id="postImageInput"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style="display:none">

        </label>

      </div>

      <div class="composer-bottom">
        <span>Text bis 2.000 Zeichen · Bild bis 8 MB</span>

        <button class="primary" id="publishButton"
          style="width:auto;padding:12px 20px">
          Veröffentlichen
        </button>
      </div>

    </div>

    <div id="postList"></div>
  `;

  document.getElementById("publishButton").onclick = createPost;

  renderPosts("postList", allPosts);
}


// ============================================
// BEITRÄGE ANZEIGEN
// ============================================

function renderPosts(target, posts) {
  const container = document.getElementById(target);
  if (!container) return;

  if (!posts.length) {
    container.innerHTML = `
      <div class="card empty">
        Noch keine Beiträge vorhanden.<br>
        Schreibe den ersten Beitrag! 🚀
      </div>
    `;
    return;
  }

  container.innerHTML = posts.map(post => {
    const profile = allProfiles[post.user_id] || {
      display_name: "Unbekannt",
      username: "unbekannt"
    };

    const likes = allLikes.filter(like =>
      like.post_id === post.id
    );

    const liked = likes.some(like =>
      like.user_id === currentUser.id
    );

    const comments = allComments.filter(comment =>
      comment.post_id === post.id
    );

    return `
      <article class="post">

        <div class="post-head">
          ${avatar(profile)}

          <div>
            <strong>${esc(profile.display_name)}</strong>
            <small>@${esc(profile.username)}</small>
          </div>

          <span class="post-time">
            ${formatDate(post.created_at)}
          </span>
        </div>

        ${post.content
          ? `<div class="post-text">${esc(post.content)}</div>`
          : ""}

        ${post.image_url ? `
          <div style="margin-top:14px">
            <img src="${esc(post.image_url)}"
              alt="Bild im Beitrag"
              loading="lazy"
              style="display:block;width:100%;max-height:520px;object-fit:contain;border-radius:14px;background:#0b1020">
          </div>
        ` : ""}

        <div class="muted" style="margin-top:15px">
          ❤️ ${likes.length} Likes · 💬 ${comments.length} Kommentare
        </div>

        <div class="post-actions">

          <button class="${liked ? "liked" : ""}"
            data-like="${post.id}">
            ${liked ? "❤️ Gefällt mir" : "♡ Gefällt mir"}
          </button>

          <button data-comment="${post.id}">
            💬 Kommentieren
          </button>

          ${post.user_id === currentUser.id ? `
            <button data-delete="${post.id}">
              🗑 Löschen
            </button>
          ` : ""}

        </div>

        <div id="comments-${post.id}" class="hidden">

          ${comments.map(comment => {
            const author = allProfiles[comment.user_id] || {
              display_name: "Unbekannt"
            };

            return `
              <div class="comment">
                <strong>${esc(author.display_name)}</strong>
                ${esc(comment.content)}
              </div>
            `;
          }).join("")}

          <div class="comment-form">
            <input id="commentInput-${post.id}"
              maxlength="1000"
              placeholder="Kommentar schreiben ...">

            <button class="secondary"
              data-send-comment="${post.id}">
              ➤
            </button>
          </div>

        </div>

      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-like]").forEach(button => {
    button.onclick = () => toggleLike(Number(button.dataset.like));
  });

  container.querySelectorAll("[data-comment]").forEach(button => {
    button.onclick = () => {
      const box = document.getElementById(
        "comments-" + button.dataset.comment
      );

      box.classList.toggle("hidden");
    };
  });

  container.querySelectorAll("[data-send-comment]").forEach(button => {
    button.onclick = () =>
      sendComment(Number(button.dataset.sendComment));
  });

  container.querySelectorAll("[data-delete]").forEach(button => {
    button.onclick = () =>
      deletePost(Number(button.dataset.delete));
  });
}


// ============================================
// LIKES
// ============================================

async function toggleLike(postId) {
  const existing = allLikes.find(like =>
    like.post_id === postId &&
    like.user_id === currentUser.id
  );

  try {
    if (existing) {
      const { error } = await db.from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id);

      if (error) throw error;

    } else {
      const { error } = await db.from("likes").insert({
        post_id: postId,
        user_id: currentUser.id
      });

      if (error) throw error;
    }

    await loadFeed();

  } catch (error) {
    alert("Like konnte nicht gespeichert werden: " + error.message);
  }
}


// ============================================
// KOMMENTARE
// ============================================

async function sendComment(postId) {
  const input = document.getElementById("commentInput-" + postId);
  const value = input.value.trim();

  if (!value) return;

  try {
    const { error } = await db.from("comments").insert({
      post_id: postId,
      user_id: currentUser.id,
      content: value
    });

    if (error) throw error;

    await loadFeed();

    const box = document.getElementById("comments-" + postId);
    if (box) box.classList.remove("hidden");

  } catch (error) {
    alert("Kommentar konnte nicht gespeichert werden: " + error.message);
  }
}


// ============================================
// BEITRAG LÖSCHEN
// ============================================

async function deletePost(postId) {
  if (!confirm("Möchtest du diesen Beitrag wirklich löschen?")) return;

  try {
    const { error } = await db.from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadFeed();

  } catch (error) {
    alert("Löschen fehlgeschlagen: " + error.message);
  }
}


// ============================================
// PERSONEN FOLGEN
// ============================================

async function toggleFollow(userId) {
  if (userId === currentUser.id) return;

  const existing = allFollows.find(f =>
    f.follower_id === currentUser.id &&
    f.following_id === userId
  );

  try {
    if (existing) {
      const { error } = await db.from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId);

      if (error) throw error;

    } else {
      const { error } = await db.from("follows").insert({
        follower_id: currentUser.id,
        following_id: userId
      });

      if (error) throw error;
    }

    await loadFeed();

  } catch (error) {
    alert("Folgen fehlgeschlagen: " + error.message);
  }
}


// ============================================
// ENTDECKEN
// ============================================

function renderExplore() {
  const content = document.getElementById("pageContent");

  const members = Object.values(allProfiles)
    .filter(profile => profile.id !== currentUser.id);

  content.innerHTML = `
    <div class="card">
      <h3>🔍 Entdecken</h3>
      <p class="muted">
        Entdecke andere Mitglieder und folge deinen Freunden!
      </p>
    </div>

    <h2>👥 Mitglieder</h2>

    <div id="memberList">

      ${members.length ? members.map(profile => {
        const following = allFollows.some(f =>
          f.follower_id === currentUser.id &&
          f.following_id === profile.id
        );

        const followers = allFollows.filter(f =>
          f.following_id === profile.id
        ).length;

        return `
          <div class="card"
            style="display:flex;align-items:center;gap:14px;margin-bottom:12px">

            ${avatar(profile)}

            <div style="flex:1">
              <strong>${esc(profile.display_name)}</strong>
              <div class="muted">@${esc(profile.username)}</div>
              <small>${followers} Follower</small>
            </div>

            <button
              class="${following ? "secondary" : "primary"}"
              data-follow="${esc(profile.id)}"
              style="width:auto">

              ${following ? "✓ Folgst du" : "+ Folgen"}

            </button>

            <button class="secondary"
              data-new-chat="${esc(profile.id)}"
              style="width:auto">
              💬 Chat
            </button>

          </div>
        `;
      }).join("") : `
        <div class="card empty">
          Noch keine anderen Mitglieder gefunden.
        </div>
      `}

    </div>

    <h2 style="margin-top:30px">📰 Neueste Beiträge</h2>
    <div id="explorePosts"></div>
  `;

  content.querySelectorAll("[data-follow]").forEach(button => {
    button.onclick = () => toggleFollow(button.dataset.follow);
  });

  content.querySelectorAll("[data-new-chat]").forEach(button => {
    button.onclick = () => createChatWith(button.dataset.newChat);
  });

  renderPosts("explorePosts", allPosts);
}


// ============================================
// PROFIL
// ============================================

function renderProfile() {
  const content = document.getElementById("pageContent");

  const ownPosts = allPosts.filter(post =>
    post.user_id === currentUser.id
  );

  content.innerHTML = `
    <div class="card profile-box">

      ${avatar(currentProfile)}

      <h2>${esc(currentProfile.display_name)}</h2>

      <p class="muted">@${esc(currentProfile.username)}</p>

      <p>${esc(currentProfile.bio || "Noch keine Profilbeschreibung.")}</p>

      <button class="secondary" id="editProfile">
        ✏️ Profil bearbeiten
      </button>

      <div style="margin-top:20px">

        <label class="secondary"
          style="display:inline-block;cursor:pointer">

          📷 Profilbild hochladen

          <input type="file" id="avatarInput"
            accept="image/png,image/jpeg,image/webp"
            style="display:none">

        </label>

        <p id="uploadStatus" class="muted"></p>

      </div>

    </div>

    <h2>Meine Beiträge</h2>
    <div id="myPosts"></div>
  `;

  renderPosts("myPosts", ownPosts);

  document.getElementById("editProfile").onclick = editProfile;

  document.getElementById("avatarInput").onchange = event => {
    const file = event.target.files[0];
    if (file) uploadAvatar(file);
  };
}


async function editProfile() {
  const name = prompt(
    "Wie soll dein Anzeigename heißen?",
    currentProfile.display_name
  );

  if (name === null) return;

  const bio = prompt(
    "Deine Profilbeschreibung:",
    currentProfile.bio || ""
  );

  if (bio === null) return;

  if (!name.trim()) {
    alert("Bitte gib einen Namen ein.");
    return;
  }

  try {
    const { data, error } = await db.from("profiles")
      .update({
        display_name: name.trim(),
        bio: bio.trim()
      })
      .eq("id", currentUser.id)
      .select()
      .single();

    if (error) throw error;

    currentProfile = data;

    renderLayout();
    await loadFeed();

  } catch (error) {
    alert("Profil konnte nicht geändert werden: " + error.message);
  }
}


async function uploadAvatar(file) {
  const status = document.getElementById("uploadStatus");

  try {
    if (!currentUser) throw new Error("Du bist nicht eingeloggt.");

    if (!file.type.startsWith("image/")) {
      throw new Error("Bitte wähle ein Bild aus.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Das Bild darf höchstens 5 MB groß sein.");
    }

    status.textContent = "Bild wird hochgeladen ...";

    const extension = file.name.split(".").pop().toLowerCase();
    const filePath =
      `${currentUser.id}/${Date.now()}-avatar.${extension}`;

    const { error: uploadError } = await db.storage
      .from("avatar")
      .upload(filePath, file, {
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { data } = db.storage
      .from("avatar")
      .getPublicUrl(filePath);

    const { data: updatedProfile, error: profileError } = await db
      .from("profiles")
      .update({
        avatar_url: data.publicUrl
      })
      .eq("id", currentUser.id)
      .select()
      .single();

    if (profileError) throw profileError;

    currentProfile = updatedProfile;

    renderLayout();
    await loadFeed();

  } catch (error) {
    console.error("Avatar-Fehler:", error);

    if (status) {
      status.textContent = "❌ " + error.message;
    } else {
      alert("Profilbild-Fehler: " + error.message);
    }
  }
}


// ============================================
// CHATS – ÜBERSICHT
// ============================================

async function renderChats() {
  clearInterval(chatRefreshTimer);

  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">
      <h2>💬 Deine Chats</h2>
      <p class="muted">
        Schreibe privat mit Freunden oder erstelle Gruppenchats.
      </p>

      <p class="muted" style="font-size:12px">
        🔒 Private Chats sind nur für ihre Mitglieder sichtbar.
        Gemeldete Chats können vom Admin geprüft werden.
      </p>
    </div>

    <div class="card">
      <h3>➕ Neuen Chat starten</h3>

      <label>Person auswählen</label>

      <select id="chatUserSelect"
        style="width:100%;padding:12px;margin:10px 0">

        <option value="">Person auswählen ...</option>

        ${Object.values(allProfiles)
          .filter(p => p.id !== currentUser.id)
          .map(p => `
            <option value="${esc(p.id)}">
              ${esc(p.display_name)} (@${esc(p.username)})
            </option>
          `).join("")}

      </select>

      <button class="primary" id="startPrivateChat">
        💬 Privaten Chat starten
      </button>

      <hr style="border-color:#30364a;margin:20px 0">

      <h3>👥 Gruppenchats erstellen</h3>

      <label>Gruppenname</label>

      <input id="groupTitle"
        maxlength="60"
        placeholder="Name der Gruppe"
        style="width:100%;padding:12px;margin:10px 0">

      <label>Mitglieder auswählen</label>

      <select id="groupMembers"
        multiple
        style="width:100%;min-height:130px;padding:10px;margin:10px 0">

        ${Object.values(allProfiles)
          .filter(p => p.id !== currentUser.id)
          .map(p => `
            <option value="${esc(p.id)}">
              ${esc(p.display_name)} (@${esc(p.username)})
            </option>
          `).join("")}

      </select>

      <small class="muted">
        Halte STRG gedrückt, um mehrere Personen auszuwählen.
      </small>

      <button class="primary" id="createGroup"
        style="margin-top:12px">
        👥 Gruppe erstellen
      </button>

    </div>

    <h2>📨 Deine Unterhaltungen</h2>
    <div id="chatList">Chats werden geladen ...</div>
  `;

  document.getElementById("startPrivateChat").onclick = async () => {
    const userId = document.getElementById("chatUserSelect").value;

    if (!userId) {
      alert("Bitte wähle eine Person aus.");
      return;
    }

    await createChatWith(userId);
  };

  document.getElementById("createGroup").onclick = async () => {
    const title = document.getElementById("groupTitle").value.trim();

    const selected = [
      ...document.getElementById("groupMembers").selectedOptions
    ].map(option => option.value);

    if (!selected.length) {
      alert("Bitte wähle mindestens eine weitere Person aus.");
      return;
    }

    if (!title) {
      alert("Bitte gib deiner Gruppe einen Namen.");
      return;
    }

    await createNewChat(title, true, selected);
  };

  await loadMyChats();
}


// ============================================
// PRIVATEN CHAT STARTEN
// ============================================

async function createChatWith(userId) {
  await createNewChat("", false, [userId]);
}


// ============================================
// NEUEN CHAT ERSTELLEN
// ============================================

async function createNewChat(title, isGroup, memberIds) {
  try {
    const { data, error } = await db.rpc("create_chat", {
      p_title: title,
      p_is_group: isGroup,
      p_member_ids: memberIds
    });

    if (error) throw error;

    currentChatId = data;

    await openChat(data, false);

  } catch (error) {
    console.error(error);
    alert("Chat konnte nicht erstellt werden: " + error.message);
  }
}


// ============================================
// EIGENE CHATS LADEN
// ============================================

async function loadMyChats() {
  const container = document.getElementById("chatList");
  if (!container) return;

  try {
    const { data: memberships, error: memberError } = await db
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    if (memberError) throw memberError;

    const ids = [...new Set(
      (memberships || []).map(m => m.conversation_id)
    )];

    if (!ids.length) {
      container.innerHTML = `
        <div class="card empty">
          Du hast noch keine Chats.<br>
          Starte oben deine erste Unterhaltung! 💬
        </div>
      `;
      return;
    }

    const { data: conversations, error } = await db
      .from("conversations")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (error) throw error;

    container.innerHTML = (conversations || []).map(chat => `
      <button class="card"
        data-open-chat="${chat.id}"
        style="
          width:100%;
          display:flex;
          align-items:center;
          gap:14px;
          text-align:left;
          margin-bottom:10px;
          cursor:pointer;
        ">

        <div class="avatar">
          ${chat.is_group ? "👥" : "💬"}
        </div>

        <div style="flex:1">
          <strong>
            ${esc(chat.title || "Privater Chat")}
          </strong>

          <div class="muted">
            ${chat.is_group ? "Gruppenchat" : "Privater Chat"}
          </div>
        </div>

        <span>›</span>

      </button>
    `).join("");

    container.querySelectorAll("[data-open-chat]").forEach(button => {
      button.onclick = () => openChat(button.dataset.openChat, false);
    });

  } catch (error) {
    container.innerHTML = message(
      "Chats konnten nicht geladen werden: " + error.message,
      true
    );
  }
}


// ============================================
// CHAT ÖFFNEN
// ============================================

async function openChat(chatId, readOnly = false) {
  clearInterval(chatRefreshTimer);

  currentChatId = chatId;
  currentChatReadOnly = readOnly;

  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">
      Chat wird geöffnet ...
    </div>
  `;

  try {
    const { data: chat, error: chatError } = await db
      .from("conversations")
      .select("*")
      .eq("id", chatId)
      .single();

    if (chatError) throw chatError;

    const { data: members, error: memberError } = await db
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", chatId);

    if (memberError) throw memberError;

    currentChatMember = (members || []).some(m =>
      m.user_id === currentUser.id
    );

    if (!currentChatMember) {
      currentChatReadOnly = true;
    }

    const memberNames = (members || []).map(m => {
      const profile = allProfiles[m.user_id];

      return profile
        ? esc(profile.display_name)
        : "Mitglied";
    });

    content.innerHTML = `
      <div class="card">

        <button class="secondary" id="backToChats">
          ← Zurück zu Chats
        </button>

        <h2 style="margin-top:15px">
          ${esc(chat.title || "Privater Chat")}
        </h2>

        <p class="muted">
          ${chat.is_group ? "👥 Gruppenchat" : "💬 Privater Chat"}
        </p>

        <div class="card" style="margin-top:12px">
          <strong>👥 Mitglieder (${memberNames.length})</strong>

          <p class="muted" style="margin-top:8px">
            ${memberNames.join(", ")}
          </p>
        </div>

        <p class="muted" style="font-size:12px">
          Hinweis: Gemeldete Chats können vom Admin geprüft werden.
        </p>

      </div>

      <div class="card">

        <div id="chatMessages"
          style="
            min-height:250px;
            max-height:450px;
            overflow-y:auto;
            display:flex;
            flex-direction:column;
            gap:10px;
          ">
          Nachrichten werden geladen ...
        </div>

        ${currentChatMember && !currentChatReadOnly ? `
          <div style="display:flex;gap:8px;margin-top:15px">

            <input id="chatMessageInput"
              maxlength="4000"
              placeholder="Nachricht schreiben ..."
              style="flex:1;min-width:0">

            <button class="primary" id="sendChatMessage"
              style="width:auto">
              ➤
            </button>

          </div>

          <button class="secondary" id="reportChat"
            style="margin-top:12px">
            🚩 Chat melden
          </button>

        ` : `
          <div class="message">
            👁️ Du kannst diesen gemeldeten Chat nur ansehen.
            Schreiben ist hier nicht möglich.
          </div>
        `}

      </div>
    `;

    document.getElementById("backToChats").onclick = () => {
      navigate("chats");
    };

    if (currentChatMember && !currentChatReadOnly) {
      document.getElementById("sendChatMessage").onclick =
        sendChatMessage;

      document.getElementById("chatMessageInput").onkeydown = e => {
        if (e.key === "Enter") sendChatMessage();
      };

      document.getElementById("reportChat").onclick = reportChat;
    }

    await loadChatMessages();

    chatRefreshTimer = setInterval(() => {
      if (currentChatId === chatId) loadChatMessages();
    }, 4000);

  } catch (error) {
    content.innerHTML = message(
      "Chat konnte nicht geöffnet werden: " + error.message,
      true
    );
  }
}


// ============================================
// CHAT-NACHRICHTEN LADEN
// ============================================

async function loadChatMessages() {
  if (!currentChatId) return;

  const container = document.getElementById("chatMessages");
  if (!container) return;

  try {
    const { data: messages, error } = await db
      .from("messages")
      .select("*")
      .eq("conversation_id", currentChatId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!messages || !messages.length) {
      container.innerHTML = `
        <p class="muted" style="text-align:center">
          Noch keine Nachrichten.<br>
          Schreibe die erste Nachricht! 👋
        </p>
      `;
      return;
    }

    const wasAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;

    container.innerHTML = messages.map(msg => {
      const own = msg.sender_id === currentUser.id;
      const profile = allProfiles[msg.sender_id] || {
        display_name: "Unbekannt"
      };

      return `
        <div style="
          display:flex;
          justify-content:${own ? "flex-end" : "flex-start"};
        ">

          <div style="
            max-width:80%;
            padding:12px 15px;
            border-radius:14px;
            background:${own ? "#5146bd" : "#20283d"};
            overflow-wrap:anywhere;
          ">

            <strong style="font-size:12px">
              ${own ? "Du" : esc(profile.display_name)}
            </strong>

            <div style="margin-top:5px;white-space:pre-wrap">
              ${esc(msg.content)}
            </div>

            <small style="
              display:block;
              margin-top:7px;
              opacity:.65;
              font-size:10px;
            ">
              ${formatDate(msg.created_at)}
            </small>

          </div>

        </div>
      `;
    }).join("");

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }

  } catch (error) {
    console.error("Chat-Nachrichten:", error);
    container.innerHTML = message(
      "Nachrichten konnten nicht geladen werden: " + error.message,
      true
    );
  }
}


// ============================================
// NACHRICHT SENDEN
// ============================================

async function sendChatMessage() {
  if (!currentChatId || !currentChatMember || currentChatReadOnly) {
    return;
  }

  const input = document.getElementById("chatMessageInput");
  const value = input?.value.trim();

  if (!value) return;

  const button = document.getElementById("sendChatMessage");
  button.disabled = true;

  try {
    const { error } = await db.from("messages").insert({
      conversation_id: currentChatId,
      sender_id: currentUser.id,
      content: value
    });

    if (error) throw error;

    input.value = "";

    await loadChatMessages();

  } catch (error) {
    alert("Nachricht konnte nicht gesendet werden: " + error.message);

  } finally {
    if (button) button.disabled = false;
    if (input) input.focus();
  }
}


// ============================================
// CHAT MELDEN
// ============================================

async function reportChat() {
  if (!currentChatId || !currentChatMember) return;

  const reason = prompt(
    "Warum möchtest du diesen Chat melden?"
  );

  if (reason === null) return;

  if (reason.trim().length < 3) {
    alert("Bitte gib einen etwas genaueren Grund an.");
    return;
  }

  try {
    const { error } = await db.from("chat_reports").insert({
      conversation_id: currentChatId,
      reporter_id: currentUser.id,
      reason: reason.trim()
    });

    if (error) throw error;

    alert(
      "Der Chat wurde gemeldet. Ein Administrator kann ihn nun prüfen."
    );

  } catch (error) {
    alert("Meldung fehlgeschlagen: " + error.message);
  }
}


// ============================================
// ADMIN-PANEL
// ============================================

async function renderAdmin() {
  if (currentProfile?.is_admin !== true) {
    navigate("home");
    return;
  }

  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">
      <h2>🛡️ NEXO Admin-Panel</h2>

      <p class="muted">
        Willkommen im Verwaltungsbereich.
        Nur Administratoren können diese Seite öffnen.
      </p>
    </div>

    <div class="card">
      <h3>📊 Statistiken</h3>

      <div style="display:flex;gap:25px;flex-wrap:wrap">

        <div>
          <h2>${Object.keys(allProfiles).length}</h2>
          <span class="muted">Mitglieder</span>
        </div>

        <div>
          <h2>${allPosts.length}</h2>
          <span class="muted">Beiträge</span>
        </div>

        <div>
          <h2>${allComments.length}</h2>
          <span class="muted">Kommentare</span>
        </div>

      </div>
    </div>

    <div class="card">
      <h3>👥 Mitglieder verwalten</h3>
      <div id="adminMembers">Mitglieder werden geladen ...</div>
    </div>

    <div class="card">
      <h3>📝 Beiträge verwalten</h3>
      <div id="adminPosts">Beiträge werden geladen ...</div>
    </div>

    <div class="card">
      <h3>🚩 Gemeldete Chats</h3>
      <p class="muted">
        Hier erscheinen nur Chats, die von Mitgliedern gemeldet wurden.
        Normale private Chats sind für dich nicht sichtbar.
      </p>
      <div id="adminReports">Meldungen werden geladen ...</div>
    </div>
  `;

  const members = document.getElementById("adminMembers");
  const posts = document.getElementById("adminPosts");

  members.innerHTML = Object.values(allProfiles).map(profile => `
    <div style="
      display:flex;
      align-items:center;
      gap:12px;
      padding:12px 0;
      border-bottom:1px solid #30364a;
    ">

      ${avatar(profile, true)}

      <div style="flex:1">
        <strong>${esc(profile.display_name)}</strong><br>
        <small class="muted">@${esc(profile.username || "")}</small>
      </div>

      <span class="muted">
        ${profile.is_admin ? "🛡️ Admin" : "Mitglied"}
      </span>

    </div>
  `).join("") || "Keine Mitglieder gefunden.";

  posts.innerHTML = allPosts.map(post => {
    const author = allProfiles[post.user_id];

    return `
      <div style="
        padding:12px 0;
        border-bottom:1px solid #30364a;
      ">

        <strong>
          ${esc(author?.display_name || "Unbekannt")}
        </strong>

        <p>${esc(post.content || "Bildbeitrag")}</p>

      </div>
    `;
  }).join("") || "Keine Beiträge vorhanden.";

  await loadAdminReports();
}


// ============================================
// ADMIN: GEMELDETE CHATS
// ============================================

async function loadAdminReports() {
  const container = document.getElementById("adminReports");
  if (!container) return;

  try {
    const { data: reports, error } = await db
      .from("chat_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!reports || !reports.length) {
      container.innerHTML = `
        <div class="empty">
          ✅ Es gibt aktuell keine gemeldeten Chats.
        </div>
      `;
      return;
    }

    container.innerHTML = reports.map(report => {
      const reporter = allProfiles[report.reporter_id];

      return `
        <div class="card"
          style="margin:12px 0;border:1px solid #594b75">

          <strong>🚩 Chat-Meldung</strong>

          <p class="muted">
            Gemeldet von:
            ${esc(reporter?.display_name || "Unbekannt")}
          </p>

          <p>
            <strong>Grund:</strong><br>
            ${esc(report.reason)}
          </p>

          <p class="muted">
            ${formatDate(report.created_at)}
            · Status: ${esc(report.status)}
          </p>

          <button class="primary"
            data-review-chat="${report.conversation_id}"
            style="width:auto">
            👁️ Chat ansehen
          </button>

          ${report.status === "open" ? `
            <button class="secondary"
              data-review-report="${report.id}"
              style="width:auto">
              ✓ Als geprüft markieren
            </button>
          ` : ""}

        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-review-chat]").forEach(button => {
      button.onclick = () =>
        openChat(button.dataset.reviewChat, true);
    });

    container.querySelectorAll("[data-review-report]").forEach(button => {
      button.onclick = () =>
        markReportReviewed(Number(button.dataset.reviewReport));
    });

  } catch (error) {
    container.innerHTML = message(
      "Meldungen konnten nicht geladen werden: " + error.message,
      true
    );
  }
}


// ============================================
// ADMIN: MELDUNG ALS GEPRÜFT MARKIEREN
// ============================================

async function markReportReviewed(reportId) {
  try {
    const { error } = await db
      .from("chat_reports")
      .update({ status: "reviewed" })
      .eq("id", reportId);

    if (error) throw error;

    await loadAdminReports();

  } catch (error) {
    alert("Status konnte nicht geändert werden: " + error.message);
  }
}


// ============================================
// LOGOUT
// ============================================

async function logout() {
  clearInterval(refreshTimer);
  clearInterval(chatRefreshTimer);

  const { error } = await db.auth.signOut();

  if (error) {
    alert("Abmelden fehlgeschlagen: " + error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  currentChatId = null;

  showAuth("login");
}


// ============================================
// INITIALISIERUNG
// ============================================

async function init() {
  if (!window.supabase) {
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <h2>Supabase konnte nicht geladen werden</h2>
          <p class="muted">
            Prüfe, ob das Supabase-JavaScript in CodePen eingebunden ist.
          </p>
        </div>
      </div>
    `;
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    showAuth("login", error.message);
    return;
  }

  if (data.session) {
    await startApp(data.session.user);
  } else {
    showAuth("login");
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;
      showAuth("login");
    }
  });
}

init();
