import { MAX_YEAR, MIN_YEAR } from '../lib/series';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  accent: string;
  onChange: (year: number) => void;
}

export function YearSlider({ label, value, min = MIN_YEAR, max = MAX_YEAR, accent, onChange }: Props) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={`year-${label}`} className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
          {label}
        </label>
        <output htmlFor={`year-${label}`} className="font-mono text-lg font-medium tabular text-ink-100">
          {value}
        </output>
      </div>
      <input
        id={`year-${label}`}
        type="range"
        className="year-range mt-3 h-5 w-full"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            '--track': `linear-gradient(90deg, ${accent} 0%, ${accent} ${pct}%, rgb(58 54 71 / 0.85) ${pct}%, rgb(58 54 71 / 0.85) 100%)`,
          } as React.CSSProperties
        }
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-600">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
