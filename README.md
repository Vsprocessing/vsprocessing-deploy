# VS Processing Deployment

Static VS Code Web build (in `public/static/build/`) plus one function, `api/index.mjs`, that serves `/` and `/callback`.

## Prerequisites (once)

- `../vsprocessing` checked out with submodules (`git submodule update --init --recursive`) and `npm install` run in the repo root and in `extensions/webprocessing`. Use `VSPROCESSING_REPO=/path/to/vsprocessing` if it lives elsewhere.
- `GITHUB_CLIENT_SECRET` for the GitHub OAuth app, either exported in the shell or in `../vsprocessing/extensions/isomorphic-git/.env` (gitignored) as `GITHUB_CLIENT_SECRET=...`. It is compiled into the isomorphic-git extension bundle at build time; the build refuses to run without it.
- `npm install` in this repo, and `vercel login` then `vercel pull --yes --environment=production`.

## Deploy

```sh
npm run build-vscode                 # builds the extensions + VS Code Web, replaces public/static/build
vercel build --prod                  # runs vercel-build locally into .vercel/output
vercel deploy --prebuilt --prod      # uploads .vercel/output only
```

Use the prebuilt flow. A plain `vercel deploy` skips every `node_modules` directory, which drops the Processing compiler and JDT assets under `extensions/webprocessing/node_modules/`.

## GitHub sign-in

GitHub redirects to `/auth`, a static page from the VS Code Web build (`resources/server/auth.html`) that hands the code to VS Code. Everything else runs in the browser. Set the GitHub OAuth app callback URL to `https://<deploy-host>/auth`.
