export interface SeriesIndicator {
    type: 'world' | 'growth' | 'quest' | 'serial' | 'genre' | 'complexity';
    score: 'high' | 'medium' | 'low';
    reason: string;
}
export interface SeriesPotentialResult {
    detected: boolean;
    indicators: SeriesIndicator[];
    suggestion: string | null;
}
export declare function detectSeriesPotential(premiseData: Record<string, unknown>, genreData: Record<string, unknown>): SeriesPotentialResult;
//# sourceMappingURL=series-detector.d.ts.map