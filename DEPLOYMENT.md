# BuddhaMap deployment

Production: https://buddhamap.fyi

Cloudflare Pages project: `buddhamap` (production branch: `main`).

## Automatic deployment from GitHub

The existing Pages project uses Direct Upload. GitHub Actions deploys to that same project so its custom domain, KV data and administrator secrets are retained.

The `.github/workflows/deploy.yml` workflow runs on pushes to `main` and can also be run manually from GitHub Actions.

Before its first successful run, add these repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with **Account → Cloudflare Pages → Edit** for the account that owns this project.
- `CLOUDFLARE_ACCOUNT_ID`: the owning Cloudflare account ID.

Never commit API tokens, `.dev.vars`, or administrator secrets.

## Editing and manual deployment

Edit `index.html` and `assets/`. The workflow copies them into a clean `dist/` directory before deploying. Wrangler compiles `functions/` from the repository root.

For manual deployment, prepare `dist/` in the same way and run:

```sh
npx wrangler pages deploy dist --project-name=buddhamap --branch=main
```

The existing `BUDDHAMAP_DATA` KV namespace is configured in `wrangler.jsonc`. Keep `ADMIN_TOTP_SECRET` and `ADMIN_SESSION_SECRET` in Cloudflare Pages production secrets. Do not reset them when deploying.

After deployment, check the home page, `/api/temples`, and `/api/admin/auth`.

Reference: [Cloudflare Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
