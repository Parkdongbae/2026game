// F9 관리자 창 (게임 갤러리·웹앱 스토어 공용 — 두 저장소에 같은 파일이 있음)
//  - F9 (또는 주소 끝 #admin) → 관리자 구글 계정 로그인 → 관리자 창
//  - ⚡ 바로 반영 / 📝 파일 이름 규칙 / 📂 올라가지 않은 파일(학번·이름 정해 게시, 목록에서 지우기) / 목록(이름 바꾸기·삭제·되살리기)
//  - 관리자 명단: Firestore 비공개 문서 socialConfig/admins 의 emails (사회과 탐험관과 공용)
//  - 수정값 저장: Firestore {docPath} 의 json 필드 → 화면에 즉시 반영, 다음 동기화 때 games.json 에도 반영
//  - 바로 반영: ./api/admin (서버가 관리자 확인 후 GitHub Actions 실행)

const CHECK = ["socialAdminCheck", "ping"];

export async function isAdmin(fb) {
  if (!fb?.auth?.currentUser) return false;
  try { await fb.api.getDoc(fb.api.doc(fb.db, ...CHECK)); return true; } catch { return false; }
}

export async function loadOverrides(fb, docPath) {
  try {
    const snap = await fb.api.getDoc(fb.api.doc(fb.db, ...docPath));
    const text = snap.exists() ? snap.data().json : "";
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn("관리자 수정값 읽기 실패", e);
    return {};
  }
}

// 수정값 적용: 숨긴 것은 빼고, 제목·이름·학번·분류·설명은 바꾼 값으로
export function applyOverrides(items, o, categories) {
  return items.filter((g) => o[g.id]?.hide !== true).map((g) => {
    const v = o[g.id];
    if (!v) return g;
    const n = { ...g };
    if (typeof v.title === "string" && v.title.trim()) n.title = v.title.trim();
    if (typeof v.desc === "string") n.desc = v.desc.trim();
    if (typeof v.name === "string" && v.name.trim()) n.name = v.name.trim();
    if (/^\d{4}$/.test(String(v.studentNo ?? ""))) n.studentNo = String(v.studentNo);
    if (categories && categories[v.category]) n.category = v.category;
    return n;
  });
}
export function visibleRejected(rejected, o) {
  return rejected.filter((r) => !r.driveId || (o[`drive:${r.driveId}`]?.ignore !== true && !o[`drive:${r.driveId}`]?.studentNo));
}

const CSS = `
#admDlg{border:0;padding:0;border-radius:20px;background:#fffdf8;color:#1f2937;box-shadow:0 30px 80px rgba(0,0,0,.45);width:min(940px,calc(100vw - 24px));max-height:calc(100vh - 32px);font-family:system-ui,"Pretendard","Malgun Gothic",sans-serif;line-height:1.45}
#admDlg::backdrop{background:rgba(10,10,20,.55)}
#admDlg .hd{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 18px;background:#fffdf8;border-bottom:1px solid #e7e1d4}
#admDlg .hd h2{margin:0;font-size:1.12rem;font-weight:900;color:#1e293b;flex:1}
#admDlg .who{color:#64748b;font-size:.85rem}
#admDlg .x{border:0;background:#efe9dc;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:1.05rem;font-weight:900}
#admDlg .bd{padding:14px 18px 22px}
#admDlg section{margin-bottom:20px}
#admDlg h3{margin:0 0 8px;font-size:1rem;font-weight:900;color:#1e293b}
#admDlg .box{padding:12px;border-radius:12px;background:#fff;border:1px solid #e7e1d4}
#admDlg .sync{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
#admDlg .status{font-weight:700;color:#64748b;font-size:.9rem}
#admDlg .muted{color:#64748b;font-size:.86rem;margin:6px 0 0}
#admDlg .primary{border:0;cursor:pointer;min-height:42px;padding:0 18px;border-radius:12px;background:#e11d74;color:#fff;font-weight:900}
#admDlg .primary:disabled{opacity:.55;cursor:default}
#admDlg .secondary{border:1px solid #d9d2c3;cursor:pointer;min-height:34px;padding:0 12px;border-radius:9px;background:#fff;font-weight:800;color:#1f2937;text-decoration:none;display:inline-flex;align-items:center}
#admDlg .danger{color:#b42318}
#admDlg ul.rules{margin:0;padding-left:20px;font-size:.92rem}
#admDlg ul.rules li{margin:4px 0}
#admDlg code{padding:1px 6px;border-radius:6px;background:#f3ead8;font-size:.9em}
#admDlg table{width:100%;border-collapse:collapse;font-size:.9rem}
#admDlg th{text-align:left;color:#64748b;font-weight:800;font-size:.8rem;padding:6px 4px;border-bottom:1px solid #e7e1d4}
#admDlg td{padding:5px 4px;border-bottom:1px solid #f1ebdd;vertical-align:middle}
#admDlg input,#admDlg select{width:100%;min-height:34px;padding:0 8px;border:1px solid #d9d2c3;border-radius:8px;background:#fff;color:#1f2937;font:inherit}
#admDlg .no{width:68px}#admDlg .nm{width:90px}
#admDlg .act{white-space:nowrap;display:flex;gap:6px}
#admDlg tr.hid td{opacity:.55}
#admDlg .tag{display:inline-block;margin-left:4px;padding:1px 8px;border-radius:999px;background:#eee;font-size:.75rem;font-weight:800}
#admDlg .scroll{overflow-x:auto}
#admDlg .rej{display:grid;gap:8px}
#admDlg .rej .r{display:grid;grid-template-columns:1fr 76px 96px auto;gap:6px;align-items:center;padding:10px;border-radius:12px;background:#fff;border:1px solid #e7e1d4}
#admDlg .rej .src{font-weight:800;overflow-wrap:anywhere;font-size:.88rem}
#admDlg .rej .src small{display:block;color:#64748b;font-weight:600}
@media (max-width:700px){#admDlg .rej .r{grid-template-columns:1fr 1fr}#admDlg .rej .src{grid-column:1/-1}}
`;

export function initAdminPanel(opt) {
  const { fb, docPath, itemName = "게임", categories = null, toast = (m) => alert(m), onChange = () => {} } = opt;
  const playBase = String(opt.playBase || "./");
  const st = { overrides: {}, games: [], hidden: [], rejected: [], dataUpdatedAt: "" };

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const dlg = document.createElement("dialog");
  dlg.id = "admDlg";
  dlg.innerHTML = `<div class="hd"><h2>🛠️ 관리자 창</h2><span class="who"></span><button class="x" type="button" aria-label="닫기">✕</button></div><div class="bd"></div>`;
  document.body.append(dlg);
  const body = dlg.querySelector(".bd");
  dlg.querySelector(".x").addEventListener("click", () => dlg.close());

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const catOf = (g) => (categories && categories[g.category] ? g.category : "etc");

  async function loadData() {
    const res = await fetch(`./games.json?t=${Date.now()}`, { cache: "no-store" });
    const d = res.ok ? await res.json() : {};
    const tidy = (g) => ({ ...g, title: String(g.title || ""), name: String(g.name || ""), studentNo: String(g.studentNo || ""), category: String(g.category || "etc") });
    st.dataUpdatedAt = String(d.updatedAt || "");
    st.games = (d.games || []).filter((g) => g && g.id).map(tidy);
    st.hidden = (d.hidden || []).filter((g) => g && g.id).map(tidy);
    st.rejected = (d.rejected || []).filter((r) => r && r.who);
    st.overrides = await loadOverrides(fb, docPath);
  }

  async function login() {
    const p = new fb.api.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await fb.api.signInWithPopup(fb.auth, p); return true; }
    catch (e) { if (e.code === "auth/popup-blocked") toast("팝업을 허용한 뒤 다시 눌러 주세요"); return false; }
  }

  async function open() {
    if (opt.preview) {
      dlg.querySelector(".who").textContent = "미리보기 (저장 안 됨)";
    } else {
      if (!fb.auth.currentUser && !(await login())) return;
      if (!(await isAdmin(fb))) { toast("관리자 계정이 아니에요. 관리자 계정으로 다시 로그인해 주세요"); return; }
      dlg.querySelector(".who").textContent = fb.auth.currentUser.email;
    }
    await loadData();
    render();
    if (!dlg.open) dlg.showModal();
    refreshStatus();
  }

  async function api(method, payload) {
    const token = await fb.auth.currentUser.getIdToken();
    const res = await fetch("./api/admin", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
    return data;
  }

  async function save(next, msg) {
    try {
      await fb.api.setDoc(fb.api.doc(fb.db, ...docPath), {
        json: JSON.stringify(next), updatedAt: fb.api.serverTimestamp(), updatedBy: fb.auth.currentUser.displayName || "관리자",
      });
      st.overrides = next;
      onChange(next);
      render();
      if (msg) toast(msg);
    } catch (e) { console.warn(e); toast("저장하지 못했어요 (관리자 권한·보안 규칙 확인)"); }
  }
  function edit(key, patch, msg) {
    const next = structuredClone(st.overrides);
    const cur = { ...(next[key] || {}), ...patch };
    for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === "") delete cur[k];
    if (Object.keys(cur).length) next[key] = cur; else delete next[key];
    return save(next, msg);
  }

  let timer = null, requested = false, waiting = false;
  const statusEl = () => body.querySelector("#admSyncStatus");
  async function refreshStatus() {
    const s = statusEl();
    if (!s) return;
    try {
      const { runs } = await api("GET");
      const r = runs[0];
      if (!r) { s.textContent = "아직 실행 기록이 없어요"; return; }
      const when = new Date(r.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      const how = r.event === "workflow_dispatch" ? "바로 반영" : r.event === "schedule" ? "자동" : "변경";
      if (r.status !== "completed") { s.textContent = `⏳ ${when} ${how} 실행 중… (보통 1분 안팎)`; clearTimeout(timer); timer = setTimeout(refreshStatus, 5000); return; }
      if (r.conclusion !== "success") { s.textContent = `⚠️ ${when} ${how} 실패 (${r.conclusion}) — 다시 눌러 보세요`; return; }
      if (requested) { requested = false; s.textContent = `⏳ ${when} 드라이브 확인 완료 — 새 목록을 사이트에 올리는 중…`; waitForData(); }
      else if (!waiting) s.textContent = `✅ ${when} ${how} 완료`;
    } catch (e) { s.textContent = `상태를 확인하지 못했어요: ${e.message}`; }
  }
  async function waitForData() {
    if (waiting) return;
    waiting = true;
    const before = st.dataUpdatedAt;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 7500));
      try {
        const d = await (await fetch(`./games.json?t=${Date.now()}`, { cache: "no-store" })).json();
        if (String(d.updatedAt || "") !== before) { toast("새 목록을 불러왔어요"); location.hash = "admin"; location.reload(); return; }
        const s = statusEl(); if (s && i > 0) s.textContent = `⏳ 새 목록을 사이트에 올리는 중… (${Math.round((i + 1) * 7.5)}초)`;
      } catch {}
    }
    waiting = false;
    const s = statusEl(); if (s) s.textContent = "✅ 반영 완료 — 바뀐 파일이 없었거나 아직 올리는 중이에요. 잠시 뒤 새로고침해 보세요";
  }

  function render() {
    const o = st.overrides;
    const sec = (title, ...kids) => { const s = el("section"); s.append(el("h3", null, title), ...kids); return s; };

    // 1) 바로 반영
    const syncBox = el("div", "box sync");
    const btn = el("button", "primary", "⚡ 바로 반영"); btn.type = "button";
    const status = el("span", "status", "상태 확인 중…"); status.id = "admSyncStatus";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try { await api("POST", { op: "sync" }); requested = true; status.textContent = "⏳ 드라이브 폴더를 확인하라고 요청했어요…"; toast("드라이브 폴더를 지금 확인하고 있어요"); setTimeout(refreshStatus, 4000); }
      catch (e) { toast(e.message); }
      finally { setTimeout(() => { btn.disabled = false; }, 4000); }
    });
    syncBox.append(btn, status, el("p", "muted", `학생이 제출 폴더에 새로 올린 파일을 지금 바로 가져옵니다(1~2분). 끝나면 화면이 저절로 새 목록을 보여 줘요. 파일을 막 올렸다면 1분쯤 기다린 뒤 누르세요. 아래 이름 바꾸기·삭제는 누르는 즉시 반영됩니다.`));

    // 2) 파일 이름 규칙
    const rules = el("ul", "rules");
    const li = (...parts) => { const l = el("li"); parts.forEach((p) => l.append(typeof p === "string" ? document.createTextNode(p) : p)); return l; };
    const code = (t) => el("code", null, t);
    rules.append(
      li("파일 이름 끝이 ", code("학번이름.html"), " 이어야 올라갑니다. 예) ", code(`내${itemName} - 3115홍길동.html`)),
      li("학번은 4자리(학년 1 + 반 1 + 번호 2). 이름 사이 띄어쓰기는 괜찮아요. 예) ", code("3108염 성 빈.html"), " → 3108 염성빈"),
      li("구글 설문으로 내면 파일 이름 뒤에 ", code(" - 응답자이름"), "이 붙으므로, 계정 이름이 '학번이름'이면 자동으로 맞춰집니다."),
      li(`AI와 대화한 화면을 통째로 저장한 파일(제목에 'Google Gemini' 등)은 ${itemName}이 아니라서 올라가지 않아요.`),
      li("고친 버전을 다시 내면 새 파일만 보이고 좋아요는 그대로 유지돼요. 서로 다른 것은 여러 개 내도 됩니다(", code("3115-2"), " …)."),
      li("규칙에 안 맞는 파일은 아래 '올라가지 않은 파일'에서 학번·이름을 직접 정해 주면 올릴 수 있어요."),
    );
    const rulesBox = el("div", "box"); rulesBox.append(rules);

    // 3) 올라가지 않은 파일
    const rejBox = el("div", "rej");
    const pending = st.rejected.filter((r) => r.driveId && o[`drive:${r.driveId}`]?.ignore !== true);
    if (!pending.length) rejBox.append(el("p", "muted", "올라가지 않은 파일이 없어요."));
    for (const r of pending) {
      const ov = o[`drive:${r.driveId}`] || {};
      const row = el("div", "r");
      const src = el("div", "src", r.sourceName || r.who);
      src.append(el("small", null, ov.studentNo ? `게시 예정: ${ov.studentNo} ${ov.name} ('바로 반영'을 누르면 올라가요)` : r.reason));
      const no = el("input"); no.placeholder = "학번"; no.inputMode = "numeric"; no.maxLength = 4; no.value = ov.studentNo || "";
      const nm = el("input"); nm.placeholder = "이름"; nm.maxLength = 10; nm.value = ov.name || "";
      const act = el("div", "act");
      const pub = el("button", "secondary", "게시하기"); pub.type = "button";
      pub.addEventListener("click", () => {
        if (!/^\d{4}$/.test(no.value.trim()) || !nm.value.trim()) { toast("학번 4자리와 이름을 적어 주세요"); return; }
        edit(`drive:${r.driveId}`, { studentNo: no.value.trim(), name: nm.value.trim().replace(/\s+/g, ""), ignore: undefined }, "저장했어요. '바로 반영'을 누르면 올라가요");
      });
      const ign = el("button", "secondary danger", "목록에서 지우기"); ign.type = "button";
      ign.addEventListener("click", () => edit(`drive:${r.driveId}`, { ignore: true }, "'다시 제출' 목록에서 지웠어요"));
      act.append(pub, ign);
      row.append(src, no, nm, act);
      rejBox.append(row);
    }
    const ignored = st.rejected.filter((r) => r.driveId && o[`drive:${r.driveId}`]?.ignore === true);
    if (ignored.length) {
      const p = el("p", "muted", `목록에서 지운 파일 ${ignored.length}개 — `);
      const undo = el("button", "secondary", "모두 다시 보이기"); undo.type = "button";
      undo.addEventListener("click", () => {
        const next = structuredClone(o);
        ignored.forEach((r) => { const k = `drive:${r.driveId}`; if (next[k]) { delete next[k].ignore; if (!Object.keys(next[k]).length) delete next[k]; } });
        save(next, "다시 보이게 했어요");
      });
      p.append(undo); rejBox.append(p);
    }

    // 4) 목록: 이름 바꾸기·삭제(내리기)·되살리기
    const table = el("table");
    const hr = el("tr");
    ["학번", "이름", "제목", ...(categories ? ["분류"] : []), ""].forEach((t) => hr.append(el("th", null, t)));
    const thead = el("thead"); thead.append(hr); table.append(thead);
    const tbody = el("tbody");
    const all = [...st.games.map((g) => ({ g, hidden: o[g.id]?.hide === true })), ...st.hidden.map((g) => ({ g, hidden: true }))]
      .sort((a, b) => a.g.studentNo.localeCompare(b.g.studentNo) || a.g.id.localeCompare(b.g.id));
    if (!all.length) { const tr = el("tr"); const td = el("td", "muted", `아직 올라온 ${itemName}이 없어요.`); td.colSpan = 5; tr.append(td); tbody.append(tr); }
    for (const { g, hidden } of all) {
      const v = o[g.id] || {};
      const tr = el("tr"); if (hidden) tr.className = "hid";
      const no = el("input", "no"); no.value = v.studentNo || g.studentNo; no.maxLength = 4; no.inputMode = "numeric";
      const nm = el("input", "nm"); nm.value = v.name || g.name; nm.maxLength = 10;
      const ti = el("input"); ti.value = v.title || g.title; ti.maxLength = 60;
      let ca = null;
      if (categories) {
        ca = el("select");
        for (const [k, c] of Object.entries(categories)) { const op = el("option", null, `${c.emoji} ${c.label}`); op.value = k; ca.append(op); }
        ca.value = categories[v.category] ? v.category : catOf(g);
      }
      const act = el("td", "act");
      const sv = el("button", "secondary", "저장"); sv.type = "button";
      sv.addEventListener("click", () => {
        if (!/^\d{4}$/.test(no.value.trim())) { toast("학번은 4자리 숫자예요"); return; }
        edit(g.id, {
          studentNo: no.value.trim() !== g.studentNo ? no.value.trim() : undefined,
          name: nm.value.trim() && nm.value.trim() !== g.name ? nm.value.trim() : undefined,
          title: ti.value.trim() && ti.value.trim() !== g.title ? ti.value.trim() : undefined,
          category: ca && ca.value !== g.category ? ca.value : undefined,
        }, "바꿨어요. 화면에 바로 반영됐어요");
      });
      const tog = el("button", hidden ? "secondary" : "secondary danger", hidden ? "되살리기" : "삭제"); tog.type = "button";
      tog.addEventListener("click", () => {
        if (!hidden && !confirm(`'${g.title}'을(를) 내릴까요?\n(드라이브 파일과 좋아요 기록은 그대로 남고, 언제든 되살릴 수 있어요)`)) return;
        edit(g.id, { hide: hidden ? undefined : true }, hidden ? "되살렸어요. 파일이 다시 보이려면 '바로 반영'을 눌러 주세요" : "내렸어요");
      });
      act.append(sv, tog);
      if (!hidden) { const a = el("a", "secondary", "열기"); a.href = playBase + (g.file || `${g.id}.html`); a.target = "_blank"; a.rel = "noopener noreferrer"; act.append(a); }
      const cell = (x) => { const td = el("td"); td.append(x); return td; };
      const tiCell = cell(ti); if (hidden) tiCell.append(el("span", "tag", "내림"));
      tr.append(cell(no), cell(nm), tiCell, ...(ca ? [cell(ca)] : []), act);
      tbody.append(tr);
    }
    table.append(tbody);
    const scroll = el("div", "scroll"); scroll.append(table);

    body.replaceChildren(
      sec("⚡ 바로 반영", syncBox),
      sec("📝 파일 이름 규칙 (학생 안내용)", rulesBox),
      sec(`📂 올라가지 않은 파일 (${pending.length})`, rejBox),
      sec(`🗂️ ${itemName} 목록 — 이름 바꾸기·삭제 (${all.length})`, scroll),
    );
  }

  document.addEventListener("keydown", (e) => { if (e.key === "F9") { e.preventDefault(); open(); } });
  if (location.hash === "#admin" || (opt.preview && location.hash === "#admin-preview")) setTimeout(open, 600);
  return { open };
}
