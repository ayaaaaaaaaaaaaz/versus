import { createContext, useContext } from 'react';
import type { SourceDefinition, SourceId } from '../lib/sources';

/** Either a single source, or the overlay that draws every source at once. */
export type ViewMode = SourceId | 'compare';

export interface SourceContextValue {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  /**
   * The source every calculation should read. While comparing, this stays on
   * the official series so the headline figures have one unambiguous meaning
   * and the comparison lives in the chart.
   */
  source: SourceDefinition;
  isComparing: boolean;
}

export const SourceContext = createContext<SourceContextValue | null>(null);

/**
 * Reads the app-wide data source. Throws rather than falling back, so a
 * component rendered outside the provider fails loudly instead of silently
 * showing official figures while the user has selected something else.
 */
export function useSource(): SourceContextValue {
  const value = useContext(SourceContext);
  if (!value) throw new Error('useSource must be used inside a SourceProvider');
  return value;
}
