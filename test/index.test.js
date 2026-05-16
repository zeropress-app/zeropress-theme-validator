import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME,
  THEME_RUNTIME_V0_6,
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
    runtime: '0.6',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
});

test('validateThemeFiles accepts a valid v0.6 manifest without author', async () => {
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
    $schema: 'https://zeropress.dev/schemas/theme.v0.6.runtime.schema.json',
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.slug, 'test-theme');
});

test('validateThemeManifest accepts LicenseRef licenses and theme links', () => {
  const result = validateThemeManifest({
    name: 'Commercial Theme',
    namespace: 'test-studio',
    slug: 'commercial-theme',
    version: '1.0.0',
    license: 'LicenseRef-ThemeForest-Regular',
    runtime: '0.6',
    links: {
      homepage: 'https://example.com/theme',
      repository: 'https://github.com/example/theme',
      documentation: 'https://example.com/theme/docs',
      support: 'mailto:support@example.com',
      marketplace: 'https://themeforest.net/item/theme/123',
      license: 'https://themeforest.net/licenses/standard',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.license, 'LicenseRef-ThemeForest-Regular');
  assert.equal(result.manifest?.links?.support, 'mailto:support@example.com');
});

test('validateThemeManifest rejects non-string root $schema editor hint', () => {
  const result = validateThemeManifest({
    $schema: true,
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
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
    runtime: '0.6',
    author: 'ZeroPress',
    description: 'A test theme',
    features: {
      comments: true,
      newsletter: false,
      post_index: true,
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
      show_sponsor_banner: {
        title: 'Show Sponsor Banner',
        type: 'boolean',
        default: false,
      },
    },
    collection_slots: {
      'cover-story': {
        title: 'Cover Story',
      },
    },
  };

  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify(themeJson);

  const filesResult = await validateThemeFiles(files);
  const manifestResult = validateThemeManifest(themeJson);

  assert.equal(filesResult.ok, true);
  assert.equal(manifestResult.ok, true);
  assert.deepEqual(filesResult.manifest, manifestResult.manifest);
});

test('validateThemeFiles rejects unknown root manifest fields and removed settings', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    settings: {
      accent: 'blue',
    },
    routes: {},
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.settings'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.routes'), true);
});

test('validateThemeFiles requires license', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    runtime: '0.6',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.message.includes("'license'")), true);
});

test('validateThemeFiles rejects invalid license values', async () => {
  for (const license of ['ISC', 'LicenseRef-', 'LicenseRef-Commercial License', 'LicenseRef-theme/custom']) {
    const files = createValidThemeFiles();
    files['theme.json'] = JSON.stringify({
      name: 'Test Theme',
      namespace: 'test-studio',
      slug: 'test-theme',
      version: '1.0.0',
      license,
      runtime: '0.6',
    });
    const result = await validateThemeFiles(files);
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LICENSE'), true);
  }
});

test('validateThemeFiles rejects invalid theme links', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    links: {
      homepage: '/local-theme',
      support: '',
      unknown: 'https://example.com',
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.links.homepage'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.links.support'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'theme.json.links.unknown'), true);
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
  const issue = result.errors.find((entry) => entry.code === 'INVALID_RUNTIME_VERSION');
  assert.equal(Boolean(issue), true);
  assert.equal(issue?.category, 'theme_manifest');
  assert.match(issue?.hint || '', /"runtime": "0\.6"/);
});

test('validateThemeFiles accepts runtime 0.6 manifests', async () => {
  const result = await validateThemeFiles(createValidThemeFiles(THEME_RUNTIME_V0_6));
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.runtime, THEME_RUNTIME_V0_6);
});

test('validateThemeFiles accepts valid features metadata', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    features: {
      comments: true,
      newsletter: false,
      post_index: true,
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.features?.comments, true);
  assert.equal(result.manifest?.features?.newsletter, false);
  assert.equal(result.manifest?.features?.post_index, true);
});

test('validateThemeFiles rejects unknown theme features', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    features: {
      comments: true,
      postIndex: true,
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  const issue = result.errors.find((entry) => entry.code === 'INVALID_THEME_FEATURE');
  assert.equal(Boolean(issue), true);
  assert.match(issue?.hint || '', /post_index/);
});

test('validateThemeFiles hints v0.6 snake_case root manifest fields', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    menuSlots: {},
    widgetAreas: {},
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  const menuIssue = result.errors.find((issue) => issue.path === 'theme.json.menuSlots');
  const widgetIssue = result.errors.find((issue) => issue.path === 'theme.json.widgetAreas');
  assert.equal(menuIssue?.category, 'theme_manifest');
  assert.match(menuIssue?.hint || '', /menu_slots/);
  assert.match(widgetIssue?.hint || '', /widget_areas/);
});

test('validateThemeFiles rejects non-boolean theme feature values', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    features: {
      comments: 'yes',
      post_index: 'no',
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_FEATURE_VALUE'), true);
});

test('validateThemeFiles accepts supported v0.6 control-flow and comment syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
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

test('validateThemeFiles accepts v0.6 comparison helpers', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = `
{{#for item in items}}{{#if_eq loop.index 4}}number{{/if_eq}}{{#if_neq loop.last true}},{{/if_neq}}{{/for}}
{{#if_eq site.footer.attribution true}}footer{{/if_eq}}
{{#if_eq route.url item.url}}active{{/if_eq}}
{{#if_in route.type "post" "page" "front_page" 4 "tag"}}content{{/if_in}}
{{#if_starts_with route.url item.url}}active{{/if_starts_with}}
{{#if_neq route.type "post"}}not-post{{#else_if_neq route.type "page"}}not-page{{/if_neq}}
{{#if_in route.type "tag"}}tag{{#else_if_in route.type "post" "page"}}content{{/if_in}}
{{#if_starts_with route.url "/blog/"}}blog{{#else_if_starts_with route.url "/docs/"}}docs{{/if_starts_with}}
`;

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects malformed v0.6 comparison helpers', async () => {
  for (const template of [
    '{{#if_eq site.footer.attribution}}bad{{/if_eq}}',
    '{{#if_in route.type}}bad{{/if_in}}',
    '{{#if_eq route.type post page}}bad{{/if_eq}}',
    '{{#if_eq route.type "post"}}bad{{/if_neq}}',
    '{{#if_eq route.type "post"}}ok{{#else_if_in route.type "page"}}bad{{/if_eq}}',
  ]) {
    const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
    files['index.html'] = template;

    const result = await validateThemeFiles(files);
    assert.equal(result.ok, false, template);
  }
});

test('validateThemeFiles accepts internal hyphens in template path segments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    menu_slots: {
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
    const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
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

test('validateThemeFiles accepts supported v0.6 partial syntax', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MISSING_PARTIAL'), true);
});

test('validateThemeFiles rejects circular partial references', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '<aside>{{partial:sidebar-widgets}}</aside>';
  files['partials/sidebar-widgets.html'] = '{{partial:sidebar/profile}}';
  files['partials/sidebar/profile.html'] = '{{partial:sidebar-widgets}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'PARTIAL_CYCLE'), true);
});

test('validateThemeFiles rejects v0.6 duplicate else blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '{{#if widgets.sidebar.items}}A{{#else}}B{{#else}}C{{/if}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'DUPLICATE_TEMPLATE_ELSE'), true);
});

test('validateThemeFiles rejects unsupported v0.6 tags', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '{{#if_gt widget.count 2}}x{{/if_gt}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_TAG'), true);
});

test('validateThemeFiles rejects malformed v0.6 comments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
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
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '{{#for post in posts.items}}{{partial:post-list-item}}{{/for}}';
  files['partials/post-list-item.html'] = '<article data-index="{{loop.index}}">{{post.title}}</article>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects loop metadata outside for blocks', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '<p>{{loop.index}}</p>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LOOP_REFERENCE'), true);
});

test('validateThemeFiles accepts partial arguments with string and boolean literals', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '{{partial:sidebar/card variant="compact" show_excerpt=true}}';
  files['partials/sidebar/card.html'] = '{{#if partial.show_excerpt}}<p>{{partial.variant}}</p>{{/if}}';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
});

test('validateThemeFiles rejects invalid partial arguments', async () => {
  const files = createValidThemeFiles(THEME_RUNTIME_V0_6);
  files['index.html'] = '{{partial:sidebar/card variant="compact" variant=false count=2}}';
  files['partials/sidebar/card.html'] = '<p>Card</p>';

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_PARTIAL_REFERENCE'), true);
});

test('validateThemeFiles accepts else_if_eq chains and rejects invalid ordering', async () => {
  const validFiles = createValidThemeFiles(THEME_RUNTIME_V0_6);
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

  const invalidFiles = createValidThemeFiles(THEME_RUNTIME_V0_6);
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
    runtime: '0.6',
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
    runtime: '0.6',
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

test('validateThemeFiles accepts valid menu_slots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    menu_slots: {
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
  assert.equal(result.manifest?.menu_slots?.primary?.title, 'Primary Menu');
});

test('validateThemeFiles allows menu_slots that reuse template slot names', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    menu_slots: {
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
  assert.equal(result.manifest?.menu_slots?.footer?.title, 'Footer Menu');
});

test('validateThemeFiles rejects invalid menu_slots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    menu_slots: {
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

test('validateThemeFiles accepts valid widget_areas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    widget_areas: {
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
  assert.equal(result.manifest?.widget_areas?.sidebar?.title, 'Sidebar Widgets');
});

test('validateThemeFiles allows widget_areas that reuse template slot names', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    widget_areas: {
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
  assert.equal(result.manifest?.widget_areas?.footer?.title, 'Footer Widgets');
});

test('validateThemeFiles rejects invalid widget_areas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    widget_areas: {
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

test('validateThemeFiles rejects empty widget_areas metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    widget_areas: {},
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_WIDGET_AREAS'), true);
});

test('validateThemeFiles accepts menu_slots and widget_areas together', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
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
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.menu_slots?.primary?.title, 'Primary Menu');
  assert.equal(result.manifest?.widget_areas?.sidebar?.title, 'Sidebar Widgets');
});

test('validateThemeFiles accepts valid site_meta and collection_slots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    site_meta: {
      issue: {
        title: 'Issue',
        description: 'Issue label displayed near the masthead',
        type: 'string',
        default: 'Spring 2026',
      },
      show_sponsor_banner: {
        title: 'Show Sponsor Banner',
        type: 'boolean',
        default: false,
      },
    },
    collection_slots: {
      'cover-story': {
        title: 'Cover Story',
        description: 'Primary featured content area',
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.site_meta?.issue?.type, 'string');
  assert.equal(result.manifest?.collection_slots?.['cover-story']?.title, 'Cover Story');
});

test('validateThemeFiles rejects invalid site_meta and collection_slots metadata', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.6',
    site_meta: {
      'Bad Key': {
        title: 'Bad',
      },
      issue: {
        title: '',
        type: 'object',
        default: {},
        extra: true,
      },
      show_sponsor_banner: {
        title: 'Show Sponsor Banner',
        type: 'boolean',
        default: 'false',
      },
    },
    collection_slots: {
      'Bad Slot': {
        title: 'Bad Slot',
      },
      'cover-story': {
        title: '',
        extra: true,
      },
    },
  });

  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SITE_META_KEY'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SITE_META_TITLE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SITE_META_TYPE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SITE_META_DEFAULT'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SITE_META_PROPERTY'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_COLLECTION_SLOT_ID'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_COLLECTION_SLOT_TITLE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_COLLECTION_SLOT_PROPERTY'), true);
});

test('validateThemeFiles reports script tags in layout.html', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = [
    '<html>',
    '<body>',
    '<main>{{slot:content}}</main><script>alert(1)</script>',
    '</body>',
    '</html>',
  ].join('\n');
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  const issue = result.errors.find((entry) => entry.code === 'LAYOUT_SCRIPT_NOT_ALLOWED');
  assert.equal(issue?.path, 'layout.html');
  assert.equal(issue?.line, 3);
  assert.equal(issue?.category, 'theme_validation');
  assert.match(issue?.hint || '', /partial:content-enhancements/);
  assert.equal(issue?.snippet?.line, '<main>{{slot:content}}</main><script>alert(1)</script>');
  assert.match(issue?.snippet?.pointer || '', /\^/);
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
  await fs.access(new URL('../schemas/theme.v0.6.runtime.schema.json', import.meta.url));
});
