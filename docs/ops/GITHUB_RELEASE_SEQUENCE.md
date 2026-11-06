# Recommended GitHub commit and push sequence

**Do not push or merge without explicit approval.** Do not force-push.

## Before committing

1. Confirm `.env`, keystores, `google-services.json`, `.p8`, `.jks` are **not** staged (`git status`).
2. Confirm `apps/mobile/android/` and `apps/mobile/ios/` remain ignored (CNG / EAS regenerates).
3. Keep uncommitted local experiments separate if the user still needs them.

## Suggested commit grouping (after approval to commit)

```bash
# 1) Inspect
git status
git diff
git log -5 --oneline

# 2) Stage Phase 5 prep (examples — adjust to actual paths)
git add apps/mobile/app.json apps/mobile/eas.json
git add apps/mobile/app/_layout.tsx apps/mobile/services/api.ts apps/mobile/services/network.ts
git add apps/mobile/components/NetworkBanner.tsx
git add apps/mobile/.env.example .gitignore .env.example
git add docs/ops/

# 3) Commit (HEREDOC / careful message)
git commit -m "$(cat <<'EOF'
Prepare Phase 5 production release configuration.

Document Android/iOS/EAS release steps, harden client network UX without offline sync, and keep production ops gated behind approval.
EOF
)"

# 4) Push only when the user explicitly asks
git push -u origin HEAD
```

## Branch strategy

- Prefer a dedicated release branch (e.g. `release/phase-5`) or continue the current feature branch.
- Open a PR for review; do not merge to `main` without approval.
- Tag store builds later in Phase 6 (`v1.0.0`) after successful AAB/IPA.

## Never

- `git push --force` to `main` / `master`
- Commit Hostinger passwords, Razorpay live secrets, or SMS API keys
- Delete uncommitted user work to “clean” the tree
