# @zeropress/theme-validator

![npm](https://img.shields.io/npm/v/%40zeropress%2Ftheme-validator)
![license](https://img.shields.io/npm/l/%40zeropress%2Ftheme-validator)
![node](https://img.shields.io/node/v/%40zeropress%2Ftheme-validator)

Shared validation core for ZeroPress theme manifests and directory-backed file maps.

This package is the single source of truth for runtime theme validation used by:

- [@zeropress/theme](https://www.npmjs.com/package/@zeropress/theme)
- `backend_api_v2`
- `themes.zeropress.org-api`

It implements the current runtime v0.6 validation rules defined in [ZeroPress Theme Runtime Spec v0.6](https://zeropress.dev/spec/theme-runtime-v0.6.html).

---

## Install

```bash
npm install @zeropress/theme-validator
```

---

## Exports

```js
import {
  DEFAULT_RUNTIME,
  validateNamespace,
  validateSlug,
  validateThemeManifest,
  validateThemeFiles,
} from '@zeropress/theme-validator';
```

Schema exports:

```js
import runtimeSchemaUrl from '@zeropress/theme-validator/theme.v0.6.runtime.schema.json';
```

Published schema files are shipped from the package `schemas/` directory, and package subpath exports are versioned.

---

## API

### `validateNamespace(value)` / `validateSlug(value)`

Shared identifier helpers for scaffolding and submission flows.

- `validateNamespace(value)` returns the normalized namespace string or throws
- `validateSlug(value)` returns the validated slug string or throws

### `validateThemeManifest(themeJson)`

Validates manifest-only input without requiring theme files.

This is intended for:

- scaffolding tools
- manifest-only prechecks
- tests that need runtime contract checks without packaging

### `validateThemeFiles(fileMap, options?)`

Validates an already-loaded virtual file map.

Accepted inputs:

- `Map<string, string | Uint8Array | ArrayBuffer>`
- `Record<string, string | Uint8Array | ArrayBuffer>`

This is intended for:

- directory-based validation
- worker-side already-loaded uploads after unzip
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

## Result Shape

`validateThemeFiles()` returns:

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
    license: 'LicenseRef-Commercial',
    runtime: '0.6',
    description: 'Optional',
    links: {
      homepage: 'https://example.com/theme',
      support: 'mailto:support@example.com',
      license: 'https://example.com/theme/license',
    },
    menu_slots: {
      primary: {
        title: 'Primary Menu',
      },
    },
    widget_areas: {
      sidebar: {
        title: 'Sidebar Widgets',
      },
    },
    site_meta: {
      issue: {
        title: 'Issue',
        type: 'string',
      },
    },
    collection_slots: {
      'cover-story': {
        title: 'Cover Story',
      },
    },
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
- Invalid `LicenseRef-*` theme license identifier
- Invalid `theme.json.links`
- Missing or invalid `theme.json.runtime`
- `theme.json.name` longer than 80 characters
- `theme.json.author` longer than 80 characters
- `theme.json.description` longer than 280 characters
- Unknown root fields in `theme.json`
- Invalid `theme.json.menu_slots`
- Invalid `theme.json.widget_areas`
- Invalid `theme.json.site_meta`
- Invalid `theme.json.collection_slots`
- Invalid menu slot ids
- Invalid menu slot definitions or unknown slot properties
- Invalid widget area ids
- Invalid widget area definitions or unknown widget area properties
- Removed `theme.json.settings`
- `layout.html` missing or duplicating `{{slot:content}}`
- Unknown slot names
- Nested slot expressions
- Mustache block syntax
- `<script>` inside `layout.html`
- Path traversal or symlink escape

### Warnings

- `archive.html`, `category.html`, `tag.html` missing
---

## Requirements

- Node.js >= 18.18.0
- ESM only

---

## Related

- [@zeropress/theme](https://www.npmjs.com/package/@zeropress/theme)
- [create-zeropress-theme](https://www.npmjs.com/package/create-zeropress-theme)
- [ZeroPress Theme Runtime Spec v0.6](https://zeropress.dev/spec/theme-runtime-v0.6.html)

---

## License

MIT
