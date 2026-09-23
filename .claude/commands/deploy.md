---
description: Run the project's deploy pipeline. Stops on the first failure.
allowed-tools: Bash, Read
---

# /deploy

Execute the project's deployment pipeline in order. Halt on any failure and report.

> **[CUSTOMIZE]** This command is a stack-agnostic skeleton. Replace each step
> marked `[CUSTOMIZE]` with the actual command for your project. The reference
> for concrete commands is the `## Commands` section of the project's `CLAUDE.md`.
> Production deploys must run via CI — never bypass that here.

## Pre-checks

1. Verify current branch:
   ```bash
   git branch --show-current
   ```
   If not `main` or `release/*`, **stop** and ask whether to proceed anyway.

2. Verify clean working tree:
   ```bash
   git status --porcelain
   ```
   If there are uncommitted changes, **stop**.

3. Verify CI is green at the current commit:
   ```bash
   gh run list --limit 1 --json status,conclusion,headSha
   ```
   Confirm `conclusion = success` and `headSha` matches `git rev-parse HEAD`.

## Tag the release

4. Create a calver tag:
   ```bash
   TAG="v$(date +%Y.%m.%d)-$(git rev-parse --short HEAD)"
   git tag -a "$TAG" -m "release $TAG"
   git push origin "$TAG"
   ```

## Trigger the deploy pipeline

5. **[CUSTOMIZE]** Trigger the deploy. Pick what your project uses:
   - GitHub Actions: `gh workflow run deploy.yml -f tag="$TAG"`
   - GCP Cloud Build: `gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG="$TAG"`
   - AWS CodeBuild: `aws codebuild start-build --project-name <project> --environment-variables-override name=TAG,value="$TAG"`
   - Vercel / Netlify / Render: typically auto-deploy on tag push — verify in their dashboard
   - Custom CI: dispatch with the tag as input

6. **[CUSTOMIZE]** Stream/monitor the build until it completes. Pick what your CI offers:
   - `gh run watch`
   - `gcloud builds log <BUILD_ID> --stream`
   - Equivalent for your CI

## Post-deploy

7. **[CUSTOMIZE]** Smoke-test the health endpoint:
   ```bash
   curl -fsS https://<production-host>/health
   ```
   Expected: `200 OK` with the project's health-check payload.

8. **[CUSTOMIZE]** Verify the deployed version:
   ```bash
   curl -fsS https://<production-host>/version
   ```
   Confirm the response matches `$TAG`.

9. **[CUSTOMIZE]** Announce the deploy in your team's channel (Slack, Teams, Discord, email):
   - Channel: `#deploys` (or equivalent)
   - Format: `🚀 deploy $TAG · run <ID> · <link-to-build>`

## On failure

If any step fails:
1. Stop immediately
2. Capture the error output
3. Ask the user whether to roll back. **[CUSTOMIZE]** the rollback command — examples:
   - GCP Cloud Run: `gcloud run services update-traffic <service> --to-revisions=<previous>=100`
   - AWS ECS: `aws ecs update-service --service <name> --task-definition <previous-revision>`
   - Kubernetes: `kubectl rollout undo deployment/<name>`
4. **Do not** delete the tag — it remains as audit trail
