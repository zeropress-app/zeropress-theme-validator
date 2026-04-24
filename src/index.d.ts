export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ThemeManifest {
  name: string;
  namespace: string;
  slug: string;
  version: string;
  license: 'MIT' | 'Apache-2.0' | 'BSD-3-Clause' | 'GPL-3.0-only' | 'GPL-3.0-or-later';
  runtime: '0.5';
  author?: string;
  description?: string;
  features?: {
    comments?: boolean;
    newsletter?: boolean;
  };
  menuSlots?: Record<string, {
    title: string;
    description?: string;
  }>;
  widgetAreas?: Record<string, {
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

export const DEFAULT_RUNTIME: '0.5';
export const THEME_RUNTIME_V0_5: '0.5';
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
