# Contributing

For anyone with write access to a UZA repository. Read once; it takes five minutes and
saves an argument later.

---

## The loop

```bash
git switch -c your-name/what-it-does     # never commit to main directly
npm ci && cp .env.example .env            # first time only
# ... work ...
npm run lint && npm run build             # there is no test suite here yet — see below
git push -u origin your-name/what-it-does
# open a pull request
```

**There are no tests in this app yet.** That is the honest state and the first thing worth
fixing. Start with pure logic rather than component rendering — UZA Nexus's
`apps/web/src/lib/format.test.ts` is the reference shape, and vitest is already the runner
across the estate.

---

## Branches and pull requests

**Branch naming:** `your-name/short-description` — `gad/split-listings-service`. Your name
first so `git branch -a` tells everyone who is working on what.

**One pull request, one concern.** A PR that fixes a bug *and* renames a folder *and* adds a
feature cannot be reviewed properly, and cannot be reverted cleanly when one third of it turns
out to be wrong.

**Every PR needs a green CI tick and one review.** Not ceremony — a second pair of eyes is the
cheapest defect-finding tool there is, and the reviewer learns the system.

**Say what and why in the description.** The diff already shows what changed. What it cannot
show is what you tried that did not work, and what you decided not to do.

---

## What we will ask you to change in review

Only these, and each exists because of something that actually went wrong here.

**`VITE_` values are compiled in; everything else is read at run time.** Changing a `VITE_`
value needs a **rebuild**, not a restart. The service-role key is deliberately not prefixed,
is read only in `client.server.ts`, and must never become a build arg.

**Do not add Vite plugins by hand.** `vite.config.ts` uses
`@lovable.dev/vite-tanstack-config`, which already includes TanStack Start, React, Tailwind,
tsconfig paths, Nitro and env injection. Adding any of them again breaks the build with a
duplicate-plugin error.

**Regenerate types after a schema change** rather than hand-editing
`src/integrations/supabase/types.ts` — it says "automatically generated" at the top and means
it:

```bash
npx supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

**Keep routes small.** `evfleet/src/routes/apply.tsx` is 1,062 lines for one screen, and it is
the candidate application form. Extract components as you go rather than after.

**Keep comments short.** What a line does, or a trap in one or two lines. Reasoning goes in
`docs/` with a link. This codebase currently runs about twice the comment density of a
hand-written one and is being corrected, not defended.

---

## Files to read before you touch them

Three files encode rules with **legal** consequences, not stylistic ones. Each has tests
naming specific counterparties.

| | Why |
|---|---|
| `src/integrations/supabase/client.server.ts` | Holds the **service-role** key. It bypasses row-level security entirely and must never reach a browser bundle |
| `supabase/migrations/` | Never edit a migration that has already run. Add a new one |
| `vite.config.ts` | See the plugin note above |

The confidentiality rules that carry legal weight live in **UZA Nexus** —
`intake-lanes.ts` and `lender-view-access.ts`. If a test there fails, **do not adjust the
test.** Come and ask.

---

## Secrets

**Never commit a `.env`.** Every repo has a `.env.example` — copy it. Two repos had a tracked
`.env` until 29 August 2026; it held only publishable keys, but a tracked `.env` is how a
service-role key eventually gets committed by somebody who did not notice.

**Two kinds of key, and the difference matters more than anything else here:**

| | |
|---|---|
| **Publishable / anon** | Public by design. It ships to every browser anyway. Safe in a client bundle or a build arg |
| **Service role, `JWT_SECRET`, `UZA_ID_PEPPER`, `MFA_ENCRYPTION_KEY`** | **Run time only.** Never a build arg — build args are recorded in image history and travel with the image into any registry |

**If you commit a secret by accident: say so immediately and rotate it.** Deleting the commit
does not help — the value is already in every clone and in the reflog. Rotating is the only
fix, and it is quick when you say so quickly.

The documents repository has `tools/check-before-push.py`, which catches phone numbers,
national IDs and literal credentials. **Read its exit code** — piping it into `tail` hides the
failure, which is how six findings once went out.

---

## Personal data

Candidate names, national IDs, phone numbers and loan files are **never** committed to any
repository. Seeds read them from a path supplied at run time.

UZA Nexus holds no national ID or phone number in clear — only peppered hashes, for matching.
Under Law N° 058/2021 the obligation follows the data, so the less this app stores, the less
it owes.

**Row-level security is what protects Supabase data, not the key.** The publishable key is in
every browser bundle by design. If a table is readable without a policy, it is readable by
anyone who opens dev tools.

---

## Working alongside other people

Two of us edited the same files at the same time on 28 August and produced a red build twice.
Cheap to avoid:

- **Say what you are picking up** before you start, in whatever channel the team uses.
- **Small branches, merged often.** A branch open for two weeks is a merge conflict with a
  countdown on it.
- **If you find someone else's work in progress in your tree, do not "clean it up".** Ask.

---

## When something is wrong

**Change it.** Nothing here is sacred. Much of this code was written with AI assistance and
some of it is wrong — a stale README, a comment three times longer than it needs to be, a test
asserting `"Hello World!"` against an endpoint that never returned it.

The tests exist so you can change things confidently. **If you find something wrong and leave
it because you assume it was deliberate, that is the worst outcome.**

Two things to raise rather than fix silently: anything in the files above, and anything that
changes what a lender, a donor or a regulator would be told.
