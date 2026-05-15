export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  column?: number;
  hint?: string;
  category?: string;
  snippet?: {
    line: string;
    pointer: string;
  };
}

export interface ThemeManifest {
  name: string;
  namespace: string;
  slug: string;
  version: string;
  license: 'MIT' | 'Apache-2.0' | 'BSD-3-Clause' | 'GPL-3.0-only' | 'GPL-3.0-or-later' | `LicenseRef-${string}`;
  runtime: '0.6';
  author?: string;
  description?: string;
  thumbnail?: string;
  links?: {
    homepage?: string;
    repository?: string;
    documentation?: string;
    support?: string;
    marketplace?: string;
    license?: string;
  };
  features?: {
    comments?: boolean;
    newsletter?: boolean;
    post_index?: boolean;
  };
  menu_slots?: Record<string, {
    title: string;
    description?: string;
  }>;
  widget_areas?: Record<string, {
    title: string;
    description?: string;
  }>;
  site_meta?: Record<string, {
    title: string;
    description?: string;
    type?: 'string' | 'number' | 'boolean';
    default?: string | number | boolean | null;
  }>;
  collection_slots?: Record<string, {
    title: string;
    description?: string;
  }>;
}

export interface PathSafetyEntry {
  path: string;
  isSymlink?: boolean;
  resolvedPath?: string;
  rootRealPath?: string;
}

export interface ValidateThemeOptions {
  pathEntries?: PathSafetyEntry[];
  checkedFiles?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  manifest?: ThemeManifest;
  checkedFiles: number;
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  manifest?: ThemeManifest;
}

export const DEFAULT_RUNTIME: '0.6';
export const THEME_RUNTIME_V0_6: '0.6';
export const ALLOWED_LICENSES: ReadonlyArray<'MIT' | 'Apache-2.0' | 'BSD-3-Clause' | 'GPL-3.0-only' | 'GPL-3.0-or-later'>;
export const NAMESPACE_MIN_LENGTH: number;
export const NAMESPACE_MAX_LENGTH: number;
export const SLUG_MIN_LENGTH: number;
export const SLUG_MAX_LENGTH: number;
export const NAME_MAX_LENGTH: number;
export const AUTHOR_MAX_LENGTH: number;
export const DESCRIPTION_MAX_LENGTH: number;

export function validateNamespace(value: string): string;
export function validateSlug(value: string): string;
export function validateThemeManifest(themeJson: unknown): ManifestValidationResult;
export function validateThemeFiles(
  fileMap: Map<string, string | Uint8Array | ArrayBuffer> | Record<string, string | Uint8Array | ArrayBuffer>,
  options?: ValidateThemeOptions
): Promise<ValidationResult>;
