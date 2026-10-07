# Interactive Non-Partisan Voter Guide — Los Angeles

**Live:** https://ethancarroll.github.io/la-voter-guide-2026/

A static, mobile-friendly web app that walks you through your actual LA ballot one contest at a time,
in paper-ballot order. For each contest it gives neutral, sourced information:

- **Measures:** what it does, current law, what YES and NO mean, pros and cons, fiscal impact, and
  supporters/opponents (as listed on the ballot, plus others).
- **Candidates:** background, what they say they stand for, and what opponents and critics say about them.
- **Judicial retention votes:** how retention works, plus appointment and background details.

Pick as you go. The **summary** page lists the exact text next to each circle on the paper ballot,
grouped by ballot page and column, so you can fill in your ballot quickly. You can print it, copy it,
or share it.

## Elections

| Election | Data file |
|---|---|
| Nov 3, 2026 General | `data/2026-11-general.json` (66 contests) |
| Jun 2, 2026 Primary | `data/2026-06-primary.json` (39 contests) |

The home screen lists every election in `data/elections.json`, so you can come back to past ones.
To add a future election, add a ballot JSON file and an entry to `elections.json`.

## Your picks

- Picks auto-save in your browser's `localStorage`, under one key per election
  (`voterGuide.picks.<id>`). Nothing is uploaded anywhere.
- **Share my picks** creates a link with your picks encoded in the URL. Open it on another device
  (for example, your phone) and choose **Load these picks**.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Files

```
index.html             app shell
css/styles.css         responsive, dark mode, print styles
js/app.js              all app logic (no dependencies, hash routing)
data/elections.json    list of elections
data/*.json            ballot content and sources
```

## Content and neutrality

Summaries attribute every argument to the people or groups making it, give each side similar depth,
and link 1–3 sources per entry (official voter pamphlets, CalMatters, LAist, LA Times, Ballotpedia and
others). Where little independent coverage exists, only ballot facts are shown rather than invented
positions. This guide is independent and not affiliated with any campaign, party or election office.
Always verify against your official ballot and [lavote.gov](https://lavote.gov).
