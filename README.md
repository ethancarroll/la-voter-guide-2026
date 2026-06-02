# Interactive Non-Partisan Voter Guide
### Los Angeles County — Statewide Direct Primary Election, June 2, 2026

A self-contained, **non-partisan** web app that walks you through your actual LA County
primary ballot one contest at a time, gives a short neutral summary of what each candidate
or ballot-measure option stands for (with sources), lets you make a pick for each, and
produces a printable summary you can use to fill out your paper ballot.

The contests and candidates were transcribed directly from photos of the official 8-page
ballot, and appear here **in the same order as the paper ballot** (39 contests, 263 options).

## Run it locally

It's a static site — no build step, no dependencies. From this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

> Note: open it through the server (`http://localhost:8000`), not by double-clicking
> `index.html`. Browsers block `fetch()` of the ballot data from `file://` URLs.

Any static server works, e.g. `npx serve` or VS Code Live Server.

## How to use

1. **Start** on the welcome screen.
2. For each contest, read the candidate/option summaries (expand **Sources** to see citations)
   and select your choice. You can also **Skip** a contest or **Clear** a pick.
   - Long contests (e.g. Governor, ~61 candidates) have a **filter box** and a
     **"Notable candidates first"** toggle.
   - Use **← / →** arrow keys to move between contests.
3. Your selections are saved in your browser's `localStorage` — refresh or come back later
   and pick up where you left off. Nothing is uploaded anywhere.
4. At the end, the **Summary** lists every contest with your pick, in ballot order.
   Use **Print** or **Copy list** to take it to your paper ballot. **Edit** jumps back to
   any contest; **Start over** clears everything.

## Files

```
index.html            # app shell + HTML templates
css/styles.css         # styling (responsive + print)
js/app.js              # all app logic (no dependencies)
data/ballot.json       # the full ballot: contests, candidates, summaries, sources
```

To update content, edit `data/ballot.json` (no code changes needed).

## About the content & sourcing

- **Non-partisan by design.** Summaries are written to inform, not to endorse, and were
  synthesized from a mix of non-partisan sources (Ballotpedia, CalMatters, LAist, the
  official California Voter Information Guide, Wikipedia) plus left- and right-leaning
  outlets. Each well-documented candidate links to 1–3 sources.
- **Tiered depth.** High-profile candidates get fuller summaries. Many minor candidates and
  judicial candidates have little independent coverage, so only ballot-listed facts
  (name, party preference, stated occupation) are shown rather than invented positions.
- **Party labels** in partisan races are the candidate's *self-stated* party preference;
  California uses a top-two primary, so the two highest finishers advance regardless of party.
- This guide is **independent** and not affiliated with any campaign, party, or election
  official. Always verify against your official ballot and
  [lavote.gov](https://lavote.gov).
```
