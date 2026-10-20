# zap UP: moving the repo into your GitHub

Hi, and thanks for hosting us. This moves `nitaizap/zap-know` (team 3's hackathon project, zap UP)
into your GitHub with all history, keeps the live site working, and gives the team write access
to this repo only. No Snowflake, Azure or other system access is needed or requested.

## What changes and what doesn't
- **Moves:** the code, history and branches, and the website (GitHub Pages) to `<your-account>.github.io/zap-know/`.
- **Stays as is:** the back-end (Supabase database, functions, secrets) and all keys. Nothing secret is in the repo.
- **Old links:** GitHub redirects `nitaizap/zap-know` to the new place automatically.

## Steps on your side (about 5 minutes)
1. **Allow the transfer** (pick the one that fits):
   - **Into an organization:** add `nitaizap` to the org with permission to create repositories
     (or temporarily allow members to create repos), or tell us and we'll transfer to your personal account instead.
   - **Into your personal account:** nothing to prepare; accept the transfer email from GitHub.
2. **After the transfer:** Settings → Collaborators → add `nitaizap` with **Write** (repo-level only).
3. **Pages:** Settings → Pages → Source: *GitHub Actions*. The workflow in `.github/workflows/deploy.yml`
   builds and publishes on every push to `master`. Check that `https://<your-account>.github.io/zap-know/` loads.
4. **Recommended:** Settings → Branches → protect `master` (require a pull request and your approval).
   There is only one branch; the site deploys from it, so nothing else needs to stay unprotected.
5. Send us the final repo address. We update the login redirect, the email links and the deck on our side.

## For your Claude session
Clone the repo and read `CLAUDE.md`: it has the architecture, deploy steps, conventions (zap One Tone,
zap visual language), demo-data rules and how two Claude sessions work in parallel without collisions
(branches + PRs, `git pull --rebase --autostash`, next SQL patch number).

## Security notes
- The publishable Supabase key in the code is designed to be public (all data is behind row-level
  security, login is limited to `@d.co.il`).
- Secrets (AI keys, email key, cron secrets) live only in Supabase Edge Function Secrets.
- Demo data is labelled everywhere and removable in one SQL line (see `CLAUDE.md`).
