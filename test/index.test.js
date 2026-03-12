import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  detectBasePrefix,
  parseThemeManifestFromZip,
  validateThemeFiles,
  validateThemeZip,
} from '../src/index.js';

function createValidThemeFiles() {
  return {
    'theme.json': JSON.stringify({
      name: 'Test Theme',
      version: '1.0.0',
      author: 'ZeroPress',
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

async function createZip(files, options = {}) {
  const zip = new JSZip();
  const prefix = options.prefix || '';

  for (const [filePath, content] of Object.entries(files)) {
    zip.file(`${prefix}${filePath}`, content);
  }

  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

test('detectBasePrefix handles root and single-folder zips', () => {
  assert.equal(detectBasePrefix(['theme.json', 'layout.html']), '');
  assert.equal(detectBasePrefix(['my-theme/theme.json', 'my-theme/layout.html']), 'my-theme/');
  assert.equal(detectBasePrefix(['theme-a/theme.json', 'theme-b/layout.html']), '');
});

test('validateThemeZip accepts a valid root-level zip', async () => {
  const result = await validateThemeZip(await createZip(createValidThemeFiles()));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.manifest?.version, '1.0.0');
});

test('validateThemeZip accepts a valid single-folder zip', async () => {
  const result = await validateThemeZip(await createZip(createValidThemeFiles(), { prefix: 'my-theme/' }));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('validateThemeZip rejects multi-root zips with nested theme.json', async () => {
  const buffer = await createZip({
    ...createValidThemeFiles(),
    'extra/readme.txt': 'extra',
  }, { prefix: 'theme-a/' });

  const mixedZip = await JSZip.loadAsync(buffer);
  mixedZip.file('theme-b/other.txt', 'other');
  const result = await validateThemeZip(await mixedZip.generateAsync({ type: 'uint8array' }));

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_ZIP_ROOT'), true);
});

test('parseThemeManifestFromZip rejects multi-root zips with nested theme.json', async () => {
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(createValidThemeFiles())) {
    zip.file(`theme-a/${filePath}`, content);
  }
  zip.file('theme-b/other.txt', 'other');
  const buffer = await zip.generateAsync({ type: 'uint8array' });

  await assert.rejects(
    () => parseThemeManifestFromZip(buffer),
    /single top-level folder/
  );
});

test('parseThemeManifestFromZip returns manifest fields', async () => {
  const manifest = await parseThemeManifestFromZip(await createZip(createValidThemeFiles()));
  assert.equal(manifest.name, 'Test Theme');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.author, 'ZeroPress');
});

test('validateThemeZip reports missing theme.json', async () => {
  const files = createValidThemeFiles();
  delete files['theme.json'];
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /theme\.json/i);
});

test('validateThemeZip reports invalid theme.json JSON', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = '{';
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_THEME_JSON'), true);
});

test('validateThemeZip reports missing required files', async () => {
  const files = createValidThemeFiles();
  delete files['assets/style.css'];
  delete files['post.html'];
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.path === 'assets/style.css'), true);
  assert.equal(result.errors.some((issue) => issue.path === 'post.html'), true);
});

test('validateThemeZip reports invalid semver and missing author', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    version: '1.0',
    author: '',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
  assert.equal(result.errors.some((issue) => issue.message.includes('author')), true);
});

test('validateThemeZip reports invalid layout slot usage', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = '<main>{{slot:content}}{{slot:content}}</main>';
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LAYOUT_SLOT'), true);
});

test('validateThemeZip reports forbidden Mustache blocks', async () => {
  const files = createValidThemeFiles();
  files['index.html'] = '{{#if site.title}}ok{{/if}}';
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'MUSTACHE_BLOCK_NOT_ALLOWED'), true);
});

test('validateThemeZip reports script tags in layout.html', async () => {
  const files = createValidThemeFiles();
  files['layout.html'] = '<main>{{slot:content}}</main><script>alert(1)</script>';
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'LAYOUT_SCRIPT_NOT_ALLOWED'), true);
});

test('validateThemeZip warns on missing optional templates and comment placeholder misuse', async () => {
  const files = createValidThemeFiles();
  delete files['post.html'];
  files['post.html'] = '<article>{{post.title}}</article>';
  files['index.html'] = `<h1>{{site.title}}</h1>${'{{post.comments_html}}'}`;
  const result = await validateThemeZip(await createZip(files));
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
