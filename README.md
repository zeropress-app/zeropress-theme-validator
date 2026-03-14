# @zeropress/theme-validator

![npm](https://img.shields.io/npm/v/%40zeropress%2Ftheme-validator)
![license](https://img.shields.io/npm/l/%40zeropress%2Ftheme-validator)
![node](https://img.shields.io/node/v/%40zeropress%2Ftheme-validator)

Shared validation core for ZeroPress theme ZIP archives and directory-backed file maps.

This package is the single source of truth for runtime theme validation used by:

- [zeropress-theme](https://www.npmjs.com/package/zeropress-theme)
- `backend_api_v2`
- `themes.zeropress.org-api`

It implements the current runtime v0.2 validation rules defined in [ZeroPress Theme Runtime Spec v0.2](https://zeropress.dev/spec/theme-runtime-v0.2.html).

---

## Install

```bash
npm install @zeropress/theme-validator
```

---

## Exports

```js
import {
  detectBasePrefix,
  parseThemeManifestFromZip,
  validateThemeFiles,
  validateThemeZip,
} from '@zeropress/theme-validator';
```

---

## API

### `validateThemeZip(buffer, options?)`

Validates a ZIP archive in memory.

Supported ZIP layouts:

- root-flat uploads
- uploads wrapped in exactly one top-level folder

Invalid ZIP layouts:

- archives with multiple top-level roots where `theme.json` only exists in one nested folder

Example:

```js
import { readFile } from 'node:fs/promises';
import { validateThemeZip } from '@zeropress/theme-validator';

const buffer = await readFile('./dist/my-theme-1.0.0.zip');
const result = await validateThemeZip(buffer);

if (!result.ok) {
  console.error(result.errors);
}
```

### `parseThemeManifestFromZip(buffer)`

Parses and validates only the theme manifest from a ZIP and returns:

```js
{
  name: 'My Theme',
  namespace: 'my-studio',
  slug: 'my-theme',
  version: '1.0.0',
  license: 'MIT',
  runtime: '0.2',
  description: 'Optional description'
}
```

This throws when:

- `theme.json` is missing
- `theme.json` is invalid JSON
- the manifest violates the runtime contract
- the ZIP root layout is invalid

### `validateThemeFiles(fileMap, options?)`

Validates an already-loaded virtual file map.

Accepted inputs:

- `Map<string, string | Uint8Array | ArrayBuffer>`
- `Record<string, string | Uint8Array | ArrayBuffer>`

This is intended for:

- directory-based validation
- worker-side already-loaded uploads
- tests and internal adapters

Directory callers can also pass `pathEntries` for path traversal and symlink validation:

```js
const result = await validateThemeFiles(files, {
  pathEntries: [
    {
      path: 'partials/header.html',
      isSymlink: false,
    },
    {
      path: 'escape-link',
      isSymlink: true,
      resolvedPath: '/real/target',
      rootRealPath: '/theme/root',
    },
  ],
});
```

### `detectBasePrefix(filePaths)`

Detects whether a ZIP is:

- root-flat: returns `''`
- wrapped in exactly one top-level folder: returns `'folder/'`

For invalid or mixed multi-root layouts it returns `''`. Use `validateThemeZip()` or `parseThemeManifestFromZip()` for full ZIP layout enforcement.

---

## Result Shape

`validateThemeZip()` and `validateThemeFiles()` return:

```js
{
  ok: true,
  errors: [],
  warnings: [],
  manifest: {
    name: 'My Theme',
    namespace: 'my-studio',
    slug: 'my-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.2',
    description: 'Optional'
  },
  checkedFiles: 6
}
```

Issue objects use this shape:

```js
{
  code: 'MISSING_REQUIRED_FILE',
  path: 'assets/style.css',
  message: "Required file 'assets/style.css' is missing",
  severity: 'error'
}
```

---

## Validation Profile

### Errors

- `theme.json` missing or invalid
- Missing required templates: `layout.html`, `index.html`, `post.html`, `page.html`
- Missing `assets/style.css`
- Invalid semver in `theme.json.version`
- Missing or invalid `theme.json.namespace`
- Missing or invalid `theme.json.slug`
- Missing or invalid `theme.json.license`
- Missing or invalid `theme.json.runtime`
- `layout.html` missing or duplicating `{{slot:content}}`
- Unknown slot names
- Nested slot expressions
- Mustache block syntax
- `<script>` inside `layout.html`
- Path traversal or symlink escape
- Invalid ZIP root layout

### Warnings

- `archive.html`, `category.html`, `tag.html` missing
- `post.html` missing `{{post.comments_html}}`
- `{{post.comments_html}}` used outside `post.html`

---

## Requirements

- Node.js >= 18.18.0
- ESM only

---

## Related

- [zeropress-theme](https://www.npmjs.com/package/zeropress-theme)
- [create-zeropress-theme](https://www.npmjs.com/package/create-zeropress-theme)
- [ZeroPress Theme Runtime Spec v0.2](https://zeropress.dev/spec/theme-runtime-v0.2.html)

---

## License

MIT
