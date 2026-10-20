# Give royd@d.co.il access to zap UP: a task for Nitai's Claude

**Who runs this:** a Claude agent working in Nitai's account (Claude Code with Claude in Chrome, or claude.ai with the browser extension), with Nitai at the keyboard.

**Goal:** `royd@d.co.il` gets full working access to everything zap UP runs on. The hackathon work can then continue from Roy's Claude account: deploy functions, run SQL, edit the deck and push code.

**Deadline:** today, before the 21:00 upload.

## Rules for the agent

- Nitai signs in to every site themselves. The agent never types passwords, verification codes or API keys.
- Every invite or share below sends an email to `royd@d.co.il`. Nitai's request to run this file counts as approval for exactly these invites and shares, with exactly these roles, and nothing else.
- Don't change billing, spending caps, API keys or secrets.
- Report each step as done, skipped (with the reason), or blocked (with what Nitai needs to do).

---

## 1. Supabase (required)

The project is `lfiwdqcysgwvzzfuuszf` (zap UP / zap KNOW).

1. Open https://supabase.com/dashboard/project/lfiwdqcysgwvzzfuuszf/settings/general and note which **organization** the project belongs to.
2. Open that organization's **Team** page: https://supabase.com/dashboard/org/_/team, then pick the right org.
3. Click **Invite**, enter `royd@d.co.il`, and choose the role **Administrator**. Use **Owner** if Administrator isn't offered. Developer is not enough, because Roy's Claude has to deploy Edge Functions and run SQL. Send the invite.
4. Check that the Team list shows `royd@d.co.il` with status "Invited".

If the plan limits the number of members, stop and tell Nitai. Don't upgrade the plan.

## 2. GitHub (`nitaizap/zap-know`)

1. Open https://github.com/nitaizap/zap-know/settings/access.
2. Click **Add people** and enter Roy's GitHub username, or `royd@d.co.il` if GitHub finds an account for it. Choose the **Write** role, or **Maintain** if offered.
3. If no GitHub account matches, skip this step. Pushing already works from the shared computer, so tell Nitai that Roy can send their username later.

Don't transfer the repository or change its visibility. A migration to a teammate's GitHub is a separate decision.

## 3. Pitch deck (Claude artifact)

The deck is https://claude.ai/artifact/Ld4YU4nCNsSeGYhzZK9CVC and is owned by Nitai's Claude account.

1. Open it while signed in as Nitai.
2. Use **Share** to add `royd@d.co.il` with **edit** access (writer). If edit access for a specific person isn't available, choose "anyone in the organization can edit", or tell Nitai.
3. Report which option was used.

## 4. Google Cloud project "zap-up" (optional)

This step is only needed if Roy has to see Gemini usage. The Gemini key is already stored as a Supabase secret, and the spending cap (₪17 a month on Google, $4.50 in code) must stay as it is.

1. Open https://console.cloud.google.com/iam-admin/iam and select the project **zap-up**.
2. Click **Grant access**, enter `royd@d.co.il`, and choose the role **Viewer**. Don't grant Billing roles.

Skip this step if Nitai prefers.

## 5. Not needed

- **Brevo:** the email key sits in Supabase secrets, so Supabase access covers it.
- **Gemini/AI Studio keys:** stored in Supabase.
- **GitHub Pages:** it is deployed from the repo, so step 2 covers it.

---

## After the invites: steps for Roy, on Roy's own computer

1. Accept the Supabase invitation email, sign in to supabase.com, and open the project to confirm access.
2. In Chrome, reconnect the Claude extension to the `royd@d.co.il` Claude account.
3. Log in to zap UP at https://nitaizap.github.io/zap-know with `royd@d.co.il` and the emailed code.
4. Tell Roy's Claude "done". It will then do the following:
   - Make Roy an admin in the SQL editor:
     ```sql
     update profiles set is_admin = true
     where user_id = (select id from auth.users where email = 'royd@d.co.il');
     ```
   - Deploy the pending work by following `DEPLOY-avatar.md`: the patch for avatars and the faces of people who liked a post, plus the `avatar` function.

## Report back

When you finish, write a short status in this format and send it to Nitai, who passes it to Roy:

```
Supabase invite: done/blocked (role: …)
GitHub collaborator: done/skipped (username: …)
Deck share: done/blocked (access: …)
Google Cloud viewer: done/skipped
```
