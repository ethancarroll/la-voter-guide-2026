/* Non-partisan LA Voter Guide — multi-election.
 * Vanilla JS single-page app. Loads data/elections.json, then one ballot file per
 * election. Hash routes:
 *   #/                       election list
 *   #/e/<id>                 election intro
 *   #/e/<id>/c/<n>           contest n (1-based, ballot order)
 *   #/e/<id>/list            jump-to-contest list
 *   #/e/<id>/summary[?p=..]  summary (p = shared picks)
 * Picks persist per election in localStorage ("voterGuide.picks.<id>").
 */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const progressBar = document.getElementById("progressBar");
  const progressCount = document.getElementById("progressCount");

  let elections = [];
  const ballots = {};      // id -> ballot json
  let cur = null;          // { election, ballot, contests, picks }

  // ---------- storage ----------
  const keyFor = (id) => `voterGuide.picks.${id}`;
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function migrateLegacy() {
    elections.forEach(e => {
      if (!e.legacyStorageKey) return;
      const legacy = readJSON(e.legacyStorageKey);
      if (legacy && !readJSON(keyFor(e.id))) writeJSON(keyFor(e.id), legacy);
    });
  }
  const loadPicks = (id) => readJSON(keyFor(id)) || {};
  function savePicks() { writeJSON(keyFor(cur.election.id), cur.picks); }

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const PARTY = { "Democratic": "DEM", "Republican": "REP", "Green": "GRN", "Peace and Freedom": "P&F",
    "Libertarian": "LIB", "None": "NPP", "No Party Preference": "NPP" };
  const partyAbbr = (p) => PARTY[p] || p;
  const isYes = (v) => /^yes/i.test(v || "");
  const isNo = (v) => /^no\b/i.test(v || "");
  const WRITE_IN = "Write-in: ";

  function contestTitle(c) {
    if (c.type === "measure") return c.letter ? `Measure ${c.letter}` : (c.title || c.office);
    if (c.type === "retention") return `Retain ${c.justice}?`;
    return c.office || c.title;
  }
  function contestSub(c) {
    if (c.type === "measure") return c.letter ? c.title : (c.subtitle || "");
    if (c.type === "retention") return c.office;
    return c.subtitle || "";
  }
  // options of a measure: new data uses strings, primary data uses {label, blurb, sources}
  const measureOptions = (c) => (c.options || []).map(o => typeof o === "string" ? { label: o } : o);

  // what to actually fill in on paper
  function bubbleText(c, pick) {
    if (pick == null) return null;
    if (pick.startsWith(WRITE_IN)) return `Write-In Candidate → write “${pick.slice(WRITE_IN.length)}”`;
    if (c.type === "candidate") {
      const cand = c.candidates.find(x => x.name === pick);
      return cand && cand.ballotName ? cand.ballotName : pick;
    }
    if (c.type === "retention") return `${pick} — ${c.justice}`;
    return pick;
  }
  const decidedCount = () => cur.contests.filter(c => cur.picks[c.id] !== undefined).length;

  function fmtPage(c) {
    const parts = [];
    if (c.page) parts.push(`Page ${c.page}${cur.ballot.meta.pages ? ` of ${cur.ballot.meta.pages}` : ""}`);
    if (c.column) parts.push(`Column ${c.column}`);
    return parts.join(" · ");
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return "";
    return `<details class="sources"><summary>Sources (${sources.length})</summary><ul>${
      sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join("")
    }</ul></details>`;
  }
  const listHtml = (items) => items && items.length ? `<ul class="bullets">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "";

  // ---------- chrome ----------
  function setTopbar(show) {
    topbar.hidden = !show;
    if (show && cur) {
      $("#electionBtn").textContent = `${cur.election.title} · ${shortDate(cur.election)}`;
      updateProgress();
    }
  }
  function shortDate(e) {
    const d = new Date(e.date + "T12:00:00");
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  function updateProgress() {
    const total = cur.contests.length, n = decidedCount();
    progressBar.style.width = (total ? Math.round(n / total * 100) : 0) + "%";
    progressCount.textContent = `${n}/${total}`;
  }
  function swap(node) {
    app.innerHTML = "";
    app.appendChild(node);
    window.scrollTo(0, 0);
  }

  // ---------- views: home ----------
  function renderHome() {
    cur = null;
    setTopbar(false);
    const today = new Date().toISOString().slice(0, 10);
    const node = h(`<section class="home">
      <div class="hero card">
        <div class="badge">Non-partisan · Saves your picks</div>
        <h1>LA Voter Guide</h1>
        <p class="lead">Read neutral, sourced summaries of every contest on your Los Angeles ballot — the pros and cons of each measure, what each candidate says they stand for, and what their opponents say about them. Make your picks, then use the summary to fill in your paper ballot.</p>
      </div>
      <h2 class="section-h">Your elections</h2>
      <div class="elections"></div>
      <p class="fineprint">Picks are stored only in this browser on this device. Use “Share my picks” on a summary page to move them to another device.</p>
    </section>`);
    const list = $(".elections", node);
    elections.forEach(e => {
      const picks = loadPicks(e.id);
      const n = Object.keys(picks).length;
      const upcoming = e.date >= today;
      const card = h(`<article class="ecard card ${upcoming ? "is-upcoming" : "is-past"}">
        <div class="ecard__top">
          <span class="chip ${upcoming ? "chip--up" : ""}">${upcoming ? "Upcoming" : "Past election"}</span>
          <span class="ecard__date">${esc(e.dateLabel)}</span>
        </div>
        <h3>${esc(e.title)}</h3>
        <p class="ecard__place">${esc(e.place)}</p>
        <p class="ecard__progress">${n ? `You've made ${n} pick${n === 1 ? "" : "s"}.` : "No picks yet."}</p>
        <div class="ecard__actions">
          <a class="btn btn--primary" href="#/e/${e.id}">${n ? (upcoming ? "Continue" : "Review") : "Start"} →</a>
          ${n ? `<a class="btn btn--ghost" href="#/e/${e.id}/summary">My summary</a>` : ""}
        </div>
      </article>`);
      list.appendChild(card);
    });
    swap(node);
  }

  // ---------- views: election intro ----------
  function renderIntro() {
    setTopbar(true);
    const m = cur.ballot.meta, n = decidedCount(), total = cur.contests.length;
    const counts = cur.contests.reduce((a, c) => (a[c.type] = (a[c.type] || 0) + 1, a), {});
    const node = h(`<section class="intro card">
      <div class="badge">${esc(m.jurisdiction)}</div>
      <h1>${esc(cur.election.title)}</h1>
      <p class="lead">${esc(m.date)}</p>
      <ul class="facts">
        <li><strong>${total}</strong> contests</li>
        ${counts.candidate ? `<li><strong>${counts.candidate}</strong> candidate races</li>` : ""}
        ${counts.measure ? `<li><strong>${counts.measure}</strong> measures</li>` : ""}
        ${counts.retention ? `<li><strong>${counts.retention}</strong> judge retention votes</li>` : ""}
      </ul>
      ${m.ballotNote ? `<p class="note">${esc(m.ballotNote)}</p>` : ""}
      <div class="disclaimer">${m.disclaimer}</div>
      <div class="actions">
        ${n ? `<a class="btn btn--primary" href="#/e/${cur.election.id}/c/${firstUndecided() + 1}">Resume (${n}/${total} decided) →</a>` : `<a class="btn btn--primary" href="#/e/${cur.election.id}/c/1">Start at the top →</a>`}
        <a class="btn btn--ghost" href="#/e/${cur.election.id}/list">Jump to a contest</a>
        ${n ? `<a class="btn btn--ghost" href="#/e/${cur.election.id}/summary">My summary</a>` : ""}
      </div>
    </section>`);
    swap(node);
  }
  function firstUndecided() {
    const i = cur.contests.findIndex(c => cur.picks[c.id] === undefined);
    return i === -1 ? 0 : i;
  }

  // ---------- views: jump list ----------
  function renderList() {
    setTopbar(true);
    const node = h(`<section class="jump"><h1>All contests</h1><div class="jump__list"></div></section>`);
    const list = $(".jump__list", node);
    let page = null;
    cur.contests.forEach((c, i) => {
      if (c.page !== page) {
        page = c.page;
        list.appendChild(h(`<div class="page-h">Ballot page ${c.page}</div>`));
      }
      const pick = cur.picks[c.id];
      const state = pick === undefined ? "" : pick === null ? "skipped" : "decided";
      list.appendChild(h(`<a class="jrow ${state ? "is-" + state : ""}" href="#/e/${cur.election.id}/c/${i + 1}">
        <span class="jrow__n">${i + 1}</span>
        <span class="jrow__t">${esc(contestTitle(c))}<small>${esc(contestSub(c))}</small></span>
        <span class="jrow__s">${state === "decided" ? "✓" : state === "skipped" ? "–" : ""}</span>
      </a>`));
    });
    swap(node);
  }

  // ---------- views: contest ----------
  function renderContest(idx) {
    setTopbar(true);
    const c = cur.contests[idx];
    const eid = cur.election.id;
    const node = h(`<section class="contest">
      <div class="contest__head card">
        <div class="chips">
          <span class="chip">${esc(c.section || (c.type === "measure" ? "Measure" : "Contest"))}</span>
          ${c.page ? `<span class="chip chip--ghost">${esc(fmtPage(c))}</span>` : ""}
          <span class="chip chip--ghost">${c.type === "candidate" ? `Vote for ${c.voteFor || 1}` : "Yes / No"}</span>
        </div>
        <p class="contest__count">Contest ${idx + 1} of ${cur.contests.length}</p>
        <h1>${esc(contestTitle(c))}</h1>
        ${contestSub(c) ? `<p class="contest__sub">${esc(contestSub(c))}</p>` : ""}
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
        ${c.about ? `<details class="about"><summary>What does this office do?</summary><p>${esc(c.about)}</p></details>` : ""}
      </div>
      <div class="contest__body"></div>
      <nav class="contest__nav">
        <a class="btn btn--ghost" ${idx === 0 ? 'aria-disabled="true"' : `href="#/e/${eid}/c/${idx}"`}>← Prev</a>
        <button class="btn btn--link" id="skipBtn">${cur.picks[c.id] === undefined ? "Skip" : "Clear pick"}</button>
        <a class="btn btn--primary" href="#/e/${eid}/${idx === cur.contests.length - 1 ? "summary" : "c/" + (idx + 2)}">${idx === cur.contests.length - 1 ? "Finish →" : "Next →"}</a>
      </nav>
    </section>`);
    const body = $(".contest__body", node);
    if (c.type === "measure") renderMeasure(c, body);
    else if (c.type === "retention") renderRetention(c, body);
    else renderCandidates(c, body);

    $("#skipBtn", node).onclick = () => {
      if (cur.picks[c.id] === undefined) {
        cur.picks[c.id] = null; savePicks();
        location.hash = `#/e/${eid}/${idx === cur.contests.length - 1 ? "summary" : "c/" + (idx + 2)}`;
      } else {
        delete cur.picks[c.id]; savePicks(); renderContest(idx);
      }
    };
    swap(node);
  }

  function choose(c, value, root) {
    cur.picks[c.id] = value;
    savePicks();
    updateProgress();
    root.querySelectorAll("[data-value]").forEach(el => {
      const on = el.dataset.value === value;
      el.classList.toggle("is-selected", on);
      const input = el.querySelector("input[type=radio]");
      if (input) input.checked = on;
    });
    const sk = document.getElementById("skipBtn");
    if (sk) sk.textContent = "Clear pick";
  }

  function renderCandidates(c, body) {
    const pick = cur.picks[c.id];
    const list = h(`<div class="cands" role="radiogroup" aria-label="${esc(c.office)}"></div>`);
    const cands = c.candidates.slice();
    if (cands.length > 8) {
      // long primary lists: filter + notable first
      const tools = h(`<div class="tools card">
        <input type="search" placeholder="Filter by name, party or occupation…" aria-label="Filter candidates">
        <label class="toggle"><input type="checkbox" checked> Notable candidates first</label></div>`);
      const q = $("input[type=search]", tools), major = $("input[type=checkbox]", tools);
      const rerender = () => {
        const term = q.value.trim().toLowerCase();
        let arr = cands.filter(x => !term || `${x.name} ${x.party || ""} ${x.ballotOccupation || ""}`.toLowerCase().includes(term));
        if (major.checked) arr = arr.slice().sort((a, b) => (b.tier === "major") - (a.tier === "major"));
        list.innerHTML = "";
        arr.forEach(x => list.appendChild(candidateCard(c, x)));
        if (!arr.length) list.appendChild(h(`<p class="empty">No candidates match.</p>`));
      };
      q.oninput = rerender; major.onchange = rerender;
      body.appendChild(tools);
      body.appendChild(list);
      rerender();
    } else {
      cands.forEach(x => list.appendChild(candidateCard(c, x)));
      body.appendChild(list);
    }
    if (c.writeIn) {
      const w = pick && pick.startsWith(WRITE_IN) ? pick.slice(WRITE_IN.length) : "";
      const card = h(`<div class="cand cand--writein ${w ? "is-selected" : ""}" data-value="${esc(w ? pick : "__writein")}">
        <label class="cand__pick"><input type="radio" name="pick-${esc(c.id)}" ${w ? "checked" : ""}>
          <span class="cand__name">Write-in candidate</span></label>
        <input type="text" class="writein" placeholder="Qualified write-in name" value="${esc(w)}" aria-label="Write-in name">
        <p class="fineprint">Only votes for qualified write-in candidates count — the list is posted at lavote.gov 11 days before the election.</p>
      </div>`);
      const txt = $(".writein", card), radio = $("input[type=radio]", card);
      const commit = () => {
        const v = txt.value.trim();
        if (!v) return;
        card.dataset.value = WRITE_IN + v;
        choose(c, WRITE_IN + v, body);
      };
      txt.addEventListener("change", commit);
      radio.addEventListener("change", () => txt.value.trim() ? commit() : txt.focus());
      body.appendChild(card);
    }
  }

  function candidateCard(c, x) {
    const sel = cur.picks[c.id] === x.name;
    const minorNote = (!x.stands || !x.stands.length) && !x.blurb && !x.background
      ? `<p class="fineprint">Little independent coverage found — only ballot-listed facts are shown.</p>` : "";
    const card = h(`<div class="cand ${sel ? "is-selected" : ""}" data-value="${esc(x.name)}">
      <label class="cand__pick">
        <input type="radio" name="pick-${esc(c.id)}" ${sel ? "checked" : ""}>
        <span class="cand__name">${esc(x.name)}</span>
        ${x.party ? `<span class="party" data-p="${esc(partyAbbr(x.party))}">${esc(partyAbbr(x.party))}</span>` : ""}
        ${x.incumbent ? `<span class="chip chip--inc">Incumbent</span>` : ""}
        ${x.ballotOccupation ? `<span class="cand__occ">${esc(x.ballotOccupation)}</span>` : ""}
      </label>
      ${x.background ? `<p class="cand__bg">${esc(x.background)}</p>` : ""}
      ${x.blurb ? `<p class="cand__bg">${esc(x.blurb)}</p>` : ""}
      ${x.stands && x.stands.length ? `<details class="block block--for" open><summary>What they say they stand for</summary>${listHtml(x.stands)}</details>` : ""}
      ${x.criticisms && x.criticisms.length ? `<details class="block block--against" open><summary>What opponents & critics say</summary>${listHtml(x.criticisms)}</details>` : ""}
      ${x.endorsements ? `<p class="cand__endorse"><strong>Endorsements:</strong> ${esc(x.endorsements)}</p>` : ""}
      ${minorNote}
      ${sourcesHtml(x.sources)}
    </div>`);
    $("input", card).addEventListener("change", () => choose(c, x.name, card.parentElement.parentElement));
    return card;
  }

  function choiceButtons(c, options, body, labelFn) {
    const pick = cur.picks[c.id];
    const wrap = h(`<div class="choices" role="radiogroup"></div>`);
    options.forEach(o => {
      const v = o.label;
      const b = h(`<label class="choice ${isYes(v) ? "is-yes" : isNo(v) ? "is-no" : ""} ${pick === v ? "is-selected" : ""}" data-value="${esc(v)}">
        <input type="radio" name="pick-${esc(c.id)}" ${pick === v ? "checked" : ""}>
        <span>${esc(labelFn ? labelFn(v) : v)}</span></label>`);
      $("input", b).addEventListener("change", () => choose(c, v, body));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function renderMeasure(c, body) {
    const opts = measureOptions(c);
    if (c.currentLaw || c.pros) {
      body.appendChild(h(`<div class="measure">
        <div class="card">
          <h2>What it does</h2><p>${esc(c.summary)}</p>
          ${c.currentLaw ? `<h3>Current law</h3><p>${esc(c.currentLaw)}</p>` : ""}
        </div>
        <div class="yn">
          <div class="yn__box is-yes"><h3>A YES vote means</h3><p>${esc(c.yesMeans)}</p></div>
          <div class="yn__box is-no"><h3>A NO vote means</h3><p>${esc(c.noMeans)}</p></div>
        </div>
        <div class="procon">
          <details class="block block--for" open><summary>Arguments for (pros)</summary>${listHtml(c.pros)}</details>
          <details class="block block--against" open><summary>Arguments against (cons)</summary>${listHtml(c.cons)}</details>
        </div>
        <div class="card facts-card">
          ${c.fiscal ? `<p><strong>Fiscal impact:</strong> ${esc(c.fiscal)}</p>` : ""}
          <p><strong>Supporters (listed on ballot):</strong> ${esc(c.ballotSupporters || "—")}${c.otherSupport ? `<br><span class="muted">Also: ${esc(c.otherSupport)}</span>` : ""}</p>
          <p><strong>Opponents (listed on ballot):</strong> ${esc(c.ballotOpponents || "—")}${c.otherOppose ? `<br><span class="muted">Also: ${esc(c.otherOppose)}</span>` : ""}</p>
          ${c.voteNeeded ? `<p><strong>Needed to pass:</strong> ${esc(c.voteNeeded)}</p>` : ""}
          ${sourcesHtml(c.sources)}
        </div>
      </div>`));
    } else {
      // primary-format measure
      body.appendChild(h(`<div class="card"><h2>What it does</h2><p>${c.summary || ""}</p></div>`));
      opts.forEach(o => {
        if (o.blurb) body.appendChild(h(`<div class="card ${isYes(o.label) ? "block--for" : "block--against"} block"><h3>${esc(o.label)}</h3><p>${esc(o.blurb)}</p>${sourcesHtml(o.sources)}</div>`));
      });
    }
    body.appendChild(h(`<h2 class="section-h">Your choice</h2>`));
    body.appendChild(choiceButtons(c, opts, body));
  }

  function renderRetention(c, body) {
    const ex = cur.ballot.meta.retentionExplainer;
    body.appendChild(h(`<div class="card">
      <p class="lead-q">Shall ${esc(c.seatTitle)} <strong>${esc(c.justice)}</strong> be elected to the office for the term provided by law?</p>
      ${ex ? `<details class="about"><summary>How judicial retention votes work</summary><p>${esc(ex)}</p></details>` : ""}
      ${c.background ? `<p>${esc(c.background)}</p>` : ""}
      ${sourcesHtml(c.sources)}
    </div>`));
    body.appendChild(h(`<h2 class="section-h">Your choice</h2>`));
    body.appendChild(choiceButtons(c, measureOptions(c), body,
      v => v === "YES" ? `YES — keep ${c.justice}` : `NO — remove ${c.justice}`));
  }

  // ---------- views: summary ----------
  function renderSummary(sharedParam) {
    setTopbar(true);
    const eid = cur.election.id, total = cur.contests.length, n = cur.contests.filter(c => cur.picks[c.id]).length;
    const node = h(`<section class="summary">
      <div class="card summary__head">
        <h1>Your ballot summary</h1>
        <p class="lead">${esc(cur.election.title)} — ${esc(cur.ballot.meta.date)}</p>
        <p>You made a selection in <strong>${n}</strong> of ${total} contests. Rows are in paper-ballot order, with the exact text next to each circle to fill in.</p>
        <div class="actions no-print">
          <button class="btn btn--primary" id="printBtn">Print</button>
          <button class="btn btn--ghost" id="copyBtn">Copy list</button>
          <button class="btn btn--ghost" id="shareBtn">Share my picks</button>
          <a class="btn btn--ghost" href="#/e/${eid}/list">Edit contests</a>
        </div>
        <p class="toast" id="toast" hidden></p>
      </div>
      <div class="import card no-print" hidden></div>
      <div class="slist"></div>
      <p class="fineprint">${cur.ballot.meta.disclaimer}</p>
      <p class="no-print"><button class="btn btn--danger" id="resetBtn">Clear all my picks for this election</button></p>
    </section>`);

    if (sharedParam) {
      const shared = decodePicks(sharedParam);
      const box = $(".import", node);
      if (shared && JSON.stringify(shared) !== JSON.stringify(cur.picks)) {
        const cnt = Object.keys(shared).length;
        box.hidden = false;
        box.innerHTML = `<p><strong>This link contains ${cnt} saved pick${cnt === 1 ? "" : "s"}.</strong> Load them into this browser? This replaces any picks saved here for this election.</p>
          <div class="actions"><button class="btn btn--primary" id="loadShared">Load these picks</button><button class="btn btn--ghost" id="ignoreShared">Ignore</button></div>`;
        $("#loadShared", box).onclick = () => { cur.picks = shared; savePicks(); location.replace(`#/e/${eid}/summary`); render(); };
        $("#ignoreShared", box).onclick = () => location.replace(`#/e/${eid}/summary`);
      }
    }

    const list = $(".slist", node);
    let page = null;
    cur.contests.forEach((c, i) => {
      if (c.page !== page) {
        page = c.page;
        list.appendChild(h(`<div class="page-h">Ballot page ${c.page}${c.page % 2 ? " (front)" : " (back)"}</div>`));
      }
      const pick = cur.picks[c.id];
      const text = bubbleText(c, pick);
      const cls = !text ? "is-empty" : isYes(pick) ? "is-yes" : isNo(pick) ? "is-no" : "";
      list.appendChild(h(`<div class="srow">
        <span class="srow__n">${i + 1}</span>
        <div class="srow__body">
          <div class="srow__office">${esc(contestTitle(c))}${c.column ? ` <small>· col ${c.column}</small>` : ""}</div>
          <div class="srow__pick ${cls}">${text ? `<span class="dot" aria-hidden="true">●</span> ${esc(text)}` : pick === null ? "— skipped —" : "— no selection —"}</div>
        </div>
        <a class="srow__edit no-print" href="#/e/${eid}/c/${i + 1}">Edit</a>
      </div>`));
    });

    $("#printBtn", node).onclick = () => window.print();
    $("#copyBtn", node).onclick = () => copyText(summaryText(), "Copied ✓");
    $("#shareBtn", node).onclick = () => {
      const url = `${location.origin}${location.pathname}#/e/${eid}/summary?p=${encodePicks(cur.picks)}`;
      if (navigator.share) navigator.share({ title: "My voter guide picks", url }).catch(() => {});
      else copyText(url, "Link copied — open it on your other device ✓");
    };
    $("#resetBtn", node).onclick = () => {
      if (confirm("Clear all your picks for this election?")) { cur.picks = {}; savePicks(); location.hash = `#/e/${eid}`; }
    };
    swap(node);
  }

  function summaryText() {
    const lines = [`${cur.election.title} — ${cur.ballot.meta.date}`, ""];
    let page = null;
    cur.contests.forEach((c, i) => {
      if (c.page !== page) { page = c.page; lines.push(`— Page ${c.page} —`); }
      lines.push(`${i + 1}. ${contestTitle(c)}: ${bubbleText(c, cur.picks[c.id]) || "(no selection)"}`);
    });
    lines.push("", "Non-partisan voter guide. Verify against your official ballot.");
    return lines.join("\n");
  }
  function copyText(text, msg) {
    const toast = document.getElementById("toast");
    const done = () => { toast.textContent = msg; toast.hidden = false; setTimeout(() => toast.hidden = true, 3000); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => prompt("Copy this:", text));
    else prompt("Copy this:", text);
  }

  // share encoding: array in ballot order; number = option index, "s" = skipped, "w:<name>" = write-in, 0-length = undecided
  function encodePicks(picks) {
    const arr = cur.contests.map(c => {
      const v = picks[c.id];
      if (v === undefined) return "";
      if (v === null) return "s";
      if (v.startsWith(WRITE_IN)) return "w:" + v.slice(WRITE_IN.length);
      const opts = c.type === "candidate" ? c.candidates.map(x => x.name) : measureOptions(c).map(o => o.label);
      const i = opts.indexOf(v);
      return i === -1 ? "" : i;
    });
    while (arr.length && arr[arr.length - 1] === "") arr.pop();
    const json = JSON.stringify(arr);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePicks(s) {
    try {
      const json = decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
      const arr = JSON.parse(json), picks = {};
      arr.forEach((v, i) => {
        const c = cur.contests[i];
        if (!c || v === "") return;
        if (v === "s") picks[c.id] = null;
        else if (typeof v === "string" && v.startsWith("w:")) picks[c.id] = WRITE_IN + v.slice(2);
        else {
          const opts = c.type === "candidate" ? c.candidates.map(x => x.name) : measureOptions(c).map(o => o.label);
          if (opts[v] !== undefined) picks[c.id] = opts[v];
        }
      });
      return picks;
    } catch { return null; }
  }

  // ---------- routing ----------
  async function loadElection(id) {
    const e = elections.find(x => x.id === id);
    if (!e) return false;
    if (!ballots[id]) {
      const r = await fetch(e.file);
      if (!r.ok) throw new Error(`${e.file}: ${r.status}`);
      ballots[id] = await r.json();
    }
    const b = ballots[id];
    cur = { election: e, ballot: b, contests: b.contests.slice().sort((a, z) => a.order - z.order), picks: loadPicks(id) };
    return true;
  }

  async function render() {
    const [path, query] = location.hash.replace(/^#/, "").split("?");
    const parts = path.split("/").filter(Boolean);
    try {
      if (parts[0] !== "e" || !parts[1] || !(await loadElection(parts[1]))) return renderHome();
      const view = parts[2];
      if (view === "c") {
        const n = Math.min(Math.max(parseInt(parts[3], 10) || 1, 1), cur.contests.length);
        renderContest(n - 1);
      } else if (view === "summary") {
        renderSummary(new URLSearchParams(query || "").get("p"));
      } else if (view === "list") renderList();
      else renderIntro();
    } catch (err) {
      app.innerHTML = `<div class="card"><h2>Couldn't load the ballot data.</h2>
        <p>If you're running locally, serve the folder (e.g. <code>python3 -m http.server</code>) instead of opening the file directly.</p>
        <p class="muted">${esc(err.message)}</p></div>`;
    }
  }

  window.addEventListener("hashchange", render);
  document.getElementById("homeBtn").onclick = () => { location.hash = "#/"; };
  document.getElementById("electionBtn").onclick = () => { if (cur) location.hash = `#/e/${cur.election.id}/list`; };
  document.getElementById("gotoSummaryBtn").onclick = () => { if (cur) location.hash = `#/e/${cur.election.id}/summary`; };
  document.addEventListener("keydown", (e) => {
    if (!cur || e.target.matches("input, textarea, select")) return;
    const m = location.hash.match(/\/c\/(\d+)/);
    if (!m) return;
    const n = +m[1];
    if (e.key === "ArrowRight") location.hash = n >= cur.contests.length ? `#/e/${cur.election.id}/summary` : `#/e/${cur.election.id}/c/${n + 1}`;
    if (e.key === "ArrowLeft" && n > 1) location.hash = `#/e/${cur.election.id}/c/${n - 1}`;
  });

  fetch("data/elections.json")
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(list => { elections = list; migrateLegacy(); render(); })
    .catch(err => { app.innerHTML = `<div class="card"><h2>Couldn't load elections.</h2><p class="muted">${esc(err.message)}</p></div>`; });
})();
