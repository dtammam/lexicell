# Deploy

Static bundle in an nginx container, built by GitHub Actions, pulled by
the NUC. ADR-006 in the architecture pack. This is the operator side;
the agent cannot reach the NUC and the dev box has no Docker, so the
image is built and smoke-tested in CI only.

## Check HTTPS first

A PWA installs and its service worker registers only over HTTPS (or
`localhost`). Over plain LAN HTTP the page works but "Add to Home
Screen" gives a bookmark, not an app, and airplane mode fails. Put the
container behind the existing reverse proxy with a real certificate
before testing the install; do not spend an evening on the manifest.

## Image

`deantammam/lexicell`, tags per `.github/workflows/docker-publish.yml`:

| Event | Tags |
|-------|------|
| push to `main` | `edge`, `sha-<short>` |
| tag `vX.Y.Z` | `X.Y.Z`, `X.Y`, `X`, `latest` |

The workflow builds once, runs the image, checks `/`, the manifest,
the service worker, an icon and the SPA fallback, and only then pushes
that exact image. A push needs the repository secrets `DOCKER_USERNAME`
and `DOCKER_PASSWORD`; without them the publish job fails at login and
nothing ships. `workflow_dispatch` runs everything but the push.

## NUC compose

```yaml
services:
  lexicell:
    image: deantammam/lexicell:edge
    pull_policy: always
    ports:
      - "8090:80"
    restart: unless-stopped
```

Point the reverse proxy at port 8090 with HTTPS. Watchtower following
`edge` picks up every push to main; switch the tag to `latest` once a
release is cut.

## Play it locally, no Docker, no NUC

The dev box is a container reached through VS Code Remote. Both dev
scripts bind to all interfaces so the port can be forwarded or
published.

**Desktop browser (fastest).** In the VS Code terminal:

```
npm run dev
```

VS Code auto-forwards port 5173 to your machine (Ports panel; add it
by hand if it does not appear). Open `http://localhost:5173`. Edits
hot-reload. `localhost` is a secure context, so even the service
worker registers here after `npm run build && npm run preview` on
port 4173, which is the closest thing to the shipped bundle.

**Phone on the LAN (plain HTTP, no install, no offline).** The dev
box is a code-server container, and code-server proxies any container
port under its own URL, so nothing needs publishing:

```
npm run dev:lan
```

Then on the phone open the code-server address you already use, with
`/absproxy/5173/` appended, for example
`http://bigpail:8080/absproxy/5173/`. Log in with the code-server
password once; the session cookie covers the game. `dev:lan` starts
Vite with `--base /absproxy/5173/` so its asset paths and hot-reload
socket survive the proxy prefix. Plain `npm run dev` stays on `/` for
VS Code's own port forward.

Alternatives if code-server's port is not on the LAN: set the VS Code
setting `remote.localPortHost` to `allInterfaces`, forward 5173, and
browse to `http://<desktop LAN IP>:5173`; or publish `5173:5173` on
the container and use `npm run dev` at `http://<BIGPAIL LAN IP>:5173`.

Over LAN HTTP the game plays and saves, but "Add to Home Screen" is a
bookmark and airplane mode fails; that needs the HTTPS deploy above.
The save lives in that browser's localStorage per origin, so the
desktop and the phone have separate runs.

## Phone

1. Open the HTTPS URL in Safari.
2. Share > Add to Home Screen.
3. Open from the icon, play one turn, enable airplane mode, relaunch.

That last step is the Phase 1 exit criterion. The saved run lives in
the browser's localStorage for that origin; clearing site data drops
it, which is expected.
