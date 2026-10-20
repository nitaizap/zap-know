# Deploying the AI avatar and the likers stack

Two pieces need someone with a Supabase dashboard session on project `lfiwdqcysgwvzzfuuszf`.
Until they're deployed, the app hides the features gracefully:
- the avatar maker says "יצירת אווטאר תיפתח בקרוב";
- the likers stack under the like button stays hidden.

## 1. SQL (once)

1. Open SQL Editor → New query.
2. Paste the whole of `supabase/patch-019-ai-avatar.sql` and press Run.

The "destructive operation" warning is expected, because of the `drop policy if exists` lines.

What it does:
- Makes sure the `avatars` storage bucket exists and is public.
- Lets each user write only inside their own `<user_id>/` folder.
- Adds `profiles.sheet_url` and the `avatar_tries` table (3 tries per person per day).
- Sets `app_settings.image_model = gemini-2.5-flash-image`.
- Adds the `item_likers(p_item_ids bigint[], p_per int)` RPC, which returns who liked each card. It is batched, one call per feed page.

## 2. The `avatar` edge function

1. Edge Functions → Deploy a new function → via Editor.
2. Name it **`avatar`** (exactly).
3. Replace the editor contents with the whole of `supabase/bundle/avatar.ts`. That file is `supabase/functions/avatar/index.ts` with `_shared/core.ts` inlined.
4. In the function settings, turn **"Verify JWT with legacy secret" OFF**. The function checks the `@d.co.il` session itself.
5. Deploy.

No new secrets are needed. It uses the existing `GEMINI_API_KEY`, and every call passes the global AI cap in `core.ts` (`ai_cap_usd`). The calls are metered at `price_img_out`.

### Check it

- Logged in, האזור שלי → the first card → "ליצור אווטאר". The text should now say how many tries are left, instead of "תיפתח בקרוב".
- In the database: `select * from ai_usage where fn = 'avatar' order by at desc limit 5;`

## How it works

1. The browser resizes the photo to at most 768px (JPEG, quality 0.8) and posts it to `avatar`.
2. Call 1 goes to `gemini-2.5-flash-image` with the Mii reference-sheet prompt and the photo, at aspect ratio 16:9. This model has no output-size option, so only the ratio is set.
3. Call 2 sends only the generated sheet, with the "square head-and-shoulders portrait" prompt, at 1:1.
4. Both results are saved to `avatars/<user_id>/sheet.png` and `avatar.png` (overwritten each time). The original photo is never stored.
5. The person accepts → `profiles.avatar_url`, `avatar_style = 'ai'` and `sheet_url` are saved. Generated avatars and the character sheet are public, as the owner decided.
6. Tries are counted when they start, so failures count too. After 3 in 24 hours the function returns 429.

## Rebuilding the bundle after a change

Run this from the repo root:

```bash
node -e "const fs=require('fs');const core=fs.readFileSync('supabase/functions/_shared/core.ts','utf8');const fn=fs.readFileSync('supabase/functions/avatar/index.ts','utf8').replace(/^import [^\n]*_shared\/core\.ts\";\n/m,'');fs.writeFileSync('supabase/bundle/avatar.ts',core.trimEnd()+'\n\n// ---- avatar ----\n'+fn)"
```
