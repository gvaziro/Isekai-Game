export type KnowledgeType = "fact" | "entity" | "book" | "locked";
export type KnowledgeChunkType = KnowledgeType | "npc_profile";

export type FrontmatterValue = string | string[] | boolean | number | null;

export type Frontmatter = Record<string, FrontmatterValue>;

export type KnowledgeDocument = {
  id: string;
  type: KnowledgeType;
  title: string;
  metadata: Frontmatter;
  body: string;
  sourcePath: string;
  contentHash: string;
};

export type KnowledgeIndexEntry = {
  id: string;
  type: KnowledgeType;
  title: string;
  tags: string[];
  tier: string | null;
  truth_level: string | null;
  related: string[];
  body: string;
  source_path: string;
  content_hash: string;
  locked: boolean;
};

export type KnowledgeIndex = {
  generated_at: string;
  entries: KnowledgeIndexEntry[];
  stats: KnowledgeStats;
};

export type KnowledgeStats = {
  facts: number;
  entities: number;
  books: number;
  locked: number;
  broken_links: number;
};

export type ValidationIssue = {
  file: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  stats: KnowledgeStats;
  documents: KnowledgeDocument[];
};

export type SearchFilters = {
  tag?: string;
  related?: string;
  tier?: string;
  id?: string;
  type?: KnowledgeType;
  limit?: number;
};

export type SearchResult = KnowledgeIndexEntry & {
  score: number;
};

export type KnowledgeChunk = {
  id: string;
  document_id: string;
  source_path: string;
  title: string;
  type: KnowledgeChunkType;
  tags: string[];
  tier: string | null;
  truth_level: string | null;
  related: string[];
  text: string;
  content_hash: string;
};

export type KnowledgeVectorIndexEntry = KnowledgeChunk & {
  embedding: number[];
};

export type KnowledgeVectorIndex = {
  generated_at: string;
  model: string;
  dimensions: number;
  entries: KnowledgeVectorIndexEntry[];
  stats: {
    chunks: number;
    embedded: number;
    reused?: number;
    stale?: number;
    orphan?: number;
  };
};

export type VectorSearchResult = KnowledgeVectorIndexEntry & {
  vector_score: number;
  lexical_score: number;
  score: number;
};

export type VectorIndexHealthStatus =
  | "ok"
  | "missing"
  | "stale"
  | "invalid"
  | "model_mismatch"
  | "dimension_mismatch"
  | "embedding_error";

export type VectorIndexHealth = {
  status: VectorIndexHealthStatus;
  ok: boolean;
  index_path: string;
  expected_model: string;
  actual_model: string | null;
  dimensions: number | null;
  chunks: number;
  entries: number;
  missing_chunks: number;
  stale_chunks: number;
  orphan_entries: number;
  invalid_entries: number;
  message?: string;
};

export type VectorSearchDiagnostics = {
  used_vector: boolean;
  fallback_reason?: VectorIndexHealthStatus;
  message?: string;
  health?: VectorIndexHealth;
};
