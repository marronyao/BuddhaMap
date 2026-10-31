# BuddhaMap

Website: https://buddhamap.fyi

A map and directory of Buddhist temples in Europe, hosted on Cloudflare Pages.

- `index.html` and `assets/`: website source.
- `dist/`: deployed static website.
- `functions/`: Cloudflare Pages APIs for temple data, images and administrator authentication.
- `wrangler.jsonc`: Pages configuration and the existing KV binding.

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and repository secret setup.

Cloud data and administrator secrets stay in Cloudflare; they are not stored in this repository.
