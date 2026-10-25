import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, increment, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAyKcFsblntjAqSD58Q15a1ZHDjjRpsMw",
  authDomain: "creditdebit-app-a33c8.firebaseapp.com",
  projectId: "creditdebit-app-a33c8",
  storageBucket: "creditdebit-app-a33c8.firebasestorage.app",
  messagingSenderId: "782522431758",
  appId: "1:782522431758:web:677034a42d3a62f91eff5f"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const money = n => Number(n).toLocaleString("en-IN");
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = d => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const fmtL = d => {
  if (!d) return "";
  const x = new Date(d);
  return x.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) + " " + x.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};
const nowLocal = () => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0, 16); };
const color = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `linear-gradient(135deg,hsl(${h},70%,55%),hsl(${(h + 40) % 360},70%,42%))`; };
const initial = s => (s || "?").trim().charAt(0).toUpperCase();

let accounts = [], txns = [], cash = [], allTx = [];
let cur = null, unsubA = null, unsubT = null, unsubC = null, filter = "all", catSel = "", period = "all";

/* theme (dark by default) */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === "dark" ? "#070b1a" : "#eef1fb";
}
function toggleTheme() { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }
let saved = null;
try { saved = localStorage.getItem("theme"); } catch (e) {}
setTheme(saved || "dark");

/* helpers */
const uid = () => auth.currentUser.uid;
const accCol = () => collection(db, "users", uid(), "accounts");
const accRef = id => doc(db, "users", uid(), "accounts", id);
const txCol = () => collection(db, "users", uid(), "accounts", cur, "txns");
const cashCol = () => collection(db, "users", uid(), "cashbook");
function curAcc() { return accounts.find(x => x.id === cur); }

function toast(m) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = m;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function openSheet(html) { $("sheet").onclick = null; $("sheet").innerHTML = html; $("overlay").classList.add("open"); }
function closeSheet() { $("overlay").classList.remove("open"); }
$("overlay").onclick = e => { if (e.target === $("overlay")) closeSheet(); };
function confirmBox(msg, okText, fn) {
  openSheet(`<h3>${esc(msg)}</h3><div class="two"><button class="btn ghost" id="no">Cancel</button><button class="btn red" id="yes">${okText}</button></div>`);
  $("no").onclick = closeSheet;
  $("yes").onclick = async () => { closeSheet(); await fn(); };
}
function download(name, csv) {
  const l = document.createElement("a");
  l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  l.download = name; l.click();
}

/* drawer */
function openDrawer() { $("dov").classList.add("open"); }
function closeDrawer() { $("dov").classList.remove("open"); }
$("menuBtn").onclick = openDrawer;
$("dov").onclick = e => {
  if (e.target === $("dov")) return closeDrawer();
  const b = e.target.closest("[data-go]");
  if (!b) return;
  closeDrawer();
  const k = b.dataset.go;
  if (k === "home") goHome();
  if (k === "txs") openTxs();
  if (k === "cash") openCash();
  if (k === "calc") calcSheet();
  if (k === "theme") toggleTheme();
  if (k === "logout") confirmBox("Logout from your account?", "Logout", () => signOut(auth));
};

/* views */
function view(name) {
  ["login", "home", "acc", "txs", "cash"].forEach(v => $(v).hidden = v !== name);
  $("dock").hidden = name !== "home";
  $("bar").hidden = name !== "acc";
  $("cbar").hidden = name !== "cash";
  const home = name === "home", sub = ["acc", "txs", "cash"].includes(name);
  $("menuBtn").hidden = !home; $("searchBtn").hidden = !home;
  $("bellBtn").hidden = !home; $("moreBtn").hidden = !home;
  $("backBtn").hidden = !sub; $("delBtn").hidden = name !== "acc";
  $("title").textContent = name === "txs" ? "Transactions" : name === "cash" ? "Cash Book" : name === "acc" ? (curAcc() ? curAcc().name : "") : "Daily Transactions";
}
function goHome() {
  cur = null;
  if (unsubT) { unsubT(); unsubT = null; }
  if (unsubC) { unsubC(); unsubC = null; }
  view("home");
}
$("backBtn").onclick = goHome;

/* auth */
$("loginBtn").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { toast("Login error: " + e.message); }
};
onAuthStateChanged(auth, user => {
  if (unsubA) unsubA();
  if (unsubT) unsubT();
  if (unsubC) unsubC();
  cur = null;
  if (!user) return view("login");
  $("dName").textContent = user.displayName || "";
  $("dMail").textContent = user.email || "";
  $("dAv").textContent = initial(user.displayName);
  view("home");
  unsubA = onSnapshot(query(accCol(), orderBy("name")), snap => {
    accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHome();
    if (cur) renderAcc();
  });
});

/* home */
function renderHome() {
  let due = 0, adv = 0;
  accounts.forEach(a => { const b = a.balance || 0; if (b > 0) due += b; else adv -= b; });
  const bal = due - adv;
  const balTxt = (bal < 0 ? "-" : "") + money(Math.abs(bal));
  $("sDue").textContent = money(due);
  $("sAdv").textContent = money(adv);
  $("sBal").textContent = balTxt;
  $("dDue").textContent = money(due);
  $("dAdv").textContent = money(adv);
  $("dBal").textContent = balTxt;
  const cats = [...new Set(accounts.map(a => a.category).filter(Boolean))];
  if (catSel && !cats.includes(catSel)) catSel = "";
  const chips = [["all", "All"], ["due", "Due"], ["advance", "Advance"], ["settled", "Settled"], ["cat", (catSel || "Category") + " ▾"]];
  $("chips").innerHTML = chips.map(([k, l]) =>
    `<button class="chip ${(k === "cat" ? !!catSel : k === filter) ? "on" : ""}" data-f="${k}">${esc(l)}</button>`).join("");
  const s = $("search").value.toLowerCase();
  const rows = accounts.filter(a => {
    const b = a.balance || 0;
    if (filter === "due" && !(b > 0)) return false;
    if (filter === "advance" && !(b < 0)) return false;
    if (filter === "settled" && b !== 0) return false;
    if (catSel && a.category !== catSel) return false;
    if (s && !a.name.toLowerCase().includes(s)) return false;
    return true;
  });
  $("list").innerHTML = rows.map(a => {
    const b = a.balance || 0;
    return `<div class="item" data-open="${a.id}">
      <div class="av" style="background:${color(a.name)}">${esc(initial(a.name))}</div>
      <div class="nm"><b>${esc(a.name)}</b><small>${esc(a.category || "No category")}</small></div>
      <div class="amt"><b class="${b > 0 ? "red" : b < 0 ? "green" : ""}">${money(Math.abs(b))}</b><small>${b > 0 ? "Due" : b < 0 ? "Advance" : "Settled"}</small></div></div>`;
  }).join("") || `<div class="empty">📭<br>No customers here.<br>Tap <b>Add Customer</b> to start.</div>`;
}
$("search").oninput = renderHome;
$("searchBtn").onclick = () => {
  $("searchBox").hidden = !$("searchBox").hidden;
  if (!$("searchBox").hidden) $("search").focus(); else { $("search").value = ""; renderHome(); }
};
$("chips").onclick = e => {
  const c = e.target.closest("[data-f]");
  if (!c) return;
  const k = c.dataset.f;
  if (k === "cat") {
    const cats = [...new Set(accounts.map(a => a.category).filter(Boolean))];
    openSheet(`<h3>Category</h3><button class="mi" data-c="">All categories</button>` +
      cats.map(x => `<button class="mi" data-c="${esc(x)}">${esc(x)}</button>`).join("") +
      (cats.length ? "" : `<div class="empty">No categories yet. Add one when creating a customer.</div>`));
    $("sheet").onclick = ev => { const b = ev.target.closest("[data-c]"); if (b) { catSel = b.dataset.c; closeSheet(); renderHome(); } };
  } else { filter = k; renderHome(); }
};
$("list").onclick = e => { const el = e.target.closest("[data-open]"); if (el) openAcc(el.dataset.open); };
/* add customer popup */
$("addBtn").onclick = () => {
  const cats = [...new Set(accounts.map(a => a.category).filter(Boolean))];
  openSheet(`<h3>Add customer</h3>
    <button class="btn ghost full" id="pick">📇 Pick from contacts</button>
    <label>Name</label><input id="aName" placeholder="Customer / supplier name">
    <label>Phone</label><input id="aPhone" type="tel" placeholder="With country code, e.g. 919876543210">
    <label>Category</label><input id="aCat" list="catlist" placeholder="Customer, supplier, shop...">
    <datalist id="catlist">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="two"><button class="btn ghost" id="x">Cancel</button><button class="btn" id="ok">Save</button></div>`);
  $("x").onclick = closeSheet;
  $("pick").onclick = async () => {
    if (!("contacts" in navigator && "ContactsManager" in window)) return toast("Contact picker not supported on this device");
    try {
      const [c] = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!c) return;
      $("aName").value = (c.name && c.name[0]) || "";
      $("aPhone").value = ((c.tel && c.tel[0]) || "").replace(/[^\d+]/g, "");
    } catch (e) { toast("Could not open contacts"); }
  };
  $("ok").onclick = async () => {
    const name = $("aName").value.trim();
    if (!name) return toast("Enter a name");
    await addDoc(accCol(), { name, phone: $("aPhone").value.trim(), category: $("aCat").value.trim(), balance: 0, createdAt: serverTimestamp() });
    closeSheet(); toast("Customer added");
  };
};

/* account page */
function openAcc(id) {
  cur = id;
  period = "all";
  if (unsubT) unsubT();
  view("acc");
  unsubT = onSnapshot(query(txCol(), orderBy("date", "desc")), snap => {
    txns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAcc();
  });
  renderAcc();
}
function inPeriod(d) {
  if (period === "all" || !d) return true;
  const x = new Date(d), n = new Date();
  if (period === "daily") return x.toDateString() === n.toDateString();
  if (period === "weekly") return n - x <= 7 * 864e5;
  if (period === "monthly") return x.getMonth() === n.getMonth() && x.getFullYear() === n.getFullYear();
  if (period === "yearly") return x.getFullYear() === n.getFullYear();
  return true;
}
function renderAcc() {
  const a = curAcc();
  if (!a) return goHome();
  const b = a.balance || 0;
  $("title").textContent = a.name;
  $("accAv").textContent = initial(a.name);
  $("accCat").textContent = a.category || "";
  $("accBal").textContent = money(Math.abs(b));
  $("accStatus").textContent = b > 0 ? "Due: they owe you" : b < 0 ? "Advance: you owe them" : "All settled";

  let run = 0;
  const rb = {};
  [...txns].reverse().forEach(t => { run += t.type === "gave" ? t.amount : -t.amount; rb[t.id] = run; });
  const list = txns.filter(t => inPeriod(t.date));
  let rec = 0, giv = 0;
  list.forEach(t => { if (t.type === "gave") giv += t.amount; else rec += t.amount; });

  $("tCount").textContent = list.length;
  $("tRec").textContent = money(rec);
  $("tGiv").textContent = money(giv);
  $("tBal").textContent = money(Math.abs(b)) + (b > 0 ? " Due" : b < 0 ? " Advance" : "");
  $("tBal").className = b > 0 ? "red" : b < 0 ? "green" : "";
  $("pChips").innerHTML = [["all", "All"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]]
    .map(([k, l]) => `<button class="chip ${k === period ? "on" : ""}" data-p="${k}">${l}</button>`).join("");
  $("txList").innerHTML = list.map(t => {
    const r = rb[t.id] || 0;
    return `<div class="tr" data-tx="${t.id}">
      <span class="dt">${esc(fmtL(t.date))}${t.note ? `<span class="nt">${esc(t.note)}</span>` : ""}</span>
      <span class="gr green">${t.type === "got" ? money(t.amount) : ""}</span>
      <span class="rd red">${t.type === "gave" ? money(t.amount) : ""}</span>
      <span class="bc ${r > 0 ? "red" : r < 0 ? "green" : ""}">${r < 0 ? "-" : ""}${money(Math.abs(r))}</span></div>`;
  }).join("") || `<div class="empty">📝<br>No entries here.<br>Use the buttons below.</div>`;
}
$("pChips").onclick = e => { const c = e.target.closest("[data-p]"); if (c) { period = c.dataset.p; renderAcc(); } };
$("balTog").onchange = () => $("tbl").classList.toggle("nobal", !$("balTog").checked);

function txSheet(type, t) {
  const edit = !!t;
  let dv = edit ? (t.date || "") : nowLocal();
  if (dv.length === 10) dv += "T00:00";
  openSheet(`<h3 class="${type === "gave" ? "red" : "green"}">${edit ? "Edit entry" : type === "gave" ? "You Gave" : "You Received"}</h3>
    <input id="tAmount" class="bigin" type="number" inputmode="decimal" placeholder="0" value="${edit ? t.amount : ""}">
    <label>Note</label><input id="tNote" placeholder="Optional" value="${esc(edit ? t.note : "")}">
    <label>Date and time</label><input id="tDate" type="datetime-local" value="${dv}">
    <div class="two"><button class="btn ghost" id="x">Cancel</button><button class="btn ${type === "gave" ? "red" : "grn"}" id="ok">Save</button></div>`);
  $("x").onclick = closeSheet;
  setTimeout(() => $("tAmount").focus(), 300);
  $("ok").onclick = async () => {
    const amt = parseFloat($("tAmount").value);
    if (!amt || amt <= 0) return toast("Enter a valid amount");
    const note = $("tNote").value.trim(), date = $("tDate").value || nowLocal();
    const b = writeBatch(db);
    if (edit) {
      b.update(doc(txCol(), t.id), { amount: amt, note, date });
      b.update(accRef(cur), { balance: increment((t.type === "gave" ? 1 : -1) * (amt - t.amount)) });
    } else {
      b.set(doc(txCol()), { amount: amt, type, note, date, createdAt: serverTimestamp() });
      b.update(accRef(cur), { balance: increment(type === "gave" ? amt : -amt) });
    }
    await b.commit();
    closeSheet(); toast(edit ? "Entry updated" : "Entry saved");
  };
}
$("gaveBtn").onclick = () => txSheet("gave");
$("gotBtn").onclick = () => txSheet("got");

$("txList").onclick = e => {
  const row = e.target.closest("[data-tx]");
  if (!row) return;
  const t = txns.find(x => x.id === row.dataset.tx);
  if (!t) return;
  openSheet(`<h3 class="${t.type === "gave" ? "red" : "green"}">${t.type === "gave" ? "You Gave" : "You Received"} ${money(t.amount)}</h3>
    <small>${esc(fmtL(t.date))}</small>
    <div class="two"><button class="btn ghost" id="ed">✏️ Edit</button><button class="btn red" id="rm">🗑 Delete</button></div>`);
  $("ed").onclick = () => txSheet(t.type, t);
  $("rm").onclick = () => confirmBox("Delete this entry?", "Delete", async () => {
    const b = writeBatch(db);
    b.delete(doc(txCol(), t.id));
    b.update(accRef(cur), { balance: increment(t.type === "gave" ? -t.amount : t.amount) });
    await b.commit();
    toast("Entry deleted");
  });
};
$("delBtn").onclick = () => confirmBox("Delete this customer and all entries?", "Delete", async () => {
  const id = cur;
  const snap = await getDocs(txCol());
  const b = writeBatch(db);
  snap.forEach(d => b.delete(d.ref));
  b.delete(accRef(id));
  await b.commit();
  goHome(); toast("Customer deleted");
});

function remindAcc(a) {
  if (!a.phone) return toast("Add a phone number first");
  const msg = `Hello ${a.name}, your pending balance is ${money(Math.abs(a.balance || 0))}. Please pay soon. Thank you.`;
  window.open("https://wa.me/" + a.phone.replace(/\D/g, "") + "?text=" + encodeURIComponent(msg));
}
$("call").onclick = () => {
  const a = curAcc();
  if (!a.phone) return toast("Add a phone number first");
  location.href = "tel:" + a.phone;
};
$("remind").onclick = () => remindAcc(curAcc());
$("export").onclick = () => {
  const a = curAcc();
  let csv = "Date,Type,Amount,Note\n";
  [...txns].reverse().forEach(t => csv += `${t.date},${t.type === "gave" ? "You Gave" : "You Received"},${t.amount},"${(t.note || "").replace(/"/g, '""')}"\n`);
  download(a.name + ".csv", csv);
};

/* all transactions */
async function openTxs() {
  view("txs");
  $("txsList").innerHTML = `<div class="empty">Loading...</div>`;
  try {
    const res = await Promise.all(accounts.map(async a => {
      const s = await getDocs(collection(db, "users", uid(), "accounts", a.id, "txns"));
      return s.docs.map(d => ({ id: d.id, acc: a, ...d.data() }));
    }));
    allTx = res.flat().sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  } catch (e) { allTx = []; toast("Could not load transactions"); }
  $("txCount").textContent = allTx.length;
  $("txsList").innerHTML = allTx.map(t => `<div class="tx" data-acc="${t.acc.id}">
    <div class="dot ${t.type}">${t.type === "gave" ? "↑" : "↓"}</div>
    <div class="tm"><b>${esc(t.acc.name)}</b><small>${t.type === "gave" ? "You Gave" : "You Received"} · ${esc(fmt(t.date))}</small>${t.note ? `<small>${esc(t.note)}</small>` : ""}</div>
    <div class="ta ${t.type === "gave" ? "red" : "green"}">${money(t.amount)}</div></div>`).join("")
    || `<div class="empty">🧾<br>No transactions yet.</div>`;
}
$("txsList").onclick = e => { const el = e.target.closest("[data-acc]"); if (el) openAcc(el.dataset.acc); };
$("txBtn").onclick = openTxs;

/* cash book */
function openCash() {
  if (unsubC) unsubC();
  view("cash");
  unsubC = onSnapshot(query(cashCol(), orderBy("date", "desc")), snap => {
    cash = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCash();
  });
}
function renderCash() {
  let i = 0, o = 0;
  cash.forEach(c => { if (c.type === "in") i += c.amount; else o += c.amount; });
  $("cIn").textContent = money(i); $("cOut").textContent = money(o);
  $("cBal").textContent = (i - o < 0 ? "-" : "") + money(Math.abs(i - o));
  $("cashList").innerHTML = cash.map(c => `<div class="tx">
    <div class="dot ${c.type}">${c.type === "in" ? "↓" : "↑"}</div>
    <div class="tm"><b>${c.type === "in" ? "Cash In" : "Cash Out"}</b><small>${esc(fmt(c.date))}</small>${c.note ? `<small>${esc(c.note)}</small>` : ""}</div>
    <div class="ta ${c.type === "in" ? "green" : "red"}">${money(c.amount)}</div>
    <div><button class="ib2" data-cedit="${c.id}">✏️</button><button class="ib2" data-cdel="${c.id}">🗑</button></div></div>`).join("")
    || `<div class="empty">💵<br>No cash entries yet.</div>`;
}
function cashSheet(type, e) {
  const edit = !!e;
  let dv = edit ? (e.date || "") : nowLocal();
  if (dv.length === 10) dv += "T00:00";
  openSheet(`<h3 class="${type === "in" ? "green" : "red"}">${edit ? "Edit entry" : type === "in" ? "Cash In" : "Cash Out"}</h3>
    <input id="tAmount" class="bigin" type="number" inputmode="decimal" placeholder="0" value="${edit ? e.amount : ""}">
    <label>Note</label><input id="tNote" placeholder="Optional" value="${esc(edit ? e.note : "")}">
    <label>Date and time</label><input id="tDate" type="datetime-local" value="${dv}">
    <div class="two"><button class="btn ghost" id="x">Cancel</button><button class="btn ${type === "in" ? "grn" : "red"}" id="ok">Save</button></div>`);
  $("x").onclick = closeSheet;
  setTimeout(() => $("tAmount").focus(), 300);
  $("ok").onclick = async () => {
    const amt = parseFloat($("tAmount").value);
    if (!amt || amt <= 0) return toast("Enter a valid amount");
    const data = { amount: amt, type, note: $("tNote").value.trim(), date: $("tDate").value || nowLocal() };
    if (edit) await updateDoc(doc(cashCol(), e.id), data);
    else await addDoc(cashCol(), { ...data, createdAt: serverTimestamp() });
    closeSheet(); toast("Saved");
  };
}
$("cashIn").onclick = () => cashSheet("in");
$("cashOut").onclick = () => cashSheet("out");
$("cashList").onclick = e => {
  const ed = e.target.closest("[data-cedit]"), del = e.target.closest("[data-cdel]");
  if (ed) { const c = cash.find(x => x.id === ed.dataset.cedit); cashSheet(c.type, c); }
  if (del) confirmBox("Delete this entry?", "Delete", async () => {
    await deleteDoc(doc(cashCol(), del.dataset.cdel)); toast("Entry deleted");
  });
};
$("nCash").onclick = openCash;

/* calculator */
function calcSheet() {
  let val = "0", acc = null, op = null, fresh = true;
  const keys = ["C","⌫","÷","×","7","8","9","−","4","5","6","+","1","2","3","=","0",".","00"];
  openSheet(`<h3>Cash Calculator</h3>
    <div class="cdisp"><small id="cx"></small><b id="cd">0</b></div>
    <div class="cg">${keys.map(k => `<button class="${"÷×−+".includes(k) ? "op" : k === "=" ? "eq" : ""}" data-k="${k}">${k}</button>`).join("")}</div>
    <div class="two"><button class="btn ghost" id="x">Close</button></div>`);
  $("x").onclick = closeSheet;
  const upd = () => { $("cd").textContent = val; $("cx").textContent = acc !== null && op ? `${acc} ${op}` : ""; };
  const calc = () => {
    if (op === null || acc === null) return;
    const a = acc, b = parseFloat(val);
    const r = op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : (b === 0 ? 0 : a / b);
    val = String(Math.round(r * 1e8) / 1e8);
  };
  $("sheet").onclick = e => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    const k = b.dataset.k;
    if (k === "C") { val = "0"; acc = null; op = null; fresh = true; }
    else if (k === "⌫") { val = val.length > 1 ? val.slice(0, -1) : "0"; }
    else if ("+−×÷".includes(k)) { if (op !== null && !fresh) calc(); acc = parseFloat(val); op = k; fresh = true; }
    else if (k === "=") { calc(); acc = null; op = null; fresh = true; }
    else if (k === ".") { if (fresh) { val = "0."; fresh = false; } else if (!val.includes(".")) val += "."; }
    else { if (fresh) { val = k === "00" ? "0" : k; fresh = false; } else val = val === "0" ? (k === "00" ? "0" : k) : val + k; }
    upd();
  };
}
$("nCalc").onclick = calcSheet;

/* reminders (bell) */
$("bellBtn").onclick = () => {
  const dues = accounts.filter(a => (a.balance || 0) > 0).sort((x, y) => y.balance - x.balance);
  openSheet(`<h3>🔔 Payment reminders</h3>` + (dues.length ? dues.map(a => `<div class="item" style="margin:8px 0">
    <div class="av" style="background:${color(a.name)}">${esc(initial(a.name))}</div>
    <div class="nm"><b>${esc(a.name)}</b><small class="red">Due ${money(a.balance)}</small></div>
    <button class="btn" data-wa="${a.id}" style="padding:9px 14px;font-size:14px">WhatsApp</button></div>`).join("")
    : `<div class="empty">🎉 No pending dues</div>`) + `<div class="two"><button class="btn ghost" id="x">Close</button></div>`);
  $("x").onclick = closeSheet;
  $("sheet").onclick = e => { const b = e.target.closest("[data-wa]"); if (b) remindAcc(accounts.find(a => a.id === b.dataset.wa)); };
};

/* more options + transfer */
function moreSheet() {
  openSheet(`<h3>More options</h3>
    <button class="mi" data-m="export">📄 Export all customers (CSV)</button>
    <button class="mi" data-m="theme">🌓 Dark / Light mode</button>
    <button class="mi" data-m="backup">☁️ Backup info</button>
    <button class="mi" data-m="logout">⎋ Logout</button>`);
  $("sheet").onclick = e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    const k = b.dataset.m;
    if (k === "export") {
      let csv = "Name,Phone,Category,Balance\n";
      accounts.forEach(a => csv += `"${(a.name || "").replace(/"/g, '""')}",${a.phone || ""},"${(a.category || "").replace(/"/g, '""')}",${a.balance || 0}\n`);
      closeSheet(); download("all-customers.csv", csv);
    }
    if (k === "theme") { toggleTheme(); closeSheet(); }
    if (k === "backup") { closeSheet(); toast("Your data is saved automatically in your Google account's cloud"); }
    if (k === "logout") confirmBox("Logout from your account?", "Logout", () => signOut(auth));
  };
}
$("moreBtn").onclick = moreSheet;
$("nMore").onclick = moreSheet;
$("nTransfer").onclick = () => toast("Transfer is coming soon");
