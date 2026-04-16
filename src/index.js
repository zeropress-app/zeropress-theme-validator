const REQUIRED_TEMPLATES = ['layout.html', 'index.html', 'post.html', 'page.html'];
const OPTIONAL_TEMPLATES = ['archive.html', 'category.html', 'tag.html'];
const REQUIRED_FILES = ['theme.json', 'assets/style.css'];
const ALLOWED_SLOTS = new Set(['content', 'header', 'footer', 'meta']);
const COMMENTS_PLACEHOLDER = '{{post.comments_html}}';
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const NAMESPACE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
];
const LICENSES = new Set(ALLOWED_LICENSES);
export const DEFAULT_RUNTIME = '0.3';
export const NAMESPACE_MIN_LENGTH = 3;
export const NAMESPACE_MAX_LENGTH = 24;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 32;
export const NAME_MAX_LENGTH = 80;
export const AUTHOR_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 280;
export const MENU_SLOT_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MENU_SLOT_ID_MAX_LENGTH = 32;
export const MENU_SLOT_COUNT_MAX = 12;
export const MENU_SLOT_TITLE_MAX_LENGTH = 80;
export const MENU_SLOT_DESCRIPTION_MAX_LENGTH = 160;

export function validateNamespace(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (!NAMESPACE_REGEX.test(normalized) || normalized.length < NAMESPACE_MIN_LENGTH || normalized.length > NAMESPACE_MAX_LENGTH) {
    throw new Error(`Namespace must use lowercase letters, digits, and internal hyphens only, and be between ${NAMESPACE_MIN_LENGTH} and ${NAMESPACE_MAX_LENGTH} characters`);
  }
  return normalized;
}

export function validateSlug(value) {
  const normalized = String(value || '').trim();
  if (!SLUG_REGEX.test(normalized) || normalized.length < SLUG_MIN_LENGTH || normalized.length > SLUG_MAX_LENGTH) {
    throw new Error(`Theme slug must use lowercase letters, digits, and internal hyphens only, and be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`);
  }
  return normalized;
}

export function validateThemeManifest(themeJson) {
  const { errors, manifest } = validateManifest(themeJson);
  return {
    ok: errors.length === 0,
    errors,
    manifest,
  };
}

export async function validateThemeFiles(fileMap, options = {}) {
  const files = normalizeFileMap(fileMap);
  const errors = [];
  const warnings = [];

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
    validateTemplateSyntax(templatePath, content, { errors });
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

  if (typeof themeJson.runtime === 'string' && themeJson.runtime.trim() !== DEFAULT_RUNTIME) {
    errors.push(issue('INVALID_RUNTIME_VERSION', 'theme.json', `theme.json field 'runtime' must be '${DEFAULT_RUNTIME}'`, 'error'));
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
    if (!NAMESPACE_REGEX.test(namespace) || namespace.length < NAMESPACE_MIN_LENGTH || namespace.length > NAMESPACE_MAX_LENGTH) {
      errors.push(issue(
        'INVALID_NAMESPACE',
        'theme.json',
        `theme.json field 'namespace' must follow ZeroPress namespace rules (lowercase letters, digits, hyphens; ${NAMESPACE_MIN_LENGTH}-${NAMESPACE_MAX_LENGTH} chars)`,
        'error'
      ));
    }
  }

  if (typeof themeJson.slug === 'string') {
    const slug = themeJson.slug.trim();
    if (!SLUG_REGEX.test(slug) || slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
      errors.push(issue(
        'INVALID_SLUG',
        'theme.json',
        `theme.json field 'slug' must follow ZeroPress slug rules (lowercase letters, digits, hyphens; ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} chars)`,
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

  if (themeJson.menuSlots !== undefined) {
    if (!themeJson.menuSlots || typeof themeJson.menuSlots !== 'object' || Array.isArray(themeJson.menuSlots)) {
      errors.push(issue('INVALID_MENU_SLOTS', 'theme.json', "theme.json field 'menuSlots' must be an object when present", 'error'));
    } else {
      const entries = Object.entries(themeJson.menuSlots);

      if (entries.length === 0) {
        errors.push(issue('INVALID_MENU_SLOTS', 'theme.json', "theme.json field 'menuSlots' must not be empty", 'error'));
      }

      if (entries.length > MENU_SLOT_COUNT_MAX) {
        errors.push(issue('INVALID_MENU_SLOTS', 'theme.json', `theme.json field 'menuSlots' must contain at most ${MENU_SLOT_COUNT_MAX} slots`, 'error'));
      }

      const menuSlots = {};

      for (const [slotId, value] of entries) {
        if (!MENU_SLOT_ID_REGEX.test(slotId) || slotId.length < 1 || slotId.length > MENU_SLOT_ID_MAX_LENGTH) {
          errors.push(issue(
            'INVALID_MENU_SLOT_ID',
            `theme.json.menuSlots.${slotId}`,
            `Menu slot id '${slotId}' must use lowercase letters, digits, and internal hyphens only, and be between 1 and ${MENU_SLOT_ID_MAX_LENGTH} characters`,
            'error'
          ));
          continue;
        }

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          errors.push(issue(
            'INVALID_MENU_SLOT',
            `theme.json.menuSlots.${slotId}`,
            `Menu slot '${slotId}' must be an object`,
            'error'
          ));
          continue;
        }

        const allowedKeys = new Set(['title', 'description']);
        for (const key of Object.keys(value)) {
          if (!allowedKeys.has(key)) {
            errors.push(issue(
              'INVALID_MENU_SLOT_PROPERTY',
              `theme.json.menuSlots.${slotId}.${key}`,
              `Unknown menu slot property '${key}' in slot '${slotId}'`,
              'error'
            ));
          }
        }

        if (typeof value.title !== 'string' || value.title.trim() === '') {
          errors.push(issue(
            'INVALID_MENU_SLOT_TITLE',
            `theme.json.menuSlots.${slotId}.title`,
            `Menu slot '${slotId}' must define a non-empty 'title'`,
            'error'
          ));
        } else if (value.title.trim().length > MENU_SLOT_TITLE_MAX_LENGTH) {
          errors.push(issue(
            'INVALID_MENU_SLOT_TITLE',
            `theme.json.menuSlots.${slotId}.title`,
            `Menu slot '${slotId}' title must be at most ${MENU_SLOT_TITLE_MAX_LENGTH} characters`,
            'error'
          ));
        }

        if (typeof value.description === 'string' && value.description.trim().length > MENU_SLOT_DESCRIPTION_MAX_LENGTH) {
          errors.push(issue(
            'INVALID_MENU_SLOT_DESCRIPTION',
            `theme.json.menuSlots.${slotId}.description`,
            `Menu slot '${slotId}' description must be at most ${MENU_SLOT_DESCRIPTION_MAX_LENGTH} characters`,
            'error'
          ));
        }

        if (
          typeof value.title === 'string' &&
          value.title.trim() !== '' &&
          value.title.trim().length <= MENU_SLOT_TITLE_MAX_LENGTH &&
          (value.description === undefined ||
            (typeof value.description === 'string' && value.description.trim().length <= MENU_SLOT_DESCRIPTION_MAX_LENGTH))
        ) {
          menuSlots[slotId] = {
            title: value.title.trim(),
            ...(typeof value.description === 'string' && value.description.trim() !== ''
              ? { description: value.description.trim() }
              : {}),
          };
        }
      }

      if (Object.keys(menuSlots).length > 0) {
        manifest.menuSlots = menuSlots;
      }
    }
  }

  return { errors, manifest: errors.length > 0 ? undefined : manifest };
}

function validateTemplateSyntax(templatePath, content, context) {
  const { errors } = context;
  const slotRegex = /\{\{slot:([a-zA-Z0-9_-]+)\}\}/g;
  const contentSlotMatches = content.match(/\{\{slot:content\}\}/g) || [];

  if (templatePath === 'layout.html') {
    if (contentSlotMatches.length !== 1) {
      errors.push(issue('INVALID_LAYOUT_SLOT', 'layout.html', 'layout.html must contain exactly one {{slot:content}}', 'error'));
    }
    if (/<script\b/i.test(content)) {
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
