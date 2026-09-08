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

## Local check without Docker

```
npm run build && npm run preview
```

`vite preview` serves `dist/` on `http://localhost:4173`. `localhost`
counts as a secure context, so the service worker registers there;
check DevTools > Application > Service Workers, then go offline and
reload.

## Phone

1. Open the HTTPS URL in Safari.
2. Share > Add to Home Screen.
3. Open from the icon, play one turn, enable airplane mode, relaunch.

That last step is the Phase 1 exit criterion. The saved run lives in
the browser's localStorage for that origin; clearing site data drops
it, which is expected.
