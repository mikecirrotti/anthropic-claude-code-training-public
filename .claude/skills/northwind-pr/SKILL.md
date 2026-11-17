---
name: northwind-pr
description: Write a pull request description in the team's required format (title, what changed, how I verified it, acceptance criteria, deliberately not done). Use when the user asks to write or draft a PR description, or invokes /northwind-pr.
---

# /northwind-pr

Write the pull request description for the work on the current branch, in the team's required format.

The reviewer reads this before the diff. It has to be accurate before it is anything else.

## Before you write anything

Read all three. Do not draft from memory or from the conversation alone.

1. **The branch diff.** `git diff main...HEAD --stat`, then the diff itself. What actually changed, not what was intended.
2. **The git log.** `git log main..HEAD --oneline`. How the work was sequenced.
3. **The ticket.** Find it in `docs/tickets/` by the ID in the branch name or commit subjects. If you cannot tell which ticket it is, ask. Take the acceptance criteria verbatim.

If there is a spec in `docs/specs/` for the ticket, read it too and note where the build departed from it.

## The format

Produce exactly these parts, in this order.

### Title

`<TICKET-ID>: <what it does>`

For example `NWP-101: add export options`. State what the change does, not the work you did.

### What changed

One plain-language paragraph. What can the app do now that it could not before? Not a file list; the diff already is one.

### How I verified it

The actual commands you ran and what they output.

- Quote the real command and the real result line, for example `npm test` and `Tests 36 passed (36)`.
- If you exercised the feature by hand, say what you did and what appeared.
- Only list a step you actually ran in this session or can see evidence of. If a check was not run, write `Not run` next to it. If you cannot tell whether something was run, leave it out or mark it `Not verified`. Do not fill the gap with a plausible result.

### Acceptance criteria

Copy the ticket's checkboxes verbatim. Go criterion by criterion: find the code that satisfies it, or find that nothing does. Tick only what is met. For a partial criterion, leave it unticked and say which half is done and which is not. An unmet criterion reported honestly is better than one left unmentioned.

### Deliberately not done

Anything out of scope, left for a follow-up, or known to be rough: unfinished stretch work, issues you noticed but did not fix (name the file and the cause), tests you meant to write. If there is nothing, write `Nothing.` rather than omitting the section.

## Finish

Print the finished description. Then offer to open the PR with `gh pr create --title "<title>" --body-file <file>`. Ask first. Opening a pull request is the user's call, and the target repository and branch are theirs to name.

## Rules

- **Never claim a verification step that was not actually run.** This overrides tidiness. A shorter, true "How I verified it" beats a complete, invented one.
- **Plain language over ceremony.** "Ops can now choose which columns go in the export" beats "implemented column selection functionality".
- **Do not tick a criterion because you intended to meet it.**
- **Keep it scannable.** Short paragraphs, real bullets.
- **No filler and no summary of the summary.**
