import { useMemo, type ReactNode } from 'react';
import { SourceContext, type ViewMode } from './source';
import { SOURCES, type SourceId } from '../lib/sources';

interface Props {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  children: ReactNode;
}

export function SourceProvider({ view, onViewChange, children }: Props) {
  const value = useMemo(() => {
    const isComparing = view === 'compare';
    return {
      view,
      setView: onViewChange,
      source: SOURCES[(isComparing ? 'tuik' : view) as SourceId],
      isComparing,
    };
  }, [view, onViewChange]);

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}
