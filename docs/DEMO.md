# Did Stuff: real work becomes useful updates

This demo comes from an actual Codex CLI 0.162.1 run in a disposable project on 2026-10-13. Project paths, record IDs and session identities are omitted. Evidence aliases below are public-safe labels for the live artifacts, not literal stored IDs.

## The work

Request: implement an async retry helper with a maximum of three attempts, preserving the last error, and test recovery after one failure plus exhaustion.

Codex created `retry.mjs` and two Node tests. `node --test` passed both tests. The completion report explicitly recorded that first-attempt and third-attempt success were not separately tested. Did Stuff captured that visible report as **reported**, not independently verified.

Normal `/exit` saved a local session recap and daily recap. Reopening Codex and invoking `$did-stuff standup today` produced:

> **Completed**
>
> - Reported implementing a retry helper: up to three attempts, returning the successful result or throwing the last error.
> - Reported `node --test`: 2 passed, 0 failed, covering success after one failure and exhaustion.
>
> **Ongoing / recorded next steps**
>
> - First-attempt and third-attempt success remain separately untested.
> - No next steps recorded.
>
> **Blockers**
>
> No blockers recorded.

Coverage: captured Codex work in the requested local day, Europe/Moscow. Some activity was dated by capture time. Evidence: E1, the visible completion report; E0, the corresponding user request. Markdown was saved under `.did-stuff/drafts/` with source IDs separately attached.

## Three public drafts

`$did-stuff tweet today` generated these alternatives from the same supported work. No post was published.

**Progress — 141 characters**

> Implemented an async retry helper capped at three attempts. It returns the successful result or throws the last error if every attempt fails.

**Lesson — 194 characters**

> Two passing retry tests cover success after one failure and exhaustion. First-attempt and third-attempt success aren't separately tested: a reminder to be precise about what a test suite covers.

**Problem solved — 167 characters**

> The retry helper's failure path stops after three attempts and throws the exact last error. The exhaustion test checks both the attempt count and the error's identity.

Counts are Unicode character counts, not X platform validation. All drafts cite E1 separately and note its reported status. Direct verification outside the summary session also passed the two actual tests. Internal paths and private links are absent from copyable text.

## Follow-up state

A later live coding session added the missing first-attempt and third-attempt success tests without changing the implementation. All four tests passed. The updated adapter captured the verification stdout as **reported, exit status unavailable**, because the Bash hook did not supply a structured exit code. Earlier test gaps remain in the original notes; a new manual recap can reconcile them with the later completion report.

The two original records did not multiply when standup and tweet drafts were generated. Disabling and uninstalling Did Stuff retained saved drafts, an unrelated hook and unrelated project configuration.
