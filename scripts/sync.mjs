// 구글 드라이브 공개 폴더 → play/{id}.html + site/games.json
// 규칙: docs/01_핵심로직_규칙명세서.md, docs/tasks/동기화_구현.md
// 사용: node scripts/sync.mjs   (외부 패키지 없음, Node 20+)

import { readFile, writeFile, readdir, unlink, mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_DIR = path.join(ROOT, "play");
const INBOX_DIR = path.join(ROOT, "inbox");
const GAMES_JSON = path.join(ROOT, "site", "games.json");
const REPORT_JSON = path.join(ROOT, "sync-report.json"); // 건너뛴 파일 목록 (사이트에는 올리지 않음)

const NAME_RE = /(\d{4})\s*([가-힣][가-힣\s]*[가-힣])\s*\.html$/i;
const ID_RE = /^\d{4}(-\d+)?$/;
const AI_CHAT_HOSTS = ["gemini.google.com", "chatgpt.com", "chat.openai.com", "claude.ai"];
const REASON_AI = "AI 대화 화면 저장본 (게임 파일 아님)";
const HEADERS = { "Accept-Language": "ko", "User-Agent": "Mozilla/5.0" };

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw new Error(`${path.relative(ROOT, file)} 을(를) 읽을 수 없습니다: ${e.message}`);
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// ---------- 1단계: 목록 ----------
async function listFolder(folderId) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`폴더 목록 응답 ${res.status}`);
  const html = await res.text();
  const entries = [];
  const re = /id="entry-([\w-]+)"[\s\S]*?class="flip-entry-title">([^<]*)</g;
  let m;
  while ((m = re.exec(html))) entries.push({ driveId: m[1], sourceName: decodeEntities(m[2]).trim() });
  if (entries.length === 0) throw new Error("폴더에서 항목을 하나도 찾지 못함 (공유 설정 또는 화면 구조 변경 가능성)");
  return entries.filter((e) => /\.html$/i.test(e.sourceName));
}

// ---------- 2단계: 내려받기 ----------
async function download(driveId) {
  let res = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`, { headers: HEADERS });
  let buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  const head = buf ? buf.subarray(0, 4000).toString("utf8") : "";
  if (!buf || head.includes("Google Drive - Virus scan warning")) {
    const uuid = /name="uuid" value="([^"]+)"/.exec(buf ? buf.toString("utf8") : "")?.[1] ?? "";
    res = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t&uuid=${encodeURIComponent(uuid)}`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`내려받기 응답 ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4000).toString("utf8").includes("Google Drive - Virus scan warning")) throw new Error("바이러스 검사 안내를 통과하지 못함");
  }
  return buf;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

// ---------- 3단계: 해석 ----------
function analyze(sourceName, buf) {
  const m = NAME_RE.exec(sourceName);
  if (!m) return { skip: "파일명에서 학번·이름을 찾지 못함" };
  const studentNo = m[1];
  const name = m[2].replace(/\s+/g, "");

  const text = buf.toString("utf8");
  const head = text.slice(0, 2000);
  const lower = text.toLowerCase();
  const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? "";
  let title = decodeEntities(rawTitle).replace(/\s+/g, " ").trim();

  if (buf.length === 0 || !["<html", "<!doctype", "<script", "<canvas", "<body"].some((t) => lower.includes(t))) {
    return { skip: "HTML 파일이 아님" };
  }
  if (head.includes("saved from url=") && AI_CHAT_HOSTS.some((h) => head.includes(h))) return { skip: REASON_AI };
  if (title.endsWith(" - Google Gemini")) return { skip: REASON_AI };

  if (!title) {
    title = sourceName
      .replace(/\.html$/i, "")
      .replace(/\d{4}\s*[가-힣][가-힣\s]*[가-힣]\s*$/, "")
      .replace(/code_artifact|index/gi, "")
      .replace(/\(\d+\)/g, "")
      .replace(/^[\s\-_]+|[\s\-_]+$/g, "")
      .replace(/\s+/g, " ");
  }
  if (!title) title = `${name}의 게임`;
  if ([...title].length > 60) title = [...title].slice(0, 59).join("") + "…";

  return {
    studentNo,
    name,
    title,
    hash: createHash("sha256").update(buf).digest("hex").slice(0, 16),
    size: buf.length,
  };
}

// ---------- 본문 ----------
async function main() {
  const config = await readJson(path.join(ROOT, "sync.config.json"), { folderIds: [] });
  const overrides = await readJson(path.join(ROOT, "overrides.json"), {});
  const prevData = await readJson(GAMES_JSON, { games: [] });
  const prevReport = await readJson(REPORT_JSON, { skipped: [] });
  const prev = Array.isArray(prevData.games) ? prevData.games : [];
  const prevByDrive = new Map(prev.map((g) => [g.driveId, g]));
  const now = new Date().toISOString();

  // 1. 목록 (실패하면 아무것도 건드리지 않고 종료)
  let sources = [];
  try {
    for (const folderId of config.folderIds ?? []) sources.push(...(await listFolder(folderId)));
  } catch (e) {
    console.error(`목록을 읽지 못했습니다: ${e.message}`);
    console.error("아무것도 바꾸지 않고 종료합니다.");
    process.exit(1);
  }
  const seen = new Set();
  sources = sources.filter((s) => !seen.has(s.driveId) && seen.add(s.driveId));

  let inboxNames = [];
  try {
    inboxNames = (await readdir(INBOX_DIR)).filter((n) => /\.html$/i.test(n));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const n of inboxNames) sources.push({ driveId: `local:${n}`, sourceName: n, localPath: path.join(INBOX_DIR, n) });

  // 2~3. 내려받기 + 해석
  const skipped = [];
  const kept = []; // 내려받기 실패했지만 이전 결과를 유지하는 항목
  const cur = [];
  await mapLimit(sources, 4, async (s) => {
    let buf;
    try {
      buf = s.localPath ? await readFile(s.localPath) : await download(s.driveId);
    } catch (e) {
      const old = prevByDrive.get(s.driveId);
      if (old) kept.push(old);
      else skipped.push({ sourceName: s.sourceName, driveId: s.driveId, reason: "내려받기 실패" });
      console.error(`! 내려받기 실패: ${s.sourceName} (${e.message})`);
      return;
    }
    const a = analyze(s.sourceName, buf);
    if (a.skip) skipped.push({ sourceName: s.sourceName, driveId: s.driveId, reason: a.skip });
    else cur.push({ ...s, ...a, buf });
  });
  cur.sort((a, b) => (a.sourceName < b.sourceName ? -1 : a.sourceName > b.sourceName ? 1 : 0));

  // 4. ID 배정
  const presentDriveIds = new Set(sources.map((s) => s.driveId));
  const usedIds = new Set(kept.map((g) => g.id));
  const inherited = new Set();
  const results = [];

  const finish = (c, id, addedAt, old) => {
    usedIds.add(id);
    results.push({
      id,
      studentNo: c.studentNo,
      name: c.name,
      title: c.title,
      file: `${id}.html`,
      driveId: c.driveId,
      sourceName: c.sourceName,
      hash: c.hash,
      size: c.size,
      addedAt,
      updatedAt: old && old.hash === c.hash ? old.updatedAt : now,
      buf: c.buf,
      isNew: !old,
      isChanged: Boolean(old) && old.hash !== c.hash,
    });
  };

  const fresh = [];
  for (const c of cur) {
    const old = prevByDrive.get(c.driveId);
    if (old && ID_RE.test(old.id)) finish(c, old.id, old.addedAt, old);
    else fresh.push(c);
  }
  for (const c of fresh) {
    const candidates = prev
      .filter((g) => g.studentNo === c.studentNo && !presentDriveIds.has(g.driveId) && !inherited.has(g.id) && !usedIds.has(g.id) && ID_RE.test(g.id))
      .sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
    if (candidates.length) {
      const old = candidates[0];
      inherited.add(old.id);
      finish(c, old.id, old.addedAt, old); // 다시 제출: 좋아요 유지
      continue;
    }
    let id = c.studentNo;
    for (let n = 2; usedIds.has(id); n++) id = `${c.studentNo}-${n}`;
    finish(c, id, now, null);
  }

  // overrides
  const games = [];
  for (const g of results) {
    const o = overrides[g.id];
    if (o && typeof o.title === "string" && o.title.trim()) g.title = o.title.trim();
    if (o && o.hide === true) skipped.push({ sourceName: g.sourceName, driveId: g.driveId, reason: "교사가 숨김" });
    else games.push(g);
  }
  for (const g of kept) {
    if (overrides[g.id]?.hide === true) skipped.push({ sourceName: g.sourceName, driveId: g.driveId, reason: "교사가 숨김" });
    else games.push({ ...g, buf: null });
  }

  games.sort((a, b) => a.studentNo.localeCompare(b.studentNo) || a.id.localeCompare(b.id));
  skipped.sort((a, b) => a.sourceName.localeCompare(b.sourceName));

  // 5. 쓰기
  await mkdir(PLAY_DIR, { recursive: true });
  await mkdir(path.dirname(GAMES_JSON), { recursive: true });
  const keepFiles = new Set(["index.html"]);
  for (const g of games) {
    if (!ID_RE.test(g.id)) throw new Error(`잘못된 게임 ID: ${g.id}`);
    keepFiles.add(g.file);
    if (!g.buf) continue;
    const target = path.join(PLAY_DIR, g.file);
    let same = false;
    try {
      same = (await readFile(target)).equals(g.buf);
    } catch {}
    if (!same) await writeFile(target, g.buf);
  }
  const removed = [];
  for (const f of await readdir(PLAY_DIR)) {
    if (/\.html$/i.test(f) && !keepFiles.has(f)) {
      await unlink(path.join(PLAY_DIR, f));
      removed.push(f);
    }
  }

  const clean = games.map(({ buf, isNew, isChanged, ...g }) => g);
  if (JSON.stringify(clean) !== JSON.stringify(prev)) {
    await writeFile(GAMES_JSON, JSON.stringify({ updatedAt: now, games: clean }, null, 2) + "\n");
  }
  if (JSON.stringify(skipped) !== JSON.stringify(prevReport.skipped ?? [])) {
    await writeFile(REPORT_JSON, JSON.stringify({ updatedAt: now, skipped }, null, 2) + "\n");
  }

  // 6. 보고
  const added = games.filter((g) => g.isNew);
  const changed = games.filter((g) => g.isChanged);
  const lines = [`게임 ${games.length}개 (새로 추가 ${added.length}, 내용 변경 ${changed.length}, 삭제 ${removed.length})`];
  for (const g of added) lines.push(`+ ${g.id} ${g.name} — ${g.title}`);
  for (const g of changed) lines.push(`~ ${g.id} ${g.name} — ${g.title}`);
  for (const f of removed) lines.push(`- ${f}`);
  if (skipped.length) {
    lines.push(`건너뜀 ${skipped.length}개`);
    for (const s of skipped) lines.push(`! ${s.sourceName} — ${s.reason}`);
  }
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, "```\n" + lines.join("\n") + "\n```\n");
  }
}

main().catch((e) => {
  console.error(`동기화 실패: ${e.message}`);
  process.exit(1);
});
