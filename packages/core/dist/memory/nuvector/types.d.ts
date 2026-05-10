/**
 * Storyline semantic-memory public types. Originally mirrored
 * @nusoft/nuvector's TypeScript surface; the engine now lives behind
 * vectra (pure JS, Electron-safe) but the type contract stays the same
 * so every NT-05+ caller keeps working.
 *
 * Only the subset of NuVector's contract we actually use is defined
 * here. The four-layer search APIs (searchKnowledge,
 * searchSectionsInArticles, etc.) and the graph-traversal APIs were
 * deferred to NuVector WU 004/005 and our v1 retrieval doesn't use
 * them — they live in the schema doc as forward-compat targets only.
 */
export type ISODateString = string;
export interface SubjectRef {
    kind: string;
    id: string;
}
export type SourceKind = 'document' | 'database_record' | 'workflow_event' | 'nuwiki_document' | 'external_system';
export interface SourceRef {
    kind: SourceKind;
    ref: string;
    citationLabel?: string;
}
/** Kept identical to NuVector's MemoryRecordKind so chunk-id mapping
 *  doesn't need to know which engine is underneath. */
export type MemoryRecordKind = 'document_chunk' | 'incident_history' | 'intervention_log' | 'support_strategy' | 'parent_communication' | 'ehcp_outcome' | 'pupil_voice' | 'staff_correction' | 'workflow_provenance' | 'nuwiki_article_summary' | 'nuwiki_section' | 'nuwiki_citation';
export interface MemoryRecord {
    id: string;
    kind: MemoryRecordKind;
    embedding: Float32Array;
    text?: string;
    metadata: Record<string, unknown>;
    effectiveAt?: ISODateString;
    tenant: string;
    source?: SourceRef;
    version?: string;
    supersedesId?: string;
}
export type FreshnessMode = 'any' | 'fresh_only' | 'exclude_archived';
export interface RetrievalFilters {
    kind?: MemoryRecordKind | MemoryRecordKind[];
    documentType?: string | string[];
    subject?: SubjectRef | SubjectRef[];
    subjectRefs?: SubjectRef[];
    articleId?: string | string[];
    freshness?: FreshnessMode;
    metadataMatch?: Record<string, unknown>;
    effectiveBetween?: [ISODateString, ISODateString];
    excludeIds?: string[];
    excludeSuperseded?: boolean;
}
export interface RetrievalQuery {
    embedding: Float32Array;
    query?: string;
    tenant: string;
    filters?: RetrievalFilters;
    topK?: number;
    scoreThreshold?: number;
}
export type ContextKind = MemoryRecordKind;
export interface ContextItem {
    ref: string;
    kind: ContextKind;
    summary: string;
    text?: string;
    score: number;
    metadata: Record<string, unknown>;
    source: SourceRef;
    effectiveAt?: ISODateString;
    articleId?: string;
    sectionKey?: string;
    citationId?: string;
    parentArticleSummary?: string;
}
export interface BudgetReport {
    tokensUsed: number;
    tokensRequested: number;
    articlesIncluded: number;
    truncated: boolean;
    truncationReason?: string;
}
export interface ContextPack {
    items: ContextItem[];
    retrievalId: string;
    retrievedAt: ISODateString;
    totalCandidates: number;
    budget?: BudgetReport;
}
export interface UpsertRef {
    id: string;
    version?: string;
    upserted: boolean;
}
export interface DeletionQuery {
    ids?: string[];
    tenant?: string;
    subject?: SubjectRef;
    articleId?: string | string[];
    reason?: 'gdpr_erasure' | 'cleanup' | 'compaction' | string;
}
export interface DeletionResult {
    deletedCount: number;
    affectedLayers: Array<'layer1' | 'layer2' | 'layer3' | 'graph' | 'provenance'>;
}
export interface SnapshotRef {
    path: string;
    takenAt: ISODateString;
    bytes: number;
    checksum?: string;
}
//# sourceMappingURL=types.d.ts.map