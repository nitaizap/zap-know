# Deploying the hyper-personal weekly episode

What changed: the `weekly` function's `episodes()` step now builds each person's episode from a
context pack of their own week, in a few batched queries:
- **who they are:** first name, team, level, interests, needs, time, language;
- **their numbers:** points this week, rank and change, gap to the next place and level, streak, minutes, finished courses, budget and bonus;
- **what's waiting for them:** saved but not opened, listen later, the course to continue, this week's reminders, new items in topics they follow;
- **what happened around them:** likes and comments on their posts, what teammates liked, what their team published;
- **zap UP this week:** trending, the top Hebrew item, the most-discussed post, a new team doc;
- **3–5 picks**, one of them from outside their topics.

It is still one LLM call and one TTS call per person, with the AI cap respected. Demo colleagues get no episode, and any segment without data is skipped.

## 1. SQL (once)

Paste `supabase/patch-020-episode-segments.sql` in the SQL Editor and run it.

It adds `episodes.segments`, which feeds the chips on the home feed's episode card. Without it, episodes are still saved, just without chips.

## 2. The function

1. Edge Functions → **weekly** → Code.
2. Replace everything with `supabase/bundle/weekly.ts` (the function with `_shared/core.ts` inlined).
3. Deploy. The setting "Verify JWT with legacy secret" stays OFF as before; the function checks `x-cron-secret` itself.

The Sunday 06:00 cron job is unchanged.

## 3. Test on one person (documented, not run)

```bash
curl -X POST "https://lfiwdqcysgwvzzfuuszf.supabase.co/functions/v1/weekly?only=episodes&email=<someone>@d.co.il" \
  -H "x-cron-secret: $CRON_SECRET"
```

`CRON_SECRET` is in Supabase Edge Function Secrets. The response lists who it was sent to.

To see the result: `select week, body_he, segments, audio_url from episodes order by id desc limit 1;`, or open zap UP: the episode card is the third card on the home feed.

## Rebuilding the bundle after a change

```bash
node -e "const fs=require('fs');const core=fs.readFileSync('supabase/functions/_shared/core.ts','utf8');const fn=fs.readFileSync('supabase/functions/weekly/index.ts','utf8').replace(/^import [^\n]*_shared\/core\.ts\";\n/m,'');fs.writeFileSync('supabase/bundle/weekly.ts',core.trimEnd()+'\n\n// ---- weekly ----\n'+fn)"
```
