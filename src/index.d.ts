export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ThemeManifest {
  name: string;
  version: string;
  author: string;
  description?: string;
}

export interface PathSafetyEntry {
  path: string;
  isSymlink?: boolean;
  resolvedPath?: string;
  rootRealPath?: string;
}

export interface ValidateThemeOptions {
  noJsCheck?: boolean;
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

export function detectBasePrefix(filePaths: Iterable<string>): string;
export function parseThemeManifestFromZip(buffer: ArrayBuffer | Uint8Array): Promise<ThemeManifest>;
export function validateThemeZip(buffer: ArrayBuffer | Uint8Array, options?: ValidateThemeOptions): Promise<ValidationResult>;
export function validateThemeFiles(
  fileMap: Map<string, string | Uint8Array | ArrayBuffer> | Record<string, string | Uint8Array | ArrayBuffer>,
  options?: ValidateThemeOptions
): Promise<ValidationResult>;
