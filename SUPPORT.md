# Support

This file is about getting help with **Claude Code Bootstrap Pro itself** —
not about supporting your end users (that's `SECURITY.md` + your own
project's docs).

## Before reaching out

1. **Re-read `README.md`** — the instantiation checklist covers ~90% of
   onboarding questions.
2. **Check `CLAUDE.md`** — most "should I do X or Y?" answers live there
   under `## Architecture rules`, `## Conventions`, and `## Anti-patterns`.
3. **Check Claude Code docs** for anything related to settings, hooks,
   skills, agents, or MCP — `https://docs.claude.com/en/docs/claude-code`.
4. **Check `.claude/rules/`** for the standing instructions Claude follows
   in any project using this template.

## How to ask

Send a single email or message that includes:

- **What you tried** (commands, file paths, what you expected)
- **What happened** (full error output, not a summary)
- **Your stack** (language + framework + versions, OS, Claude Code version)
- **Bootstrap version** (the release tag or download date you received)

Snippets and full terminal output beat screenshots. Trim secrets before sending.

## Channels

- **Email**: `bruno@b2tech.io` — preferred for licensing, paid customers,
  and anything sensitive. Reply on business days.
- **Course community**: if a community channel (Discord / Circle / Slack)
  is opened later, the URL will be announced via email to active licensees.

## Response expectations

- Acknowledgement: within 2 business days (Mon–Fri, BRT).
- Resolution / answer: depends on complexity. Simple usage questions are
  usually answered in the same reply; deeper template defects may be
  scheduled for the next release.
- Out-of-office windows are announced by email when relevant.

## What is NOT covered by template support

- Debugging your own application code
- Stack-specific consulting (which framework, which DB, etc.)
- Writing your specs, ADRs, or threat models for you
- Anything explicitly out of scope at the point of sale

## Repo access issues (Channel B)

If you provided a GitHub username at checkout but didn't get a collaboration
invite within 24h, or the invite expired, send your email + GitHub username
to the support channel above. The invite can be re-issued.

If you didn't provide a GitHub username at checkout but want repo access
now, send the same info — repo access can be granted at any time within
your license term.

To stop receiving updates from the master repo, just delete the `bootstrap`
remote from your local clone (`git remote remove bootstrap`). Your access
to the master repo stays available unless you explicitly request revocation.

## Bug reports about the template itself

If you found a real defect in the template (broken hook, malformed
template, drift from official Claude Code docs), please report it —
that's how the template stays good.

Include a minimal reproduction:
- Bootstrap version
- Exact file you copied/changed
- The behavior you observed vs. what `README.md` / `CLAUDE.md` say should
  happen

## Refunds and licensing

Refund and license-tier questions are handled by the original purchase
channel, not this email. See your purchase receipt for the relevant
contact.
