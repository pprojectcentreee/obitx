// ══════════════════════════════════════════════════════════════
//  ORBITX APP.JS — All Firebase config & logic lives here
// ══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── FIREBASE CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyC_PHueA5xoZWjP2tLsXR1CWOnmNJfH2PY",
  authDomain: "app-orbitx.firebaseapp.com",
  projectId: "app-orbitx",
  storageBucket: "app-orbitx.firebasestorage.app",
  messagingSenderId: "61873198448",
  appId: "1:61873198448:web:5795fc31d3ccce267babb5"
};

// ── INITIALIZE FIREBASE ──
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let currentUser   = null;
let activeTab     = "feed";
let selectedTag   = "general";
let currentPostId = null;   // for comment modal
let feedUnsub     = null;   // unsubscribe real-time listener
let exploreUnsub  = null;
let userPostsUnsub = null;
let activityLog   = [];

// ══════════════════════════════════════
//  DOM HELPERS
// ══════════════════════════════════════
const $ = id => document.getElementById(id);
const loginScreen   = $("login-screen");
const appScreen     = $("app-screen");

function showToast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast show${type === "error" ? " error" : ""}`;
  setTimeout(() => { t.className = "toast"; }, 3000);
}

function timeAgo(ts) {
  if (!ts) return "just now";
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400)return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function avatarFallback(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d1b2a&color=00d4ff&bold=true`;
}

// ══════════════════════════════════════
//  VIDEO BACKGROUND ROTATION
// ══════════════════════════════════════
(function initVideoBg() {
  const videos = document.querySelectorAll(".bg-video");
  let idx = 0;
  setInterval(() => {
    videos[idx].classList.remove("active");
    idx = (idx + 1) % videos.length;
    videos[idx].classList.add("active");
  }, 12000);
})();

// ══════════════════════════════════════
//  PARTICLE CANVAS
// ══════════════════════════════════════
(function initParticles() {
  const canvas = $("particles-canvas");
  const ctx = canvas.getContext("2d");
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.3;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      this.alpha = Math.random() * 0.6 + 0.1;
      this.color = Math.random() > 0.5 ? "#00d4ff" : "#7b2fff";
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    // draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 80) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${0.12 * (1 - dist/80)})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
})();

// ══════════════════════════════════════
//  RADAR CANVAS (Dashboard)
// ══════════════════════════════════════
function initRadar() {
  const canvas = $("radar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 300, H = 300, cx = 150, cy = 150, R = 130;
  let angle = 0;

  const data = [
    { label: "Launches",  val: 0.42, color: "#00d4ff"  },
    { label: "Missions",  val: 0.28, color: "#00ff88"  },
    { label: "Research",  val: 0.80, color: "#7b2fff"  },
    { label: "General",   val: 1.00, color: "#ffd700"  },
  ];

  function drawRadar() {
    ctx.clearRect(0, 0, W, H);

    // Rings
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R / 4) * i, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${0.08 + i*0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axes
    const n = data.length;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i / n) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = "rgba(0,212,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Data polygon
    ctx.beginPath();
    data.forEach((d, i) => {
      const a = (Math.PI * 2 * i / n) - Math.PI / 2;
      const r = R * d.val;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(0,212,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,212,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dots
    data.forEach((d, i) => {
      const a = (Math.PI * 2 * i / n) - Math.PI / 2;
      const r = R * d.val;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.shadowBlur = 8;
      ctx.shadowColor = d.color;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Sweep line
    angle += 0.015;
    const sx = cx + R * Math.cos(angle);
    const sy = cy + R * Math.sin(angle);
    const grad = ctx.createLinearGradient(cx, cy, sx, sy);
    grad.addColorStop(0, "rgba(0,212,255,0)");
    grad.addColorStop(1, "rgba(0,212,255,0.6)");
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();

    requestAnimationFrame(drawRadar);
  }
  drawRadar();
}

// ══════════════════════════════════════
//  HUD CLOCK
// ══════════════════════════════════════
function startClock() {
  function tick() {
    const el = $("hud-clock");
    if (!el) return;
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, "0");
    const m = String(now.getUTCMinutes()).padStart(2, "0");
    const s = String(now.getUTCSeconds()).padStart(2, "0");
    el.textContent = `${h}:${m}:${s} UTC`;
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
$("google-signin-btn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    showToast("Sign-in failed: " + err.message, "error");
  }
});

$("signout-btn").addEventListener("click", async () => {
  if (feedUnsub) feedUnsub();
  if (exploreUnsub) exploreUnsub();
  if (userPostsUnsub) userPostsUnsub();
  await signOut(auth);
});

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    await ensureUserProfile(user);
    loginScreen.classList.remove("active");
    appScreen.classList.add("active");
    initApp();
  } else {
    currentUser = null;
    appScreen.classList.remove("active");
    loginScreen.classList.add("active");
    // reset UI
    $("posts-container").innerHTML = `<div class="loading-posts"><div class="orbit-loader"></div><span>Syncing orbital data...</span></div>`;
  }
});

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL || avatarFallback(user.displayName),
      postCount: 0,
      likeCount: 0,
      joinedAt: serverTimestamp()
    });
  }
}

// ══════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════
function initApp() {
  // Nav info
  $("nav-avatar").src = currentUser.photoURL || avatarFallback(currentUser.displayName);
  $("nav-name").textContent = currentUser.displayName?.split(" ")[0] || "Pilot";
  $("post-author-avatar").src = currentUser.photoURL || avatarFallback(currentUser.displayName);
  $("comment-author-avatar").src = currentUser.photoURL || avatarFallback(currentUser.displayName);

  // Profile
  $("profile-avatar").src = currentUser.photoURL || avatarFallback(currentUser.displayName);
  $("profile-name").textContent = currentUser.displayName || "Unknown Pilot";
  $("profile-email").textContent = currentUser.email || "";

  startClock();
  initRadar();
  loadFeed();
  loadStats();
  setupTabNav();
  setupTagButtons();
  setupPostSubmit();
  setupCommentModal();
  setupFAB();
  setupExploreSearch();
  setupMobileNav();
}

// ══════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════
function setupTabNav() {
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".mobile-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach(s => s.classList.toggle("active", s.id === `tab-${tab}`));

  if (tab === "explore") loadExplore();
  if (tab === "profile") loadUserPosts();
  if (tab === "dashboard") loadStats();
}

// ══════════════════════════════════════
//  TAG SELECTION
// ══════════════════════════════════════
function setupTagButtons() {
  document.querySelectorAll(".tag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tag-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTag = btn.dataset.tag;
    });
  });
}

// ══════════════════════════════════════
//  CREATE POST
// ══════════════════════════════════════
function setupPostSubmit() {
  const btn = $("submit-post-btn");
  const textarea = $("post-content");

  // Auto-expand textarea
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });

  btn.addEventListener("click", submitPost);
  textarea.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "Enter") submitPost();
  });
}

async function submitPost() {
  const content = $("post-content").value.trim();
  if (!content) { showToast("Write something to transmit!", "error"); return; }
  if (content.length > 1000) { showToast("Post too long (max 1000 chars)", "error"); return; }

  const btn = $("submit-post-btn");
  btn.disabled = true;
  btn.textContent = "Transmitting...";

  try {
    await addDoc(collection(db, "posts"), {
      content,
      tag: selectedTag,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Pilot",
      authorPhoto: currentUser.photoURL || avatarFallback(currentUser.displayName),
      likes: [],
      commentCount: 0,
      createdAt: serverTimestamp()
    });

    // Update user post count
    const uRef = doc(db, "users", currentUser.uid);
    await updateDoc(uRef, { postCount: increment(1) });

    $("post-content").value = "";
    $("post-content").style.height = "auto";
    showToast("✅ Transmission sent!");
    addActivity(`You posted in #${selectedTag}`);

    // Update profile stats
    loadProfileStats();
  } catch (err) {
    showToast("Transmission failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Transmit`;
  }
}

// ══════════════════════════════════════
//  REAL-TIME FEED
// ══════════════════════════════════════
function loadFeed() {
  if (feedUnsub) feedUnsub();
  const container = $("posts-container");
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(30));

  feedUnsub = onSnapshot(q, snap => {
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><p>No transmissions yet. Be the first to broadcast!</p></div>`;
      return;
    }
    container.innerHTML = "";
    snap.forEach(d => container.appendChild(buildPostCard(d.id, d.data())));
  }, err => {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error loading feed: ${err.message}</p></div>`;
  });
}

// ══════════════════════════════════════
//  EXPLORE
// ══════════════════════════════════════
function loadExplore(tag = "all") {
  if (exploreUnsub) exploreUnsub();
  const container = $("explore-posts");
  container.innerHTML = `<div class="loading-posts"><div class="orbit-loader"></div><span>Scanning grid...</span></div>`;

  let q;
  if (tag === "all") {
    q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  } else {
    q = query(collection(db, "posts"), where("tag", "==", tag), orderBy("createdAt", "desc"), limit(50));
  }

  exploreUnsub = onSnapshot(q, snap => {
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔭</div><p>No posts in this sector yet.</p></div>`;
      return;
    }
    container.innerHTML = "";
    snap.forEach(d => container.appendChild(buildPostCard(d.id, d.data())));
  });
}

function setupExploreSearch() {
  const input = $("explore-search");
  input.addEventListener("input", debounce(async () => {
    const term = input.value.trim().toLowerCase();
    if (!term) { loadExplore(); return; }
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    const container = $("explore-posts");
    container.innerHTML = "";
    let found = 0;
    snap.forEach(d => {
      const data = d.data();
      if (data.content.toLowerCase().includes(term) || data.authorName.toLowerCase().includes(term) || (data.tag || "").toLowerCase().includes(term)) {
        container.appendChild(buildPostCard(d.id, data));
        found++;
      }
    });
    if (!found) container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔭</div><p>No results for "${term}"</p></div>`;
  }, 400));

  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadExplore(btn.dataset.cat);
    });
  });
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ══════════════════════════════════════
//  USER POSTS (PROFILE)
// ══════════════════════════════════════
function loadUserPosts() {
  if (userPostsUnsub) userPostsUnsub();
  const container = $("user-posts");
  container.innerHTML = `<div class="loading-posts"><div class="orbit-loader"></div><span>Loading your transmissions...</span></div>`;

  const q = query(
    collection(db, "posts"),
    where("authorId", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  userPostsUnsub = onSnapshot(q, snap => {
    $("pstat-posts").textContent = snap.size;
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><p>No transmissions yet. Start broadcasting!</p></div>`;
      return;
    }
    container.innerHTML = "";
    snap.forEach(d => {
      const card = buildPostCard(d.id, d.data(), true);
      container.appendChild(card);
    });
  });
}

async function loadProfileStats() {
  const uRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(uRef);
  if (snap.exists()) {
    const d = snap.data();
    $("pstat-posts").textContent = d.postCount || 0;
    $("pstat-likes").textContent = d.likeCount || 0;
  }
}

// ══════════════════════════════════════
//  BUILD POST CARD
// ══════════════════════════════════════
function buildPostCard(postId, data, showDelete = false) {
  const card = document.createElement("div");
  card.className = "post-card glass card-glow";
  card.dataset.postId = postId;

  const liked = data.likes?.includes(currentUser?.uid);
  const likeCount = data.likes?.length || 0;
  const tagClass = `tag-${data.tag || "general"}`;
  const isOwn = data.authorId === currentUser?.uid;

  card.innerHTML = `
    <div class="post-header">
      <img src="${data.authorPhoto || avatarFallback(data.authorName)}" alt="" class="avatar-sm" onerror="this.src='${avatarFallback(data.authorName)}'"/>
      <div class="post-meta">
        <div class="post-author">${escHtml(data.authorName)}</div>
        <div class="post-time">${timeAgo(data.createdAt)}</div>
      </div>
      <span class="post-tag-badge ${tagClass}">#${data.tag || "general"}</span>
    </div>
    <div class="post-body">${escHtml(data.content)}</div>
    <div class="post-actions">
      <button class="action-btn like-btn ${liked ? "liked" : ""}" data-id="${postId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        ${likeCount}
      </button>
      <button class="action-btn comment-btn" data-id="${postId}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        ${data.commentCount || 0}
      </button>
      <button class="action-btn share-btn" data-content="${escHtml(data.content)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Share
      </button>
      ${isOwn ? `<button class="action-btn delete-btn" data-id="${postId}" style="margin-left:auto;color:var(--neon-red)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>` : ""}
    </div>
  `;

  // Like
  card.querySelector(".like-btn").addEventListener("click", () => toggleLike(postId, data.likes || []));
  // Comment
  card.querySelector(".comment-btn").addEventListener("click", () => openComments(postId));
  // Share
  card.querySelector(".share-btn").addEventListener("click", e => {
    const text = e.currentTarget.dataset.content;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast("📋 Copied to clipboard!");
    }
  });
  // Delete
  if (isOwn) {
    card.querySelector(".delete-btn").addEventListener("click", () => deletePost(postId));
  }

  return card;
}

function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

// ══════════════════════════════════════
//  LIKE SYSTEM
// ══════════════════════════════════════
async function toggleLike(postId, currentLikes) {
  if (!currentUser) return;
  const ref = doc(db, "posts", postId);
  const liked = currentLikes.includes(currentUser.uid);
  try {
    await updateDoc(ref, {
      likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
    });
    if (!liked) addActivity(`You liked a post`);
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
}

// ══════════════════════════════════════
//  DELETE POST
// ══════════════════════════════════════
async function deletePost(postId) {
  if (!confirm("Delete this transmission?")) return;
  try {
    await deleteDoc(doc(db, "posts", postId));
    // Delete comments subcollection
    const cSnap = await getDocs(collection(db, "posts", postId, "comments"));
    cSnap.forEach(async d => await deleteDoc(d.ref));
    // Decrement user post count
    await updateDoc(doc(db, "users", currentUser.uid), { postCount: increment(-1) });
    showToast("🗑️ Transmission deleted");
    addActivity("You deleted a post");
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
}

// ══════════════════════════════════════
//  COMMENT MODAL
// ══════════════════════════════════════
function setupCommentModal() {
  $("close-modal").addEventListener("click", closeComments);
  $("comment-modal").addEventListener("click", e => { if (e.target === $("comment-modal")) closeComments(); });

  $("submit-comment").addEventListener("click", submitComment);
  $("comment-input").addEventListener("keydown", e => { if (e.key === "Enter") submitComment(); });
}

let commentUnsub = null;

function openComments(postId) {
  currentPostId = postId;
  $("comment-modal").style.removeProperty("display");
  $("comment-input").value = "";
  $("comments-list").innerHTML = `<div class="loading-posts"><div class="orbit-loader"></div></div>`;

  if (commentUnsub) commentUnsub();
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
  commentUnsub = onSnapshot(q, snap => {
    const list = $("comments-list");
    if (snap.empty) {
      list.innerHTML = `<div class="no-comments">No replies yet. Start the conversation!</div>`;
      return;
    }
    list.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const item = document.createElement("div");
      item.className = "comment-item";
      item.innerHTML = `
        <img src="${data.authorPhoto || avatarFallback(data.authorName)}" class="avatar-sm" style="width:30px;height:30px" onerror="this.src='${avatarFallback(data.authorName)}'"/>
        <div class="comment-body">
          <div class="comment-author">${escHtml(data.authorName)}</div>
          <div class="comment-text">${escHtml(data.text)}</div>
          <div class="comment-time">${timeAgo(data.createdAt)}</div>
        </div>
      `;
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  });
}

function closeComments() {
  $("comment-modal").style.display = "none";
  if (commentUnsub) { commentUnsub(); commentUnsub = null; }
  currentPostId = null;
}

async function submitComment() {
  const text = $("comment-input").value.trim();
  if (!text || !currentPostId) return;
  $("comment-input").value = "";
  try {
    await addDoc(collection(db, "posts", currentPostId, "comments"), {
      text,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Pilot",
      authorPhoto: currentUser.photoURL || avatarFallback(currentUser.displayName),
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "posts", currentPostId), { commentCount: increment(1) });
    addActivity("You replied to a transmission");
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
}

// ══════════════════════════════════════
//  FAB — scroll to create post
// ══════════════════════════════════════
function setupFAB() {
  $("fab").addEventListener("click", () => {
    switchTab("feed");
    setTimeout(() => {
      $("post-content").focus();
      $("post-content").scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  });
}

// ══════════════════════════════════════
//  DASHBOARD STATS
// ══════════════════════════════════════
async function loadStats() {
  try {
    const snap = await getDocs(collection(db, "posts"));
    const count = snap.size;
    $("stat-posts").textContent = count;

    // Count total likes
    let likes = 0;
    snap.forEach(d => { likes += (d.data().likes || []).length; });
    $("stat-likes").textContent = likes;
    $("stat-members").textContent = Math.floor(Math.random() * 50) + 12; // Simulated

    loadProfileStats();
  } catch (e) {
    // ignore
  }
}

// ══════════════════════════════════════
//  ACTIVITY FEED (Dashboard)
// ══════════════════════════════════════
function addActivity(text) {
  activityLog.unshift({ text, time: new Date() });
  if (activityLog.length > 8) activityLog.pop();
  renderActivity();
}

function renderActivity() {
  const el = $("activity-timeline");
  if (!el) return;
  el.innerHTML = "";
  activityLog.forEach(item => {
    const d = document.createElement("div");
    d.className = "activity-item";
    const secAgo = Math.round((Date.now() - item.time.getTime()) / 1000);
    const t = secAgo < 60 ? `${secAgo}s ago` : `${Math.floor(secAgo/60)}m ago`;
    d.innerHTML = `<div class="activity-dot"></div><div class="activity-text">${escHtml(item.text)}</div><div class="activity-time">${t}</div>`;
    el.appendChild(d);
  });
}

// ══════════════════════════════════════
//  MOBILE BOTTOM NAV (inject)
// ══════════════════════════════════════
function setupMobileNav() {
  const nav = document.createElement("nav");
  nav.className = "mobile-nav";
  nav.innerHTML = `
    <div class="mobile-nav-inner">
      <button class="mobile-nav-btn active" data-tab="feed">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        Feed
      </button>
      <button class="mobile-nav-btn" data-tab="explore">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Explore
      </button>
      <button class="mobile-nav-btn" data-tab="groups">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        Groups
      </button>
      <button class="mobile-nav-btn" data-tab="dashboard">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        HUD
      </button>
      <button class="mobile-nav-btn" data-tab="profile">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Me
      </button>
    </div>
  `;
  document.body.appendChild(nav);
  nav.querySelectorAll(".mobile-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

// ══════════════════════════════════════
//  GROUP JOIN BUTTONS (static UX)
// ══════════════════════════════════════
document.querySelectorAll(".btn-join").forEach(btn => {
  btn.addEventListener("click", function() {
    const joined = this.textContent === "Joined";
    this.textContent = joined ? "Join" : "Joined";
    this.style.color = joined ? "" : "var(--neon-green)";
    this.style.borderColor = joined ? "" : "var(--neon-green)";
    showToast(joined ? "Left community" : "✅ Joined community!");
  });
});

// ══════════════════════════════════════
//  CREATE GROUP (modal-less simple flow)
// ══════════════════════════════════════
document.getElementById("create-group-btn")?.addEventListener("click", () => {
  showToast("🚧 Community creation coming soon!");
});

// Initial activity seed
addActivity("OrbitX network initialized");
