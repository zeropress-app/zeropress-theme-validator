import JSZip from 'jszip';

const REQUIRED_TEMPLATES = ['layout.html', 'index.html', 'post.html', 'page.html'];
const OPTIONAL_TEMPLATES = ['archive.html', 'category.html', 'tag.html'];
const REQUIRED_FILES = ['theme.json', 'assets/style.css'];
const ALLOWED_SLOTS = new Set(['content', 'header', 'footer', 'meta']);
const COMMENTS_PLACEHOLDER = '{{post.comments_html}}';
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NAMESPACE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
]);
const NAME_MAX_LENGTH = 80;
const AUTHOR_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 280;
const MACOS_METADATA_WARNING = issue(
  'MACOS_METADATA_IGNORED',
  'theme.zip',
  'macOS metadata files (__MACOSX, ._*) were ignored',
  'warning'
);

export function detectBasePrefix(filePaths) {
  const analysis = analyzeZipLayout(filePaths);
  return analysis.basePrefix;
}

export async function parseThemeManifestFromZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const filePaths = Object.keys(zip.files).filter((filePath) => !zip.files[filePath].dir);
  const analysis = analyzeZipLayout(filePaths);

  if (analysis.error) {
    throw new Error(analysis.error);
  }

  const themeJsonFile = zip.file(analysis.zipPathByRelativePath.get('theme.json'));

  if (!themeJsonFile) {
    throw new Error('Theme package must contain theme.json at root (or a single top-level folder root)');
  }

  let manifest;
  try {
    manifest = JSON.parse(await themeJsonFile.async('string'));
  } catch (error) {
    throw new Error(`Invalid theme.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { errors, manifest: parsedManifest } = validateManifest(manifest);
  if (errors.length > 0 || !parsedManifest) {
    throw new Error(errors[0]?.message || 'Invalid theme.json');
  }

  return parsedManifest;
}

export async function validateThemeZip(buffer, options = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const filePaths = Object.keys(zip.files).filter((filePath) => !zip.files[filePath].dir);
  const analysis = analyzeZipLayout(filePaths);
  const files = new Map();

  if (analysis.error) {
    return {
      ok: false,
      errors: [issue('INVALID_ZIP_ROOT', 'theme.zip', analysis.error, 'error')],
      warnings: [],
      manifest: undefined,
      checkedFiles: analysis.checkedFiles,
    };
  }

  await Promise.all(
    analysis.normalizedFilePaths.map(async (normalizedPath) => {
      const relativePath = analysis.relativePathByZipPath.get(normalizedPath) || normalizedPath;
      const file = zip.file(normalizedPath);
      if (!file || file.dir) {
        return;
      }

      files.set(relativePath, await file.async('string'));
    })
  );

  return validateThemeFiles(files, {
    ...options,
    checkedFiles: analysis.checkedFiles,
    initialWarnings: analysis.ignoredMacOsMetadata ? [MACOS_METADATA_WARNING] : [],
  });
}

function analyzeZipLayout(filePaths) {
  const normalized = [...filePaths]
    .map((filePath) => normalizePath(String(filePath)))
    .filter(Boolean);
  const normalizedWithoutMetadata = normalized.filter((filePath) => !isIgnorableMacOsMetadata(filePath));

  if (normalizedWithoutMetadata.includes('theme.json')) {
    return createZipLayoutAnalysis(normalizedWithoutMetadata, '', normalizedWithoutMetadata.length !== normalized.length);
  }

  const topLevels = new Set(normalizedWithoutMetadata.map((filePath) => filePath.split('/')[0]).filter(Boolean));
  if (topLevels.size === 1) {
    const folder = [...topLevels][0];
    if (normalizedWithoutMetadata.includes(`${folder}/theme.json`)) {
      return createZipLayoutAnalysis(
        normalizedWithoutMetadata,
        `${folder}/`,
        normalizedWithoutMetadata.length !== normalized.length
      );
    }
  }

  const nestedThemeJson = normalizedWithoutMetadata.filter((filePath) => filePath.endsWith('/theme.json') && filePath.split('/').length === 2);
  if (nestedThemeJson.length > 0) {
    return {
      basePrefix: '',
      error: 'Theme package must be root-flat or wrapped in a single top-level folder',
      normalizedFilePaths: normalizedWithoutMetadata,
      checkedFiles: normalizedWithoutMetadata.length,
    };
  }

  return createZipLayoutAnalysis(
    normalizedWithoutMetadata,
    '',
    normalizedWithoutMetadata.length !== normalized.length
  );
}

export async function validateThemeFiles(fileMap, options = {}) {
  const files = normalizeFileMap(fileMap);
  const errors = [];
  const warnings = [...(options.initialWarnings || [])];
  const noJsCheck = options.noJsCheck === true;

  validatePathSafety(options.pathEntries || [], errors);

  for (const requiredPath of REQUIRED_FILES) {
    if (!files.has(requiredPath)) {
      errors.push(issue('MISSING_REQUIRED_FILE', requiredPath, `Required file '${requiredPath}' is missing`, 'error'));
    }
  }

  for (const template of REQUIRED_TEMPLATES) {
    if (!files.has(template)) {
      errors.push(issue('MISSING_REQUIRED_TEMPLATE', template, `Required template '${template}' is missing`, 'error'));
    }
  }

  for (const template of OPTIONAL_TEMPLATES) {
    if (!files.has(template)) {
      warnings.push(issue('MISSING_OPTIONAL_TEMPLATE', template, `Optional template '${template}' is missing`, 'warning'));
    }
  }

  let manifest;
  if (files.has('theme.json')) {
    try {
      const rawThemeJson = getText(files.get('theme.json'));
      const parsedThemeJson = JSON.parse(rawThemeJson);
      const manifestResult = validateManifest(parsedThemeJson);
      manifest = manifestResult.manifest;
      errors.push(...manifestResult.errors);
    } catch (error) {
      errors.push(issue(
        'INVALID_THEME_JSON',
        'theme.json',
        `Invalid theme.json: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      ));
    }
  }

  const templatesToCheck = new Set([...REQUIRED_TEMPLATES, ...OPTIONAL_TEMPLATES, 'layout.html', '404.html']);
  const templateContents = new Map();

  for (const templatePath of templatesToCheck) {
    if (!files.has(templatePath)) {
      continue;
    }
    const content = getText(files.get(templatePath));
    templateContents.set(templatePath, content);
    validateTemplateSyntax(templatePath, content, { errors, noJsCheck });
  }

  validateCommentsPlaceholderGuidance(templateContents, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    manifest,
    checkedFiles: options.checkedFiles ?? files.size,
  };
}

function normalizeFileMap(fileMap) {
  const normalized = new Map();

  if (fileMap instanceof Map) {
    for (const [filePath, value] of fileMap.entries()) {
      normalized.set(normalizePath(String(filePath)), value);
    }
    return normalized;
  }

  for (const [filePath, value] of Object.entries(fileMap)) {
    normalized.set(normalizePath(filePath), value);
  }

  return normalized;
}

function validateManifest(themeJson) {
  const errors = [];
  if (!themeJson || typeof themeJson !== 'object' || Array.isArray(themeJson)) {
    errors.push(issue('INVALID_THEME_JSON', 'theme.json', 'theme.json must be an object', 'error'));
    return { errors, manifest: undefined };
  }

  const manifest = {
    name: '',
    namespace: '',
    slug: '',
    version: '',
    license: '',
    runtime: '',
  };

  for (const key of ['name', 'namespace', 'slug', 'version', 'license', 'runtime']) {
    if (typeof themeJson[key] !== 'string' || themeJson[key].trim() === '') {
      errors.push(issue('INVALID_THEME_METADATA', 'theme.json', `theme.json field '${key}' must be a non-empty string`, 'error'));
      continue;
    }
    manifest[key] = themeJson[key].trim();
  }

  if (typeof themeJson.name === 'string' && themeJson.name.trim().length > NAME_MAX_LENGTH) {
    errors.push(issue(
      'INVALID_NAME',
      'theme.json',
      `theme.json field 'name' must be at most ${NAME_MAX_LENGTH} characters`,
      'error'
    ));
  }

  if (typeof themeJson.version === 'string' && !SEMVER_REGEX.test(themeJson.version.trim())) {
    errors.push(issue('INVALID_SEMVER', 'theme.json', 'Theme version must follow semantic versioning (e.g. 1.0.0)', 'error'));
  }

  if (typeof themeJson.runtime === 'string' && themeJson.runtime.trim() !== '0.2') {
    errors.push(issue('INVALID_RUNTIME_VERSION', 'theme.json', "theme.json field 'runtime' must be '0.2'", 'error'));
  }

  if (typeof themeJson.license === 'string' && !LICENSES.has(themeJson.license.trim())) {
    errors.push(issue(
      'INVALID_LICENSE',
      'theme.json',
      "theme.json field 'license' must be one of: MIT, Apache-2.0, BSD-3-Clause, GPL-3.0-only, GPL-3.0-or-later",
      'error'
    ));
  }

  if (typeof themeJson.namespace === 'string') {
    const namespace = themeJson.namespace.trim();
    if (!NAMESPACE_REGEX.test(namespace) || namespace.length < 3 || namespace.length > 24) {
      errors.push(issue(
        'INVALID_NAMESPACE',
        'theme.json',
        "theme.json field 'namespace' must follow ZeroPress namespace rules (lowercase letters, digits, hyphens; 3-24 chars)",
        'error'
      ));
    }
  }

  if (typeof themeJson.slug === 'string') {
    const slug = themeJson.slug.trim();
    if (!SLUG_REGEX.test(slug) || slug.length < 3 || slug.length > 32) {
      errors.push(issue(
        'INVALID_SLUG',
        'theme.json',
        "theme.json field 'slug' must follow ZeroPress slug rules (lowercase letters, digits, hyphens; 3-32 chars)",
        'error'
      ));
    }
  }

  if (typeof themeJson.author === 'string' && themeJson.author.trim() !== '') {
    const author = themeJson.author.trim();
    if (author.length > AUTHOR_MAX_LENGTH) {
      errors.push(issue(
        'INVALID_AUTHOR',
        'theme.json',
        `theme.json field 'author' must be at most ${AUTHOR_MAX_LENGTH} characters`,
        'error'
      ));
    } else {
      manifest.author = author;
    }
  }

  if (typeof themeJson.description === 'string' && themeJson.description.trim() !== '') {
    const description = themeJson.description.trim();
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      errors.push(issue(
        'INVALID_DESCRIPTION',
        'theme.json',
        `theme.json field 'description' must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
        'error'
      ));
    } else {
      manifest.description = description;
    }
  }

  return { errors, manifest: errors.length > 0 ? undefined : manifest };
}

function validateTemplateSyntax(templatePath, content, context) {
  const { errors, noJsCheck } = context;
  const slotRegex = /\{\{slot:([a-zA-Z0-9_-]+)\}\}/g;
  const contentSlotMatches = content.match(/\{\{slot:content\}\}/g) || [];

  if (templatePath === 'layout.html') {
    if (contentSlotMatches.length !== 1) {
      errors.push(issue('INVALID_LAYOUT_SLOT', 'layout.html', 'layout.html must contain exactly one {{slot:content}}', 'error'));
    }
    if (!noJsCheck && /<script\b/i.test(content)) {
      errors.push(issue('LAYOUT_SCRIPT_NOT_ALLOWED', 'layout.html', 'layout.html must not contain <script> tags', 'error'));
    }
  }

  let match;
  while ((match = slotRegex.exec(content)) !== null) {
    const slotName = match[1];
    if (!ALLOWED_SLOTS.has(slotName)) {
      errors.push(issue('UNKNOWN_SLOT', templatePath, `Unknown slot '${slotName}' in ${templatePath}`, 'error'));
    }
  }

  if (/\{\{slot:[^}]*\{\{slot:/.test(content)) {
    errors.push(issue('NESTED_SLOT', templatePath, `Nested slots are not allowed in ${templatePath}`, 'error'));
  }

  if (/\{\{[#/][^}]+\}\}/.test(content)) {
    errors.push(issue('MUSTACHE_BLOCK_NOT_ALLOWED', templatePath, `Mustache block syntax is not allowed in ${templatePath}`, 'error'));
  }
}

function validateCommentsPlaceholderGuidance(templateContents, warnings) {
  const postTemplate = templateContents.get('post.html');
  if (typeof postTemplate === 'string' && !postTemplate.includes(COMMENTS_PLACEHOLDER)) {
    warnings.push(issue(
      'MISSING_POST_COMMENTS_PLACEHOLDER',
      'post.html',
      "Consider adding '{{post.comments_html}}' to post.html to render post comments",
      'warning'
    ));
  }

  for (const [templatePath, content] of templateContents.entries()) {
    if (templatePath === 'post.html' || !content.includes(COMMENTS_PLACEHOLDER)) {
      continue;
    }
    warnings.push(issue(
      'COMMENTS_PLACEHOLDER_OUTSIDE_POST_TEMPLATE',
      templatePath,
      "'{{post.comments_html}}' should be used in post.html, not in this template",
      'warning'
    ));
  }
}

function createZipLayoutAnalysis(normalizedFilePaths, basePrefix, ignoredMacOsMetadata) {
  const relativePathByZipPath = new Map();
  const zipPathByRelativePath = new Map();

  for (const normalizedPath of normalizedFilePaths) {
    const relativePath = basePrefix && normalizedPath.startsWith(basePrefix)
      ? normalizedPath.slice(basePrefix.length)
      : normalizedPath;

    relativePathByZipPath.set(normalizedPath, relativePath);
    zipPathByRelativePath.set(relativePath, normalizedPath);
  }

  return {
    basePrefix,
    error: null,
    ignoredMacOsMetadata,
    normalizedFilePaths,
    relativePathByZipPath,
    zipPathByRelativePath,
    checkedFiles: normalizedFilePaths.length,
  };
}

function isIgnorableMacOsMetadata(filePath) {
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPath) {
    return false;
  }

  if (normalizedPath.startsWith('__MACOSX/')) {
    return true;
  }

  return normalizedPath.split('/').some((segment) => segment.startsWith('._'));
}

function validatePathSafety(pathEntries, errors) {
  for (const entry of pathEntries) {
    const entryPath = normalizePath(String(entry.path || ''));
    if (!entryPath) {
      continue;
    }

    if (entryPath.includes('..') || entryPath.startsWith('/')) {
      errors.push(issue('PATH_ESCAPE', entryPath, `Invalid path outside theme root: ${entryPath}`, 'error'));
      continue;
    }

    if (!entry.isSymlink) {
      continue;
    }

    if (typeof entry.resolvedPath !== 'string' || typeof entry.rootRealPath !== 'string') {
      continue;
    }

    const resolvedPath = normalizeAbsolutePath(entry.resolvedPath);
    const rootRealPath = normalizeAbsolutePath(entry.rootRealPath);

    if (!isPathInsideRoot(resolvedPath, rootRealPath)) {
      errors.push(issue('SYMLINK_ESCAPE', entryPath, `Symlink escapes theme root: ${entryPath}`, 'error'));
    }
  }
}

function getText(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(value));
  }

  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }

  return String(value);
}

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function normalizeAbsolutePath(value) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isPathInsideRoot(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function issue(code, filePath, message, severity) {
  return {
    code,
    path: filePath,
    message,
    severity,
  };
}
