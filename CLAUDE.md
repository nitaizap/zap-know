# zap UP (zap KNOW) — working notes for Claude sessions

Hackathon project, team 3, zap One Tone hackathon (20.10.2026, upload deadline 21:00).
zap UP is zap Group's learning and knowledge hub: external learning (courses, news, podcasts) +
internal knowledge (team docs + an agent that answers "how does team X do Y"), with a social feed,
gamification, a learning budget and audio ("להאזנה", drive mode, personal podcast feed).

- Live site: https://nitaizap.github.io/zap-know/ (login: one-time email code, `@d.co.il` only)
- Pitch deck (Artifact): https://claude.ai/artifact/Ld4YU4nCNsSeGYhzZK9CVC — sources in `pitch/project/`
- Supabase project: `lfiwdqcysgwvzzfuuszf` (org "zap KNOW")
- Submission folder (owner's machine): `Downloads/marcom hackathon/zapOnetone/תקיית הגשה`

## Stack
- Frontend: Vite + React + TS, HashRouter, base `/zap-know/`. Calm design system in `src/styles.css`,
  shared pieces in `src/components/` (ui, icons, filters, social, points, budget, prefs, Listen).
- Back-end: Supabase Postgres with RLS (`is_zap()` = email ends with `@d.co.il`), Edge Functions in
  `supabase/functions/*`, cron via pg_cron (collect every 10 min — it also sends due reminders —
  linkcheck nightly, weekly on Sunday 06:00).
- AI: `LLM_PROVIDER` setting; Gemini model name in `app_settings.gemini_model` (switchable without redeploy). Demo = Gemini free tier (public content + demo data only).
  Production = Claude via OpenRouter with zero data retention (internal data).
- Email: Brevo API (`BREVO_API_KEY`), sender address in table `app_settings.sender_email`.
  Teams channel posts via a Teams Workflows webhook (`TEAMS_WEBHOOK`, optional).
- Secrets live only in Supabase Edge Function Secrets. Never in code, docs or chat.

## Product shape (owner-approved, round 4)
- Two destinations: בית (feed_all; lanes בשבילך (default) · בזאפ · בעולם · בקצרה) and האזור שלי (my cards first, then שמרתי · אחר כך · היסטוריה). /external and /internal redirect into the home lanes.
- One fixed 9:16 frame for every post (desktop: stage height, width = height*9/16). On the media only: one type badge (`components/TypeBadge.tsx`), a 2-line title, one source line, the rail.
- Opening never navigates: `components/detail.tsx` (openDetail / DetailLink). Desktop feed = side panel, phone = full-height sheet; /item/:id and /doc/:id = the feed with it open. Sources open in a new tab.
- Preview chain (LiveMedia in `src/pages/Feed.tsx`): YouTube loop (id derived from any YouTube URL) → source image → thum.io page capture → microlink og:image/og:video/embedded YouTube (localStorage cache, 6 calls per visit) → text. Podcasts: show art. Team docs: the DocVisual poster. Never AI-generated thumbnails.
- Sheets render through `components/Layer.tsx` (portal + --vvh). Avatars: `components/Avatar.tsx` (5 sizes, a letter on a deterministic palette colour, or the AI avatar from the `avatar` function; see DEPLOY-avatar.md).
- The logo is the real mark + wordmark cropped from the brand file (`src/assets/zap-mark-white.png`) plus "UP", with "by zap group" under it.
- Pushing: the owner's team pulls master into another repo. Commit and push master after every working change, always pull --rebase first, never force-push master.

## Data model (apply in order)
`supabase/schema.sql`, then `patch-001` … `patch-019` (016 AI cap, 017 docs as items, 018 Hebrew sources, 019 AI avatar + item_likers, 020 episode segments, 021 playable: channel video ids + Hebrew YouTube sources, 022 episode heard_at + mark_episode_heard, 023 owner sources), then seeds: `seed.sql` (demo items, teams),
`seed-demo-people.sql` (15 demo colleagues on `@zap-up.invalid`, marked "(דמו)"),
`seed-team-docs.sql` (36 team docs). Cleanup of demo people: `delete from auth.users where email like '%@zap-up.invalid';`

## Deploying
- Site: push to `master`. GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to
  Pages in ~2 min; check with `gh run list --workflow "Deploy site" -L 1`. One branch only: there is
  no gh-pages branch any more. Never force-push master; don't edit `.github/` without the owner.
- Functions: the dashboard editor takes ONE file. `supabase/bundle/<fn>.ts` = function + inlined
  `_shared/core.ts`. Regenerate bundles after editing core or a function, push, then paste/deploy.
  New functions need "Verify JWT with legacy secret" turned OFF (they check auth themselves).
- SQL: Supabase SQL editor. Destructive-operation warnings are expected for `drop … if exists` lines.

## Conventions
- Hebrew copy follows the zap One Tone skill, internal register: warm colleague tone, clarity over
  playfulness, plural/neutral gender (no slashes like מנהל/ת), lowercase "zap", no "...", max one "!".
  Glossary and pending fixes: `pitch/copy-audit.md`.
- Visuals follow the zap visual language skill: brand palette only, Noto Sans Hebrew Black/Light,
  Gveret Levin for one handwritten accent, metro lines sparingly. The owner's direction: simple, fun, clear.
- Demo data is always labelled (`is_demo`, "נתוני דמו", "(דמו)"). Never present it as real.
- Every product change also updates the pitch deck (owner's standing request).

## Working in parallel (two Claude accounts)
- Work on a branch and open a PR; or agree file ownership before starting. Pull with
  `git pull --rebase --autostash` before every push.
- Announce SQL patches by number (next free: `patch-026`). Never edit an applied patch; add a new one.
- Ranking lives in `feed_v2()` (patch-025: personal + team + platform scores, lanes for_you|zap|world|quick|trending|team,
  returns id, score, lane, reason_he, reason_kind, popular_with, shared_by). `items.platform_score` refreshes every 30 min.
- All Supabase SQL-editor tabs share one saved snippet: setting the editor text in one tab can replace another tab's query.
- Commit messages end with the Co-Authored-By / Claude-Session lines your session gives you.
