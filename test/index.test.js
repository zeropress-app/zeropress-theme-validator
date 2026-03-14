import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  DEFAULT_RUNTIME,
  detectBasePrefix,
  parseThemeManifestFromZip,
  validateNamespace,
  validateSlug,
  validateThemeManifest,
  validateThemeFiles,
  validateThemeZip,
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

test('validateThemeZip ignores Finder macOS metadata files', async () => {
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(createValidThemeFiles())) {
    zip.file(`test2/${filePath}`, content);
    zip.file(`__MACOSX/test2/._${path.basename(filePath)}`, 'metadata');
  }
  zip.file('__MACOSX/._test2', 'metadata');

  const result = await validateThemeZip(await zip.generateAsync({ type: 'uint8array' }));

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.some((issue) => issue.code === 'MACOS_METADATA_IGNORED'), true);
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
  assert.equal(manifest.namespace, 'test-studio');
  assert.equal(manifest.slug, 'test-theme');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.runtime, '0.2');
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

test('validateThemeZip reports invalid semver', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0',
    license: 'MIT',
    runtime: '0.2',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SEMVER'), true);
});

test('validateThemeZip accepts a valid v0.2 manifest without author', async () => {
  const result = await validateThemeZip(await createZip(createValidThemeFiles()));
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

test('validateThemeZip requires license', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    runtime: '0.2',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.message.includes("'license'")), true);
});

test('validateThemeZip rejects invalid license values', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'ISC',
    runtime: '0.2',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_LICENSE'), true);
});

test('validateThemeZip requires runtime 0.2', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'test-studio',
    slug: 'test-theme',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.1',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_RUNTIME_VERSION'), true);
});

test('validateThemeZip rejects invalid namespace and slug manifest fields', async () => {
  const files = createValidThemeFiles();
  files['theme.json'] = JSON.stringify({
    name: 'Test Theme',
    namespace: 'Bad_Namespace',
    slug: 'bad--slug',
    version: '1.0.0',
    license: 'MIT',
    runtime: '0.2',
  });
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_NAMESPACE'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_SLUG'), true);
});

test('validateThemeZip rejects manifest fields that exceed max lengths', async () => {
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
  const result = await validateThemeZip(await createZip(files));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_NAME'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_AUTHOR'), true);
  assert.equal(result.errors.some((issue) => issue.code === 'INVALID_DESCRIPTION'), true);
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
