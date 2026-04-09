import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME,
  validateNamespace,
  validateSlug,
  validateThemeManifest,
  validateThemeFiles,
} from '../src/index.js';

function createValidThemeFiles() {
  return {
    'theme.json': JSON.stringify({
      name: 'Test Theme',
      namespace: 'test-studio',
      slug: 'test-theme',
      version: '1.0.0',
      license: 'MIT',
      runtime: '0.2',
      description: 'A test theme',
    }),
    'layout.html': '<main>{{slot:content}}</main>',
    'index.html': '<h1>{{site.title}}</h1>',
    'post.html': '<article>{{post.title}}{{post.comments_html}}</article>',
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
    runtime: '0.2',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
});

test('validateThemeFiles accepts a valid v0.2 manifest without author', async () => {
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
    runtime: '0.2',
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.slug, 'test-theme');
});

test('validateThemeFiles requires license', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    runtime: '0.2',
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
    runtime: '0.2',
  });
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LICENSE'), true);
});

test('validateThemeFiles requires runtime 0.2', async () => {
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

test('validateThemeFiles rejects invalid namespace and slug manifest fields', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'Bad_Namespace',
    slug: 'bad--slug',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.2',
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
    runtime: '0.2',
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

test('validateThemeFiles reports forbidden Mustache blocks', async () => {
  const files = createValidThemeFiles();
  files['index.html'] = '{{#if site.title}}ok{{/if}}';
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MUSTACHE_BLOCK_NOT_ALLOWED'), true);
});

test('validateThemeFiles reports script tags in layout.html', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = '<main>{{slot:content}}</main><script>alert(1)</script>';
  const result = await validateThemeFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'LAYOUT_SCRIPT_NOT_ALLOWED'), true);
});

test('validateThemeFiles warns on missing optional templates and comment placeholder misuse', async () => {
  const files = createValidThemeFiles();
  delete files['post.html'];
  files['post.html'] = '<article>{{post.title}}</article>';
  files['index.html'] = `<h1>{{site.title}}</h1>${'{{post.comments_html}}'}`;
  const result = await validateThemeFiles(files);
  assert.equal(result.warnings.some((issue) => issue.code === 'MISSING_OPTIONAL_TEMPLATE' && issue.path === 'archive.html'), true);
  assert.equal(result.warnings.some((issue) => issue.code === 'MISSING_POST_COMMENTS_PLACEHOLDER'), true);
  assert.equal(result.warnings.some((issue) => issue.code === 'COMMENTS_PLACEHOLDER_OUTSIDE_POST_TEMPLATE'), true);
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
  await fs.access(new URL('../schemas/theme.v0.2.runtime.schema.json', import.meta.url));
});
