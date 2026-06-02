/* Non-partisan Voter Guide — LA County June 2, 2026 Primary
 * Vanilla JS single-page app. Loads data/ballot.json, walks contests
 * one at a time, persists picks to localStorage, renders a printable summary.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "voterGuide.picks.v1";
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const progressBar = document.getElementById("progressBar");
  const progressCount = document.getElementById("progressCount");

  let ballot = null;
  let contests = [];
  let picks = loadPicks();
  let idx = 0; // current contest index

  // ---------- storage ----------
  function loadPicks() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function savePicks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(picks)); } catch {}
  }
  function hasAnyPicks() { return Object.keys(picks).length > 0; }

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const tpl = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

  function partyAbbr(p) {
    if (!p) return "";
    return ({
      "Democratic": "DEM", "Republican": "REP", "Green": "GRN",
      "Peace and Freedom": "P&F", "Libertarian": "LIB",
      "None": "NPP", "No Party Preference": "NPP"
    })[p] || p;
  }

  function setTopbar(show) {
    topbar.hidden = !show;
  }
  function updateProgress() {
    const total = contests.length;
    const answered = contests.filter(c => picks[c.id] !== undefined).length;
    const pct = total ? Math.round((answered / total) * 100) : 0;
    progressBar.style.width = pct + "%";
    progressCount.textContent = `${answered}/${total} decided`;
  }

  // ---------- views ----------
  function renderWelcome() {
    setTopbar(false);
    const node = tpl("tpl-welcome");
    const m = ballot.meta;
    $(".welcome__title", node).textContent = m.title;
    $(".welcome__sub", node).textContent = `${m.election} — ${m.date}`;
    const facts = $(".welcome__facts", node);
    const candTotal = contests.reduce((n, c) => n + (c.candidates ? c.candidates.length : 0), 0);
    [
      [contests.length, "contests"],
      [candTotal, "candidates & options"],
      [m.jurisdiction, ""]
    ].forEach(([a, b]) => {
      const li = document.createElement("li");
      li.innerHTML = b ? `<strong>${a}</strong> ${b}` : `<strong>${a}</strong>`;
      facts.appendChild(li);
    });
    $(".welcome__disclaimer", node).innerHTML = m.disclaimer;
    $(".welcome__count", node).textContent =
      "Your selections are saved only in this browser (localStorage). Nothing is uploaded.";

    const startBtn = $("#startBtn", node);
    const resumeBtn = $("#resumeBtn", node);
    const jumpBtn = $("#jumpSummaryBtn", node);
    if (hasAnyPicks()) {
      resumeBtn.hidden = false;
      jumpBtn.hidden = false;
      startBtn.textContent = "Start over from the top →";
    }
    startBtn.onclick = () => { idx = 0; go("contest"); };
    resumeBtn.onclick = () => {
      const firstUn = contests.findIndex(c => picks[c.id] === undefined);
      idx = firstUn === -1 ? 0 : firstUn;
      go("contest");
    };
    jumpBtn.onclick = () => go("summary");

    swap(node);
  }

  function renderContest() {
    setTopbar(true);
    updateProgress();
    const c = contests[idx];
    const node = tpl("tpl-contest");

    $(".chip--page", node).textContent = `Page ${c.page} of 8`;
    $(".chip--votefor", node).textContent =
      c.type === "measure" ? "Yes / No" : `Vote for ${c.voteFor || 1}`;
    $(".contest__office", node).textContent = c.office || c.title;
    $(".contest__sub", node).textContent =
      `Contest ${idx + 1} of ${contests.length}` + (c.subtitle ? ` · ${c.subtitle}` : "");
    const noteEl = $(".contest__note", node);
    if (c.note) noteEl.textContent = c.note; else noteEl.remove();

    const optionsEl = $(".options", node);

    if (c.type === "measure") {
      const mbox = $(".contest__measure", node);
      mbox.hidden = false;
      mbox.innerHTML = `<strong>What this measure does:</strong> ${c.summary}`;
      c.options.forEach(opt => optionsEl.appendChild(measureOption(c, opt)));
    } else {
      const list = c.candidates.slice();
      // tools for long lists
      const tools = $(".contest__tools", node);
      const searchEl = $(".contest__search", node);
      const majorFirst = $(".contest__majorfirst", node);
      const LONG = 8;
      if (list.length > LONG) {
        tools.hidden = false;
        const rerender = () => {
          const q = searchEl.value.trim().toLowerCase();
          let arr = list.filter(cand => {
            if (!q) return true;
            return (cand.name + " " + (cand.party || "") + " " + (cand.ballotOccupation || ""))
              .toLowerCase().includes(q);
          });
          if (majorFirst.checked) {
            arr = arr.slice().sort((a, b) => rank(b) - rank(a));
          }
          optionsEl.innerHTML = "";
          if (!arr.length) {
            const p = document.createElement("p");
            p.className = "empty";
            p.textContent = "No candidates match your filter.";
            optionsEl.appendChild(p);
          } else {
            arr.forEach(cand => optionsEl.appendChild(candidateOption(c, cand)));
          }
        };
        searchEl.oninput = rerender;
        majorFirst.onchange = rerender;
        rerender();
      } else {
        list.forEach(cand => optionsEl.appendChild(candidateOption(c, cand)));
      }
    }

    // nav
    const prevBtn = $("#prevBtn", node);
    const nextBtn = $("#nextBtn", node);
    const skipBtn = $("#skipBtn", node);
    const clearBtn = $("#clearBtn", node);
    prevBtn.disabled = idx === 0;
    prevBtn.onclick = () => { idx = Math.max(0, idx - 1); go("contest"); };
    nextBtn.textContent = idx === contests.length - 1 ? "Finish → Review" : "Next →";
    nextBtn.onclick = () => advance();
    skipBtn.onclick = () => { picks[c.id] = null; savePicks(); advance(); };
    if (picks[c.id] !== undefined) clearBtn.hidden = false;
    clearBtn.onclick = () => { delete picks[c.id]; savePicks(); go("contest"); };

    swap(node);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function rank(cand) {
    return cand.tier === "major" ? 1 : 0;
  }

  function advance() {
    if (idx >= contests.length - 1) { go("summary"); }
    else { idx++; go("contest"); }
  }

  function candidateOption(contest, cand) {
    const label = document.createElement("label");
    label.className = "option";
    const selected = picks[contest.id] === cand.name;
    if (selected) label.classList.add("is-selected");

    const partyHtml = cand.party
      ? `<span class="party" data-p="${esc(cand.party)}">${partyAbbr(cand.party)}</span>` : "";
    const occHtml = cand.ballotOccupation
      ? `<span class="option__occ">${esc(cand.ballotOccupation)}</span>` : "";

    label.innerHTML = `
      <input type="radio" name="${esc(contest.id)}" value="${esc(cand.name)}" ${selected ? "checked" : ""}>
      <div class="option__top">
        <span class="option__name">${esc(cand.name)}</span>
        ${partyHtml}
        ${occHtml}
      </div>
      ${cand.blurb ? `<p class="option__blurb ${cand.tier === "minor" ? "is-minor" : ""}">${esc(cand.blurb)}</p>` : ""}
      ${sourcesHtml(cand.sources)}
    `;
    wireOption(label, contest, cand.name);
    wireSources(label);
    return label;
  }

  function measureOption(contest, opt) {
    const label = document.createElement("label");
    const isYes = /^yes/i.test(opt.label);
    label.className = "option " + (isYes ? "is-yes" : "is-no");
    const selected = picks[contest.id] === opt.label;
    if (selected) label.classList.add("is-selected");
    label.innerHTML = `
      <input type="radio" name="${esc(contest.id)}" value="${esc(opt.label)}" ${selected ? "checked" : ""}>
      <div class="option__top"><span class="option__name">${esc(opt.label)}</span></div>
      ${opt.blurb ? `<p class="option__blurb">${esc(opt.blurb)}</p>` : ""}
      ${sourcesHtml(opt.sources)}
    `;
    wireOption(label, contest, opt.label);
    wireSources(label);
    return label;
  }

  function wireOption(label, contest, value) {
    const input = $("input", label);
    input.addEventListener("change", () => {
      picks[contest.id] = value;
      savePicks();
      // update selection styling without full rerender
      label.closest(".options").querySelectorAll(".option").forEach(o => o.classList.remove("is-selected"));
      label.classList.add("is-selected");
      $("#clearBtn").hidden = false;
      updateProgress();
    });
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return "";
    const items = sources.map(s =>
      `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join("");
    return `<div class="sources">
      <button type="button" class="sources__toggle">Sources (${sources.length})</button>
      <ul class="sources__list" hidden>${items}</ul>
    </div>`;
  }
  function wireSources(label) {
    const t = $(".sources__toggle", label);
    if (!t) return;
    const list = $(".sources__list", label);
    t.addEventListener("click", (e) => {
      e.preventDefault();
      list.hidden = !list.hidden;
    });
  }

  function renderSummary() {
    setTopbar(true);
    updateProgress();
    const node = tpl("tpl-summary");
    const decided = contests.filter(c => picks[c.id]).length;
    $(".summary__lead", node).textContent =
      `You made a selection in ${decided} of ${contests.length} contests. ` +
      `Use this list (in ballot order) to fill out your paper ballot, then verify against the official ballot.`;
    $(".summary__disclaimer", node).innerHTML = ballot.meta.disclaimer;

    const listEl = $("#summaryList", node);
    let curPage = null;
    contests.forEach((c, i) => {
      if (c.page !== curPage) {
        curPage = c.page;
        const h = document.createElement("div");
        h.className = "summary__page-h";
        h.textContent = `Ballot page ${c.page}`;
        listEl.appendChild(h);
      }
      const pick = picks[c.id];
      const row = document.createElement("div");
      row.className = "srow";
      let pickClass = "is-empty";
      let pickText = "— no selection —";
      if (pick) {
        pickText = pick;
        pickClass = /^yes/i.test(pick) ? "is-yes" : /^no/i.test(pick) ? "is-no" : "";
      }
      row.innerHTML = `
        <div class="srow__num">${i + 1}</div>
        <div class="srow__body">
          <div class="srow__office">${esc(c.office || c.title)}</div>
          <div class="srow__pick ${pickClass}">${esc(pickText)}</div>
        </div>
        <button class="srow__edit">Edit</button>`;
      $(".srow__edit", row).onclick = () => { idx = i; go("contest"); };
      listEl.appendChild(row);
    });

    $("#printBtn", node).onclick = () => window.print();
    $("#copyBtn", node).onclick = () => copySummary(node);
    $("#backToVotingBtn", node).onclick = () => { idx = 0; go("contest"); };
    $("#resetBtn", node).onclick = () => {
      if (confirm("Clear all your selections and start over?")) {
        picks = {}; savePicks(); idx = 0; go("welcome");
      }
    };

    swap(node);
    window.scrollTo({ top: 0 });
  }

  function copySummary(node) {
    const lines = [
      ballot.meta.title,
      `${ballot.meta.election} — ${ballot.meta.date}`,
      ""
    ];
    contests.forEach((c, i) => {
      const pick = picks[c.id] || "— no selection —";
      lines.push(`${i + 1}. ${c.office || c.title}: ${pick}`);
    });
    lines.push("", "Generated by a non-partisan voter guide. Verify against your official ballot.");
    const text = lines.join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      const msg = $("#copiedMsg", node);
      msg.hidden = false;
      setTimeout(() => { msg.hidden = true; }, 2500);
    }).catch(() => {
      alert("Copy failed — here is your list:\n\n" + text);
    });
  }

  // ---------- routing ----------
  function go(view) {
    if (view === "contest" && (idx < 0 || idx >= contests.length)) view = "summary";
    history.replaceState({ view, idx }, "");
    render(view);
  }
  function render(view) {
    if (view === "welcome") renderWelcome();
    else if (view === "summary") renderSummary();
    else renderContest();
  }
  function swap(node) {
    app.innerHTML = "";
    app.appendChild(node);
  }

  // keyboard nav
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    const view = (history.state && history.state.view) || "welcome";
    if (view !== "contest") return;
    if (e.key === "ArrowRight") { advance(); }
    if (e.key === "ArrowLeft" && idx > 0) { idx--; go("contest"); }
  });

  // topbar buttons
  document.getElementById("homeBtn").onclick = () => go("welcome");
  document.getElementById("gotoSummaryBtn").onclick = () => go("summary");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- boot ----------
  fetch("data/ballot.json")
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      ballot = data;
      contests = data.contests.slice().sort((a, b) => a.order - b.order);
      go("welcome");
    })
    .catch(err => {
      app.innerHTML = `<div class="card" style="padding:28px">
        <h2>Couldn't load the ballot data.</h2>
        <p>Make sure you're running a local server (not opening the file directly):</p>
        <pre style="background:#f1f3f8;padding:12px;border-radius:8px">cd voter_guide
python3 -m http.server 8000</pre>
        <p>then open <a href="http://localhost:8000">http://localhost:8000</a>.</p>
        <p style="color:#8a90a2">Error: ${esc(err.message)}</p>
      </div>`;
    });
})();
