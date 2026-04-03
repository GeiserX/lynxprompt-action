export type BlueprintType =
  | 'AGENTS_MD'
  | 'CLAUDE_MD'
  | 'CURSOR_RULES'
  | 'COPILOT_INSTRUCTIONS'
  | 'WINDSURF_RULES'
  | 'AIDER_MD'
  | 'CUSTOM';

export type BlueprintVisibility = 'PRIVATE' | 'TEAM' | 'PUBLIC';

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  type: BlueprintType;
  content: string;
  content_checksum: string;
  visibility: BlueprintVisibility;
  tags: string[];
}

export interface BlueprintListItem {
  id: string;
  name: string;
  description: string;
  type: BlueprintType;
  content_checksum: string;
  visibility: BlueprintVisibility;
  tags: string[];
}

export interface CreateBlueprintRequest {
  name: string;
  description?: string;
  type: BlueprintType;
  content: string;
  visibility: BlueprintVisibility;
  tags?: string[];
}

export interface UpdateBlueprintRequest {
  name?: string;
  description?: string;
  type?: BlueprintType;
  content?: string;
  visibility?: BlueprintVisibility;
  tags?: string[];
}

export type ActionMode = 'sync' | 'validate' | 'generate' | 'diff';

export interface ActionInputs {
  mode: ActionMode;
  token: string;
  apiUrl: string;
  files: string;
  visibility: BlueprintVisibility;
  platforms: string[];
  failOnDrift: boolean;
  commitChanges: boolean;
}

export interface DetectedFile {
  path: string;
  relativePath: string;
  type: BlueprintType;
  content: string;
  blueprintName: string;
}

export interface ValidationResult {
  file: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface DiffResult {
  file: string;
  blueprintName: string;
  type: BlueprintType;
  status: 'match' | 'drift' | 'local-only' | 'cloud-only';
  localChecksum?: string;
  cloudChecksum?: string;
  details?: string;
}

export interface SyncResult {
  file: string;
  blueprintName: string;
  action: 'created' | 'updated' | 'unchanged';
  blueprintId?: string;
}

/**
 * Mapping from platform name (user-friendly) to the BlueprintType(s) that represent it.
 */
export const PLATFORM_TYPE_MAP: Record<string, BlueprintType[]> = {
  'claude-code': ['CLAUDE_MD', 'AGENTS_MD'],
  cursor: ['CURSOR_RULES'],
  copilot: ['COPILOT_INSTRUCTIONS'],
  windsurf: ['WINDSURF_RULES'],
  aider: ['AIDER_MD'],
};
