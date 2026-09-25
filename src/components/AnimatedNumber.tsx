import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface Props {
  value: number;
  format: (n: number) => string;
  /** Seconds. */
  duration?: number;
  className?: string;
}

/**
 * Counts from the previous value to the next one.
 *
 * Turkish figures here can jump six orders of magnitude between two states, so
 * the tween runs in log space whenever both endpoints are positive and far
 * apart. A linear tween would otherwise spend most of its time near the large
 * end and read as a jump-cut.
 */
export function AnimatedNumber({ value, format, duration = 0.9, className }: Props) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    previous.current = value;

    if (reduced || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
      setDisplay(to);
      return;
    }

    const useLog = from > 0 && to > 0 && Math.abs(Math.log10(to / from)) > 1.2;
    const a = useLog ? Math.log(from) : from;
    const b = useLog ? Math.log(to) : to;

    const controls = animate(a, b, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(useLog ? Math.exp(latest) : latest),
      onComplete: () => setDisplay(to),
    });

    return () => controls.stop();
  }, [value, duration, reduced]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
