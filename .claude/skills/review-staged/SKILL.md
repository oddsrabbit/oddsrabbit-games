---
name: review-staged
description: Review staged git changes for code quality and breakage before committing.
argument-hint: "[optional focus, e.g. the bridge schemas]"
disable-model-invocation: true
---

Review ONLY the staged changes (`git diff --cached`; `git diff --cached --stat` for scope).
The commit ships only what is staged, so read each file's staged version (`git show :path`),
not the working-tree copy.

Focus (optional): $ARGUMENTS
If a focus is given, review everything as usual but look hardest at that area and report on it first.

Check:
1. **Staged set is self-contained**: nothing staged depends on something that exists only in
   unstaged or untracked changes. Flag partially staged files.
2. **Will it break**: bugs, edge cases, null/empty handling, errors, and existing callers
   that the change could break: the games that use the SDK, the host apps on the other side
   of the bridge (web and mobile), and changes to `src/schemas/` that make old messages
   invalid. If a bridge verb changed, check that `../apps-sdk/README.md` needs an update too,
   and that nothing private ends up in a path the public SDK sync copies.
3. **Code standard**: follows CLAUDE.md/README and the surrounding code; no needless complexity or duplication.
4. Anything you'd do differently, with a reason.

Output:
- **Verdict**: Ship / Ship after fixes / Don't ship
- **Blockers** (file:line, why, fix)
- **Suggestions** (ranked; mark nitpicks)
- **What these changes do**: plain-language summary, then a draft commit message in the
  repo's style (e.g. `feat(scope): ...`).

Don't modify files unless asked.
