import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME,
  THEME_RUNTIME_V0_4,
  validateNamespace,
  validateSlug,
  validateThemeManifest,
  validateThemeFiles,
} from '../src/index.js';

function createValidThemeFiles(runtime = DEFAULT_RUNTIME) {
  return {
    'theme.json': JSON.stringify({
      name: 'Test Theme',
      namespace: 'test-studio',
      slug: 'test-theme',
      version: '1.0.0',
      license: 'MIT',
      runtime,
      description: 'A test theme',
    }),
    'layout.html': '<main>{{slot:content}}</main>',
    'index.html': '<h1>{{site.title}}</h1>',
    'post.html': '<article>{{post.title}}</article>',
    'page.html': '<section>{{page.title}}</section>',
    'assets/style.css': 'body { color: black; }',
    'partials/header.html': '<header>Header</header>',
  };
}

test('validateThemeFiles accepts a valid file map', async () => {
  const result = await validateThemeFiles(createValidThemeFiles());
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.manifest?.version, '1.0.0');
});

test('validateThemeFiles reports missing theme.json', async () => {
  const files = createValidThemeFiles();
  delete files['theme.json'];
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /theme\.json/i);
});

test('validateThemeFiles reports invalid theme.json JSON', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = '{';
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_JSON'), true);
});

test('validateThemeFiles reports missing required files', async () => {
  const files = createValidThemeFiles();
  delete files['assets/style.css'];
  delete files['post.html'];
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.path === 'assets/style.css'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'post.html'), true);
});

test('validateThemeFiles reports invalid semver', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0',
    license: 'MIT',
    runtime: '0.4',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
});

test('validateThemeFiles accepts a valid v0.4 manifest without author', async () => {
  const result = await validateThemeFiles(createValidThemeFiles());
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.author, undefined);
  assert.equal(result.manifest?.runtime, DEFAULT_RUNTIME);
});

test('validateNamespace and validateSlug share runtime rules', () => {
  assert.equal(validateNamespace('my-company'), 'my-company');
  assert.equal(validateSlug('mytheme1'), 'mytheme1');
  assert.throws(() => validateNamespace('My Company'), /Namespace must use lowercase/);
  assert.throws(() => validateSlug('My Theme'), /Theme slug must use lowercase/);
});

test('validateThemeManifest validates manifest-only input', () => {
  const result = validateThemeManifest({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.slug, 'test-theme');
});

test('validateThemeFiles and validateThemeManifest return the same normalized manifest', async () => {
  const themeJson = {
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    author: 'ZeroPress',
    description: 'A test theme',
    features: {
      comments: true,
      newsletter: false,
    },
    menuSlots: {
      primary: {
        title: 'Primary Menu',
      },
    },
    widgetAreas: {
      sidebar: {
        title: 'Sidebar Widgets',
      },
    },
  };

  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['theme.json'] = JSON.stringify(themeJson);

  const filesResult = await validateThemeFiles(files);
  const manifestResult = validateThemeManifest(themeJson);

  assert.equal(filesResult.ok, true);
  assert.equal(manifestResult.ok, true);
  assert.deepEqual(filesResult.manifest, manifestResult.manifest);
});

test('validateThemeFiles requires license', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    runtime: '0.4',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.message.includes("'license'")), true);
});

test('validateThemeFiles rejects invalid license values', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'ISC',
    runtime: '0.4',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LICENSE'), true);
});

test('validateThemeFiles rejects unsupported runtime versions', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.1',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_RUNTIME_VERSION'), true);
});

test('validateThemeFiles accepts runtime 0.4 manifests', async () => {
  const result = await validateThemeFiles(createValidThemeFiles(THEME_RUNTIME_V0_4));
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.runtime, THEME_RUNTIME_V0_4);
});

test('validateThemeFiles accepts valid features metadata', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    features: {
      comments: true,
      newsletter: false,
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.features?.comments, true);
  assert.equal(result.manifest?.features?.newsletter, false);
});

test('validateThemeFiles rejects unknown theme features', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    features: {
      comments: true,
      contact: true,
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_FEATURE'), true);
});

test('validateThemeFiles rejects non-boolean theme feature values', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    features: {
      comments: 'yes',
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_FEATURE_VALUE'), true);
});

test('validateThemeFiles accepts supported v0.4 control-flow and comment syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = `
{{! inline note }}
{{#if widgets.sidebar.items}}
  {{#for widget in widgets.sidebar.items}}
    {{#if_eq widget.type "profile"}}
      <section>{{widget.title}}</section>
    {{#else}}
      <p>fallback</p>
    {{/if_eq}}
  {{/for}}
{{/if}}
{{!-- block note --}}
`;

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles accepts supported v0.4 partial syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';
  files['partials/sidebar-widgets.html'] = '<section>{{#if site.title}}{{site.title}}{{/if}}</section>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects runtime 0.3 manifests', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.3',
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_RUNTIME_VERSION'), true);
});

test('validateThemeFiles rejects missing partial references', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MISSING_PARTIAL'), true);
});

test('validateThemeFiles rejects circular partial references', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';
  files['partials/sidebar-widgets.html'] = '{{partial:sidebar/profile}}';
  files['partials/sidebar/profile.html'] = '{{partial:sidebar-widgets}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'PARTIAL_CYCLE'), true);
});

test('validateThemeFiles rejects v0.4 duplicate else blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '{{#if widgets.sidebar.items}}A{{#else}}B{{#else}}C{{/if}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'DUPLICATE_TEMPLATE_ELSE'), true);
});

test('validateThemeFiles rejects unsupported v0.4 tags', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '{{#if_neq widget.type "profile"}}x{{/if_neq}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_TAG'), true);
});

test('validateThemeFiles rejects malformed v0.4 comments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_4);
  files['index.html'] = '{{!-- broken';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MALFORMED_TEMPLATE_COMMENT'), true);
});

test('validateThemeFiles rejects invalid namespace and slug manifest fields', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'Bad_Namespace',
    slug: 'bad--slug',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_NAMESPACE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SLUG'), true);
});

test('validateThemeFiles rejects manifest fields that exceed max lengths', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'N'.repeat(81),
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    author: 'A'.repeat(81),
    description: 'D'.repeat(281),
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_NAME'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_AUTHOR'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_DESCRIPTION'), true);
});

test('validateThemeFiles reports invalid layout slot usage', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = '<main>{{slot:content}}{{slot:content}}</main>';
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LAYOUT_SLOT'), true);
});

test('validateThemeFiles accepts valid menuSlots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    menuSlots: {
      primary: {
        title: 'Primary Menu',
        description: 'Main header navigation',
      },
      sidebar: {
        title: 'Sidebar Menu',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.menuSlots?.primary?.title, 'Primary Menu');
});

test('validateThemeFiles allows menuSlots that reuse template slot names', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    menuSlots: {
      header: {
        title: 'Header Menu',
      },
      footer: {
        title: 'Footer Menu',
      },
      content: {
        title: 'In-Content Menu',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.menuSlots?.footer?.title, 'Footer Menu');
});

test('validateThemeFiles rejects invalid menuSlots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    menuSlots: {
      'Bad Slot': {
        title: 'Bad Slot',
      },
      primary: {
        title: '',
        extra: true,
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_MENU_SLOT_ID'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_MENU_SLOT_TITLE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_MENU_SLOT_PROPERTY'), true);
});

test('validateThemeFiles accepts valid widgetAreas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    widgetAreas: {
      sidebar: {
        title: 'Sidebar Widgets',
        description: 'Widgets shown next to article content',
      },
      header: {
        title: 'Header Widgets',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.widgetAreas?.sidebar?.title, 'Sidebar Widgets');
});

test('validateThemeFiles allows widgetAreas that reuse template slot names', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    widgetAreas: {
      header: {
        title: 'Header Widgets',
      },
      footer: {
        title: 'Footer Widgets',
      },
      content: {
        title: 'Inline Content Widgets',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.widgetAreas?.footer?.title, 'Footer Widgets');
});

test('validateThemeFiles rejects invalid widgetAreas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    widgetAreas: {
      'Bad Area': {
        title: 'Bad Area',
      },
      sidebar: {
        title: '',
        extra: true,
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_WIDGET_AREA_ID'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_WIDGET_AREA_TITLE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_WIDGET_AREA_PROPERTY'), true);
});

test('validateThemeFiles rejects empty widgetAreas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    widgetAreas: {},
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_WIDGET_AREAS'), true);
});

test('validateThemeFiles accepts menuSlots and widgetAreas together', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
    menuSlots: {
      primary: {
        title: 'Primary Menu',
      },
    },
    widgetAreas: {
      sidebar: {
        title: 'Sidebar Widgets',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.menuSlots?.primary?.title, 'Primary Menu');
  assert.equal(result.manifest?.widgetAreas?.sidebar?.title, 'Sidebar Widgets');
});

test('validateThemeFiles reports script tags in layout.html', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = '<main>{{slot:content}}</main><script>alert(1)</script>';
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'LAYOUT_SCRIPT_NOT_ALLOWED'), true);
});

test('validateThemeFiles warns on missing optional templates', async () => {
  const files = createValidThemeFiles();
  delete files['archive.html'];
  const result = await validateThemeFiles(files);
  assert.equal(result.warnings.some((issue) => issue.code === 'MISSING_OPTIONAL_TEMPLATE' && issue.path === 'archive.html'), true);
});

test('validateThemeFiles reports path traversal and symlink escape', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-validator-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-validator-outside-'));
  const linkPath = path.join(root, 'escape-link');
  await fs.symlink(outside, linkPath);

  const result = await validateThemeFiles(createValidThemeFiles(), {
    pathEntries: [
      { path: '../secret.txt' },
      {
        path: 'escape-link',
        isSymlink: true,
        resolvedPath: await fs.realpath(linkPath),
        rootRealPath: await fs.realpath(root),
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'PATH_ESCAPE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'SYMLINK_ESCAPE'), true);

  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

test('validateThemeFiles rejects symlink targets that only share the same string prefix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-validator-root-'));
  const prefixSibling = `${root}-escape`;
  await fs.mkdir(prefixSibling, { recursive: true });
  const linkPath = path.join(root, 'prefix-link');
  await fs.symlink(prefixSibling, linkPath);

  const result = await validateThemeFiles(createValidThemeFiles(), {
    pathEntries: [
      {
        path: 'prefix-link',
        isSymlink: true,
        resolvedPath: await fs.realpath(linkPath),
        rootRealPath: await fs.realpath(root),
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'SYMLINK_ESCAPE'), true);

  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(prefixSibling, { recursive: true, force: true });
});

test('published schema files are stored outside src', async () => {
  await fs.access(new URL('../schemas/theme.v0.4.runtime.schema.json', import.meta.url));
});
