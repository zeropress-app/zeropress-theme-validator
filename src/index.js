const REQUIRED_TEMPLATES = ['layout.html', 'index.html', 'post.html', 'page.html'];
const OPTIONAL_TEMPLATES = ['archive.html', 'category.html', 'tag.html'];
const REQUIRED_FILES = ['theme.json', 'assets/style.css'];
const ALLOWED_SLOTS = new Set(['content', 'header', 'footer', 'meta']);
const PARTIAL_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*(?:\/[a-zA-Z_][a-zA-Z0-9_-]*)*$/;
const PARTIAL_TAG_REGEX = /\{\{(partial:[^}]+)\}\}/g;
const TEMPLATE_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const PARTIAL_ARG_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
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
export const DEFAULT_RUNTIME = '0.5';
export const THEME_RUNTIME_V0_5 = DEFAULT_RUNTIME;
export const SUPPORTED_RUNTIMES = [DEFAULT_RUNTIME];
const SUPPORTED_RUNTIME_SET = new Set(SUPPORTED_RUNTIMES);
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
const SUPPORTED_THEME_FEATURES = new Set(['comments', 'newsletter']);

function validateFeatureFlags(rawValue, errors) {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    errors.push(issue(
      'INVALID_FEATURES',
      'theme.json',
      "theme.json field 'features' must be an object when present",
      'error'
    ));
    return undefined;
  }

  const normalizedFeatures = {};

  for (const [featureName, value] of Object.entries(rawValue)) {
    if (!SUPPORTED_THEME_FEATURES.has(featureName)) {
      errors.push(issue(
        'INVALID_THEME_FEATURE',
        `theme.json.features.${featureName}`,
        `Unknown theme feature '${featureName}'`,
        'error'
      ));
      continue;
    }

    if (typeof value !== 'boolean') {
      errors.push(issue(
        'INVALID_THEME_FEATURE_VALUE',
        `theme.json.features.${featureName}`,
        `theme feature '${featureName}' must be a boolean`,
        'error'
      ));
      continue;
    }

    normalizedFeatures[featureName] = value;
  }

  return Object.keys(normalizedFeatures).length > 0 ? normalizedFeatures : undefined;
}

function validateHelperMetadataMap(rawValue, fieldName, issueCodes, errors) {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    errors.push(issue(
      issueCodes.invalidCollectionCode,
      'theme.json',
      `theme.json field '${fieldName}' must be an object when present`,
      'error'
    ));
    return undefined;
  }

  const entries = Object.entries(rawValue);

  if (entries.length === 0) {
    errors.push(issue(
      issueCodes.invalidCollectionCode,
      'theme.json',
      `theme.json field '${fieldName}' must not be empty`,
      'error'
    ));
  }

  if (entries.length > MENU_SLOT_COUNT_MAX) {
    errors.push(issue(
      issueCodes.invalidCollectionCode,
      'theme.json',
      `theme.json field '${fieldName}' must contain at most ${MENU_SLOT_COUNT_MAX} ${issueCodes.collectionLabel}`,
      'error'
    ));
  }

  const normalizedItems = {};

  for (const [itemId, value] of entries) {
    if (!MENU_SLOT_ID_REGEX.test(itemId) || itemId.length < 1 || itemId.length > MENU_SLOT_ID_MAX_LENGTH) {
      errors.push(issue(
        issueCodes.invalidIdCode,
        `theme.json.${fieldName}.${itemId}`,
        `${issueCodes.itemLabel} id '${itemId}' must use lowercase letters, digits, and internal hyphens only, and be between 1 and ${MENU_SLOT_ID_MAX_LENGTH} characters`,
        'error'
      ));
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(issue(
        issueCodes.invalidItemCode,
        `theme.json.${fieldName}.${itemId}`,
        `${issueCodes.itemLabel} '${itemId}' must be an object`,
        'error'
      ));
      continue;
    }

    const allowedKeys = new Set(['title', 'description']);
    for (const key of Object.keys(value)) {
      if (!allowedKeys.has(key)) {
        errors.push(issue(
          issueCodes.invalidPropertyCode,
          `theme.json.${fieldName}.${itemId}.${key}`,
          `Unknown ${issueCodes.propertyLabel} '${key}' in ${issueCodes.itemLabel.toLowerCase()} '${itemId}'`,
          'error'
        ));
      }
    }

    if (typeof value.title !== 'string' || value.title.trim() === '') {
      errors.push(issue(
        issueCodes.invalidTitleCode,
        `theme.json.${fieldName}.${itemId}.title`,
        `${issueCodes.itemLabel} '${itemId}' must define a non-empty 'title'`,
        'error'
      ));
    } else if (value.title.trim().length > MENU_SLOT_TITLE_MAX_LENGTH) {
      errors.push(issue(
        issueCodes.invalidTitleCode,
        `theme.json.${fieldName}.${itemId}.title`,
        `${issueCodes.itemLabel} '${itemId}' title must be at most ${MENU_SLOT_TITLE_MAX_LENGTH} characters`,
        'error'
      ));
    }

    if (typeof value.description === 'string' && value.description.trim().length > MENU_SLOT_DESCRIPTION_MAX_LENGTH) {
      errors.push(issue(
        issueCodes.invalidDescriptionCode,
        `theme.json.${fieldName}.${itemId}.description`,
        `${issueCodes.itemLabel} '${itemId}' description must be at most ${MENU_SLOT_DESCRIPTION_MAX_LENGTH} characters`,
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
      normalizedItems[itemId] = {
        title: value.title.trim(),
        ...(typeof value.description === 'string' && value.description.trim() !== ''
          ? { description: value.description.trim() }
          : {}),
      };
    }
  }

  return Object.keys(normalizedItems).length > 0 ? normalizedItems : undefined;
}

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
  const partialContents = new Map();

  for (const templatePath of templatesToCheck) {
    if (!files.has(templatePath)) {
      continue;
    }
    const content = getText(files.get(templatePath));
    templateContents.set(templatePath, content);
    validateTemplateSyntax(templatePath, content, { errors, runtime: manifest?.runtime || DEFAULT_RUNTIME });
  }

  for (const [filePath, value] of files.entries()) {
    if (!filePath.startsWith('partials/') || !filePath.endsWith('.html')) {
      continue;
    }

    const partialName = filePath.slice('partials/'.length, -'.html'.length);
    const content = getText(value);
    partialContents.set(partialName, content);
    validateTemplateSyntax(filePath, content, { errors, runtime: manifest?.runtime || DEFAULT_RUNTIME });
  }

  validatePartialReferences(templateContents, partialContents, { errors, runtime: manifest?.runtime || DEFAULT_RUNTIME });
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

  if (themeJson.$schema !== undefined && typeof themeJson.$schema !== 'string') {
    errors.push(issue(
      'INVALID_SCHEMA_HINT',
      'theme.json.$schema',
      "theme.json field '$schema' must be a string when present",
      'error'
    ));
  }

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

  if (typeof themeJson.runtime === 'string' && !SUPPORTED_RUNTIME_SET.has(themeJson.runtime.trim())) {
    errors.push(issue('INVALID_RUNTIME_VERSION', 'theme.json', `theme.json field 'runtime' must be one of: ${SUPPORTED_RUNTIMES.join(', ')}`, 'error'));
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

  const features = validateFeatureFlags(themeJson.features, errors);
  if (features) {
    manifest.features = features;
  }

  const menuSlots = validateHelperMetadataMap(themeJson.menuSlots, 'menuSlots', {
    itemLabel: 'Menu slot',
    propertyLabel: 'menu slot property',
    collectionLabel: 'slots',
    invalidCollectionCode: 'INVALID_MENU_SLOTS',
    invalidIdCode: 'INVALID_MENU_SLOT_ID',
    invalidItemCode: 'INVALID_MENU_SLOT',
    invalidPropertyCode: 'INVALID_MENU_SLOT_PROPERTY',
    invalidTitleCode: 'INVALID_MENU_SLOT_TITLE',
    invalidDescriptionCode: 'INVALID_MENU_SLOT_DESCRIPTION',
  }, errors);
  if (menuSlots) {
    manifest.menuSlots = menuSlots;
  }

  const widgetAreas = validateHelperMetadataMap(themeJson.widgetAreas, 'widgetAreas', {
    itemLabel: 'Widget area',
    propertyLabel: 'widget area property',
    collectionLabel: 'areas',
    invalidCollectionCode: 'INVALID_WIDGET_AREAS',
    invalidIdCode: 'INVALID_WIDGET_AREA_ID',
    invalidItemCode: 'INVALID_WIDGET_AREA',
    invalidPropertyCode: 'INVALID_WIDGET_AREA_PROPERTY',
    invalidTitleCode: 'INVALID_WIDGET_AREA_TITLE',
    invalidDescriptionCode: 'INVALID_WIDGET_AREA_DESCRIPTION',
  }, errors);
  if (widgetAreas) {
    manifest.widgetAreas = widgetAreas;
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

  validateRuntimeV05TemplateSyntax(templatePath, content, errors);
}

function validateRuntimeV05TemplateSyntax(templatePath, content, errors) {
  const stack = [];
  let index = 0;
  const isPartialFile = templatePath.startsWith('partials/');

  while (index < content.length) {
    const start = content.indexOf('{{', index);
    if (start === -1) {
      break;
    }

    if (content.startsWith('{{!--', start)) {
      const end = content.indexOf('--}}', start + 5);
      if (end === -1) {
        errors.push(issue('MALFORMED_TEMPLATE_COMMENT', templatePath, `Unclosed block comment in ${templatePath}`, 'error'));
        return;
      }
      index = end + 4;
      continue;
    }

    if (content.startsWith('{{!', start)) {
      const end = content.indexOf('}}', start + 3);
      if (end === -1) {
        errors.push(issue('MALFORMED_TEMPLATE_COMMENT', templatePath, `Unclosed inline comment in ${templatePath}`, 'error'));
        return;
      }
      index = end + 2;
      continue;
    }

    const end = content.indexOf('}}', start + 2);
    if (end === -1) {
      errors.push(issue('MALFORMED_TEMPLATE_TAG', templatePath, `Unclosed template tag in ${templatePath}`, 'error'));
      return;
    }

    const token = content.slice(start + 2, end).trim();
    index = end + 2;

    if (token.startsWith('partial:')) {
      try {
        parsePartialReferenceToken(token);
      } catch (error) {
        errors.push(issue(
          'INVALID_PARTIAL_REFERENCE',
          templatePath,
          `Invalid partial reference '{{${token}}}' in ${templatePath}: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        ));
        return;
      }
      continue;
    }

    if (!token.startsWith('#') && !token.startsWith('/')) {
      validateReservedPathUsage(token, templatePath, errors, stack, { isPartialFile });
      continue;
    }

    if (token === '#else') {
      const current = stack[stack.length - 1];
      if (!current || (current.tag !== 'if' && current.tag !== 'if_eq')) {
        errors.push(issue('UNEXPECTED_TEMPLATE_ELSE', templatePath, `Unexpected {{#else}} in ${templatePath}`, 'error'));
        return;
      }
      if (current.hasElse) {
        errors.push(issue('DUPLICATE_TEMPLATE_ELSE', templatePath, `Duplicate {{#else}} in ${templatePath}`, 'error'));
        return;
      }
      current.hasElse = true;
      continue;
    }

    if (token.startsWith('#else_if_eq ')) {
      const current = stack[stack.length - 1];
      if (!current || current.tag !== 'if_eq') {
        errors.push(issue('UNEXPECTED_TEMPLATE_ELSE_IF', templatePath, `Unexpected {{${token}}} in ${templatePath}`, 'error'));
        return;
      }
      if (current.hasElse) {
        errors.push(issue('INVALID_TEMPLATE_BRANCH_ORDER', templatePath, `{{${token}}} cannot appear after {{#else}} in ${templatePath}`, 'error'));
        return;
      }
      const expression = token.slice('#else_if_eq '.length).trim();
      const parsed = parseIfEqExpression(expression);
      if (!parsed) {
        errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }
      validateReservedPathUsage(parsed.path, templatePath, errors, stack, { isPartialFile });
      continue;
    }

    if (token.startsWith('#else_if ')) {
      const current = stack[stack.length - 1];
      if (!current || current.tag !== 'if') {
        errors.push(issue('UNEXPECTED_TEMPLATE_ELSE_IF', templatePath, `Unexpected {{${token}}} in ${templatePath}`, 'error'));
        return;
      }
      if (current.hasElse) {
        errors.push(issue('INVALID_TEMPLATE_BRANCH_ORDER', templatePath, `{{${token}}} cannot appear after {{#else}} in ${templatePath}`, 'error'));
        return;
      }
      const path = token.slice('#else_if '.length).trim();
      if (!TEMPLATE_PATH_REGEX.test(path)) {
        errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }
      validateReservedPathUsage(path, templatePath, errors, stack, { isPartialFile });
      continue;
    }

    if (token.startsWith('/')) {
      const closingTag = token.slice(1).trim();
      if (!['if', 'if_eq', 'for'].includes(closingTag)) {
        errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template closing tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }

      const current = stack.pop();
      if (!current || current.tag !== closingTag) {
        errors.push(issue('INVALID_TEMPLATE_BLOCK', templatePath, `Mismatched closing tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }
      continue;
    }

    if (token.startsWith('#if ')) {
      const path = token.slice('#if '.length).trim();
      if (!TEMPLATE_PATH_REGEX.test(path)) {
        errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }
      validateReservedPathUsage(path, templatePath, errors, stack, { isPartialFile });
      stack.push({ tag: 'if', hasElse: false });
      continue;
    }

    if (token.startsWith('#if_eq ')) {
      const expression = token.slice('#if_eq '.length).trim();
      const parsed = parseIfEqExpression(expression);
      if (!parsed) {
        errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template tag '{{${token}}}' in ${templatePath}`, 'error'));
        return;
      }
      validateReservedPathUsage(parsed.path, templatePath, errors, stack, { isPartialFile });
      stack.push({ tag: 'if_eq', hasElse: false });
      continue;
    }

    if (/^#for [a-zA-Z_][a-zA-Z0-9_]* in [a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(token)) {
      const path = token.replace(/^#for [a-zA-Z_][a-zA-Z0-9_]* in /, '');
      validateReservedPathUsage(path, templatePath, errors, stack, { isPartialFile });
      stack.push({ tag: 'for', hasElse: false });
      continue;
    }

    errors.push(issue('UNSUPPORTED_TEMPLATE_TAG', templatePath, `Unsupported template tag '{{${token}}}' in ${templatePath}`, 'error'));
    return;
  }

  if (stack.length > 0) {
    const current = stack[stack.length - 1];
    errors.push(issue('UNCLOSED_TEMPLATE_BLOCK', templatePath, `Unclosed '{{#${current.tag}}}' block in ${templatePath}`, 'error'));
  }
}

function validateReservedPathUsage(path, templatePath, errors, stack, options = {}) {
  if (!TEMPLATE_PATH_REGEX.test(path)) {
    return;
  }

  const insideFor = stack.some((entry) => entry.tag === 'for');
  if (path.startsWith('loop.') && !insideFor && !options.isPartialFile) {
    errors.push(issue(
      'INVALID_LOOP_REFERENCE',
      templatePath,
      `Reserved loop metadata path '${path}' can only be used inside a {{#for}} block in ${templatePath}`,
      'error'
    ));
  }

  if (path.startsWith('partial.') && !options.isPartialFile) {
    errors.push(issue(
      'INVALID_PARTIAL_REFERENCE_SCOPE',
      templatePath,
      `Reserved partial argument path '${path}' can only be used inside a partial file in ${templatePath}`,
      'error'
    ));
  }
}

function parseIfEqExpression(expression) {
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s+("(?:[^"\\]|\\.)*")$/.exec(expression);
  if (!match) {
    return null;
  }
  return {
    path: match[1],
    literal: match[2],
  };
}

function validatePartialReferences(templateContents, partialContents, context) {
  const { errors } = context;

  for (const [templatePath, content] of templateContents.entries()) {
    for (const partialName of getReferencedPartialNames(content)) {
      if (!partialContents.has(partialName)) {
        errors.push(issue(
          'MISSING_PARTIAL',
          templatePath,
          `Template '${templatePath}' references missing partial '${partialName}'`,
          'error'
        ));
      }
    }
  }

  const partialGraph = new Map();
  for (const [partialName, content] of partialContents.entries()) {
    const references = getReferencedPartialNames(content);
    partialGraph.set(partialName, references);

    for (const referencedPartial of references) {
      if (!partialContents.has(referencedPartial)) {
        errors.push(issue(
          'MISSING_PARTIAL',
          `partials/${partialName}.html`,
          `Partial '${partialName}' references missing partial '${referencedPartial}'`,
          'error'
        ));
      }
    }
  }

  const visited = new Set();
  const active = [];

  const visit = (partialName) => {
    if (active.includes(partialName)) {
      const cycleStart = active.indexOf(partialName);
      const cycle = [...active.slice(cycleStart), partialName];
      errors.push(issue(
        'PARTIAL_CYCLE',
        `partials/${partialName}.html`,
        `Circular partial reference detected: ${cycle.join(' -> ')}`,
        'error'
      ));
      return;
    }

    if (visited.has(partialName)) {
      return;
    }

    visited.add(partialName);
    active.push(partialName);

    for (const referencedPartial of partialGraph.get(partialName) || []) {
      if (!partialGraph.has(referencedPartial)) {
        continue;
      }
      visit(referencedPartial);
    }

    active.pop();
  };

  for (const partialName of partialGraph.keys()) {
    visit(partialName);
  }
}

function getReferencedPartialNames(content) {
  const matches = new Set();
  let match;

  while ((match = PARTIAL_TAG_REGEX.exec(content)) !== null) {
    try {
      const { name } = parsePartialReferenceToken(match[1]);
      matches.add(name);
    } catch {
      // Template syntax validation reports malformed partial tags.
    }
  }

  PARTIAL_TAG_REGEX.lastIndex = 0;
  return matches;
}

function parsePartialReferenceToken(token) {
  const source = String(token || '').trim();
  if (!source.startsWith('partial:')) {
    throw new Error('Partial token must start with partial:');
  }

  const expression = source.slice('partial:'.length).trim();
  const nameMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*(?:\/[a-zA-Z_][a-zA-Z0-9_-]*)*)(?:\s+|$)/.exec(expression);
  if (!nameMatch) {
    throw new Error('Invalid partial name');
  }

  const name = nameMatch[1];
  if (!PARTIAL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid partial name '${name}'`);
  }

  const argsSource = expression.slice(name.length).trim();
  parsePartialArgs(argsSource);

  return { name };
}

function parsePartialArgs(source) {
  if (!source) {
    return {};
  }

  const args = {};
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (index >= source.length) {
      break;
    }

    const keyMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(source.slice(index));
    if (!keyMatch) {
      throw new Error(`Invalid partial argument syntax near "${source.slice(index)}"`);
    }

    const key = keyMatch[0];
    if (!PARTIAL_ARG_KEY_REGEX.test(key)) {
      throw new Error(`Invalid partial argument key '${key}'`);
    }
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`Duplicate partial argument '${key}'`);
    }

    index += key.length;
    if (source[index] !== '=') {
      throw new Error(`Expected "=" after partial argument '${key}'`);
    }
    index += 1;

    if (source[index] === '"') {
      let cursor = index + 1;
      let escaped = false;

      while (cursor < source.length) {
        const char = source[cursor];
        if (escaped) {
          escaped = false;
          cursor += 1;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          cursor += 1;
          continue;
        }
        if (char === '"') {
          break;
        }
        cursor += 1;
      }

      if (cursor >= source.length || source[cursor] !== '"') {
        throw new Error(`Unclosed string literal for partial argument '${key}'`);
      }

      args[key] = JSON.parse(source.slice(index, cursor + 1));
      index = cursor + 1;
      continue;
    }

    if (source.startsWith('true', index) && isValueBoundary(source, index + 4)) {
      args[key] = true;
      index += 4;
      continue;
    }

    if (source.startsWith('false', index) && isValueBoundary(source, index + 5)) {
      args[key] = false;
      index += 5;
      continue;
    }

    throw new Error(`Unsupported partial argument value for '${key}'`);
  }

  return args;
}

function isValueBoundary(source, index) {
  return index >= source.length || /\s/.test(source[index]);
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
