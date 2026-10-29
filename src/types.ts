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
  type: BlueprintType | string;
  content: string;
  content_checksum: string;
  visibility: BlueprintVisibility;
  tags: string[];
  hierarchy_id: string | null;
  repository_path: string | null;
}

export interface BlueprintListItem {
  id: string;
  name: string;
  description: string;
  /** The server knows more types than this action maps to files. */
  type: BlueprintType | string;
  content_checksum: string;
  visibility: BlueprintVisibility;
  tags: string[];
  hierarchy_id: string | null;
  repository_path: string | null;
}

/** A hierarchy groups the blueprints of one repository. */
export interface Hierarchy {
  id: string;
  name: string;
  repository_root: string;
}

export interface CreateBlueprintRequest {
  name: string;
  description?: string;
  type: BlueprintType;
  content: string;
  visibility: BlueprintVisibility;
  tags?: string[];
  hierarchy_id?: string;
  repository_path?: string;
  team_id?: string;
}

export interface UpdateBlueprintRequest {
  name?: string;
  description?: string;
  type?: BlueprintType;
  content?: string;
  visibility?: BlueprintVisibility;
  tags?: string[];
  team_id?: string;
  /** The server answers 409 when the stored content no longer has this checksum. */
  expected_checksum?: string;
}

export type ActionMode = 'sync' | 'validate' | 'generate' | 'diff';

export interface ActionInputs {
  mode: ActionMode;
  token: string;
  apiUrl: string;
  files: string;
  /** Unset means PRIVATE for new blueprints and no change for existing ones. */
  visibility?: BlueprintVisibility;
  teamId?: string;
  githubToken?: string;
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
  type: BlueprintType | string;
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
