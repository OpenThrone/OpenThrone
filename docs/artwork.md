# Optional remote artwork

The open-source base uses the existing race palettes, CSS frames, fonts, and RPG Awesome icons. It requires no artwork bucket or custom image files. User-uploaded avatars are separate from themed artwork.

## Choose an experience

With no artwork configuration, the app uses the base experience. To force this even when legacy S3 settings exist, set `NEXT_PUBLIC_ARTWORK_MODE=pure`.

For the hosted artwork, set `NEXT_PUBLIC_ARTWORK_BASE_URL=https://assets.openthrone.dev`. The value is a **public HTTPS origin**, not the authenticated R2 S3 API endpoint. An optional path prefix is supported. These Next.js public variables are read at build time; rebuild after changing them.

Existing `NEXT_PUBLIC_USE_AWS=true` plus `NEXT_PUBLIC_AWS_S3_ENDPOINT` remains supported when no new base URL is supplied. Pure mode overrides both configurations. Missing or invalid configuration never creates an `undefined` asset URL.

Artwork previously bundled under `/assets/` uses R2 keys under `artwork/v1/assets/` with its existing relative path. Public URLs include the manifest's SHA-256 as a version query to bypass cached misses from before the migration. Existing character portraits, menu textures, and avatar frames already stored in R2 retain their `images/` keys. Failed decorative images disappear into the CSS surface; failed crests/navigation artwork use local icons, and the logo falls back to the typeset game name. CSS backgrounds always have a base surface beneath them.

## Local comparison

On `ot.aioxhost.com`, the header includes an **Artwork comparison** selector with Configured default, R2 artwork, and Pure UI / fallback options. The choice is saved only in that browser. R2 uses the configured public artwork base, or the documented `https://assets.openthrone.dev` public origin when none is configured; Pure UI uses the existing CSS and icon fallbacks. Uploaded player avatars are preserved.

Changing the option redraws the page and resets open dialogs and unsaved page filters. The selector and its override are disabled on every other hostname, including alpha and production. Server rendering and the configured deployment default are unchanged.

## Migrate the source artwork

```bash
# Inventory only, without loading environment files or changing anything.
bun --no-env-file scripts/migrate-artwork.ts

# Upload, verify every object and public URL, then remove bundled originals.
bun scripts/migrate-artwork.ts --upload --archive
```

The uploader uses server-only `ARTWORK_S3_ENDPOINT` for the R2 S3 API endpoint, and the existing `AWS_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_REGION` (defaults to `auto`). Configure these privately. It can reuse `AWS_S3_ENDPOINT` only if that variable already contains a valid R2 S3 API endpoint. Set the separate artwork upload variable when the existing setting points at the public domain; do not change working public image settings. The uploader does not print their values or SDK error messages.

The uploader writes only under `artwork/v1/`. It refuses to overwrite existing objects, accepting an existing object only when its SHA-256 matches. It verifies both the S3 object and the public HTTPS response before archiving anything. A failure leaves the bundled sources intact. It also keeps copies under ignored `local/custom-artwork`, including image provenance sidecars, and records object keys, sizes, content types, and hashes in `docs/artwork/manifest.json`. Retain that local archive outside your deployment.

Cloudflare recommends a [custom domain for production public R2 access](https://developers.cloudflare.com/r2/buckets/public-buckets/); the existing assets domain must serve the uploaded keys. No bucket visibility, DNS, or cache settings are changed by the script.

After migration, ignore custom artwork directories so new images cannot accidentally be bundled. To add artwork, upload it to the same prefix from the local archive and reference its logical `/assets/...` path through `ArtworkImage` or `resolveArtworkSource`. Do not put custom images back in `public`.

Removing the current files from a commit does not remove them from existing Git history. History rewriting is a separate operation and requires coordination with repository contributors.
