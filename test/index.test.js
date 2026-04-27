import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME,
  THEME_RUNTIME_V0_5,
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
    runtime: '0.5',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
});

test('validateThemeFiles accepts a valid v0.5 manifest without author', async () => {
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
    $schema: 'https://zeropress.dev/schemas/theme.v0.5.runtime.schema.json',
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.slug, 'test-theme');
});

test('validateThemeManifest rejects non-string root $schema editor hint', () => {
  const result = validateThemeManifest({
    $schema: true,
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SCHEMA_HINT'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.$schema'), true);
});

test('validateThemeFiles and validateThemeManifest return the same normalized manifest', async () => {
  const themeJson = {
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
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

  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
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
    runtime: '0.5',
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
    runtime: '0.5',
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

test('validateThemeFiles accepts runtime 0.5 manifests', async () => {
  const result = await validateThemeFiles(createValidThemeFiles(THEME_RUNTIME_V0_5));
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.runtime, THEME_RUNTIME_V0_5);
});

test('validateThemeFiles accepts valid features metadata', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
    features: {
      comments: 'yes',
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_FEATURE_VALUE'), true);
});

test('validateThemeFiles accepts supported v0.5 control-flow and comment syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
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

test('validateThemeFiles accepts internal hyphens in template path segments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
    menuSlots: {
      'docs-sidebar': {
        title: 'Docs Sidebar',
      },
    },
  });
  files['index.html'] = `
{{#if menus.docs-sidebar.items}}
  {{#for section in menus.docs-sidebar.items}}
    {{#if section.custom-title}}
      <section>{{section.custom-title}}</section>
    {{#else_if section.fallback-title}}
      <section>{{section.fallback-title}}</section>
    {{/if}}
    {{#if_eq section.custom-kind "guide"}}
      <span>{{section.custom-kind}}</span>
    {{/if_eq}}
  {{/for}}
{{/if}}
`;

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects malformed hyphenated template path segments', async () => {
  for (const invalidPath of ['menus.-bad.items', 'menus.bad-.items', 'menus.bad--key.items']) {
    const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
    files['index.html'] = `
{{#if ${invalidPath}}}x{{/if}}
{{${invalidPath}}}
`;

    const result = await validateThemeFiles(files);
    assert.equal(result.ok, false, invalidPath);
    assert.equal(
      result.errors.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_TAG'),
      true,
      invalidPath,
    );
  }
});

test('validateThemeFiles accepts supported v0.5 partial syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MISSING_PARTIAL'), true);
});

test('validateThemeFiles rejects circular partial references', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';
  files['partials/sidebar-widgets.html'] = '{{partial:sidebar/profile}}';
  files['partials/sidebar/profile.html'] = '{{partial:sidebar-widgets}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'PARTIAL_CYCLE'), true);
});

test('validateThemeFiles rejects v0.5 duplicate else blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{#if widgets.sidebar.items}}A{{#else}}B{{#else}}C{{/if}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'DUPLICATE_TEMPLATE_ELSE'), true);
});

test('validateThemeFiles rejects unsupported v0.5 tags', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{#if_neq widget.type "profile"}}x{{/if_neq}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_TAG'), true);
});

test('validateThemeFiles rejects malformed v0.5 comments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{!-- broken';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MALFORMED_TEMPLATE_COMMENT'), true);
});

test('validateThemeFiles rejects runtime 0.4 manifests', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.4',
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_RUNTIME_VERSION'), true);
});

test('validateThemeFiles accepts loop metadata inside for blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = `
{{#for post in posts.items}}
  <article data-index="{{loop.index}}">
    {{#if loop.first}}<span>first</span>{{#else_if loop.last}}<span>last</span>{{/if}}
  </article>
{{/for}}
`;

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles allows loop metadata inside partial files', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{#for post in posts.items}}{{partial:post-list-item}}{{/for}}';
  files['partials/post-list-item.html'] = '<article data-index="{{loop.index}}">{{post.title}}</article>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects loop metadata outside for blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '<p>{{loop.index}}</p>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LOOP_REFERENCE'), true);
});

test('validateThemeFiles accepts partial arguments with string and boolean literals', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{partial:sidebar/card variant="compact" show_excerpt=true}}';
  files['partials/sidebar/card.html'] = '{{#if partial.show_excerpt}}<p>{{partial.variant}}</p>{{/if}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects invalid partial arguments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_5);
  files['index.html'] = '{{partial:sidebar/card variant="compact" variant=false count=2}}';
  files['partials/sidebar/card.html'] = '<p>Card</p>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_PARTIAL_REFERENCE'), true);
});

test('validateThemeFiles accepts else_if_eq chains and rejects invalid ordering', async () => {
  const validFiles = createValidThemeFiles(THEME_RUNTIME_V0_5);
  validFiles['index.html'] = `
{{#if_eq widget.type "profile"}}
  <p>profile</p>
{{#else_if_eq widget.type "search"}}
  <p>search</p>
{{#else}}
  <p>fallback</p>
{{/if_eq}}
`;

  const validResult = await validateThemeFiles(validFiles);
  assert.equal(validResult.ok, true);

  const invalidFiles = createValidThemeFiles(THEME_RUNTIME_V0_5);
  invalidFiles['index.html'] = `
{{#if widget.title}}
  <p>a</p>
{{#else}}
  <p>b</p>
{{#else_if widget.subtitle}}
  <p>c</p>
{{/if}}
`;

  const invalidResult = await validateThemeFiles(invalidFiles);
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.errors.some((issue) => issue.code === 'INVALID_TEMPLATE_BRANCH_ORDER'), true);
});

test('validateThemeFiles rejects invalid namespace and slug manifest fields', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'Bad_Namespace',
    slug: 'bad--slug',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
    runtime: '0.5',
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
  await fs.access(new URL('../schemas/theme.v0.5.runtime.schema.json', import.meta.url));
});
