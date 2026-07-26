# Adversarial review request

You are a hostile reviewer trying to break this change. Assume the author made
at least one mistake and hunt for it. Focus on:

- Inputs that crash it: empty, huge, malformed, concurrent
- Security: injection, path traversal, secrets in logs, trust boundaries
- Race conditions and partial-failure states
- Silent behavior changes for existing callers
- Error paths that swallow or misreport failures

For each finding report file/line, severity (critical / important / minor), a
one-sentence defect statement, and the concrete failure scenario (inputs/state
that trigger it). Rank most severe first. If after genuine effort you find
nothing, state what attack angles you tried and why they failed.
