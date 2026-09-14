import { type ReactNode, useLayoutEffect, useRef } from "react";
import { arcLength, startupArcFrames } from "../../utils/quotaArc";

type QuotaArcProps = {
  week: number | null;
  fiveHour: number | null;
  children: ReactNode;
  startupSequence?: number;
  switching?: boolean;
  current?: boolean;
};

export function QuotaArc({ week, fiveHour, children, startupSequence = 0, switching = false, current = false }: QuotaArcProps) {
  const weekRef = useRef<SVGCircleElement>(null);
  const fiveRef = useRef<SVGCircleElement>(null);
  const animations = useRef<Animation[]>([]);
  // Mounting a list or returning from settings must not replay an old success.
  const seenSequence = useRef(startupSequence);
  const latestValues = useRef([week, fiveHour]);

  useLayoutEffect(() => {
    latestValues.current = [week, fiveHour];
    animations.current.forEach((animation, index) => {
      const frames = startupArcFrames(latestValues.current[index]);
      if (frames.length) (animation.effect as KeyframeEffect | null)?.setKeyframes(frames);
      else animation.cancel();
    });
  }, [week, fiveHour]);

  useLayoutEffect(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    const isNewSuccess = startupSequence > seenSequence.current;
    seenSequence.current = startupSequence;
    if (isNewSuccess && current && !switching && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      [weekRef.current, fiveRef.current].forEach((circle, index) => {
        const frames = startupArcFrames(latestValues.current[index]);
        // Keep both slots so a missing cycle cannot shift the other cycle's value.
        if (circle && frames.length) animations.current[index] = circle.animate(frames, { duration: 600 });
      });
    }
    return () => animations.current.forEach((animation) => animation.cancel());
  }, [startupSequence, current, switching]);

  return (
    <div className="quotaArc" onClick={(event) => event.stopPropagation()}>
      <svg viewBox="-63 -63 126 126" aria-hidden="true" focusable="false">
        {[55, 44].map((radius) => <circle key={radius} className="quotaArcTrack" r={radius} pathLength={100} />)}
        {[week, fiveHour].map((value, index) => (
          <circle key={index} ref={index === 0 ? weekRef : fiveRef} r={index === 0 ? 55 : 44} pathLength={100}
            className={`quotaArcValue ${index === 0 ? "quotaArcWeek" : "quotaArcFive"}${value !== null && value <= 0 ? " isEmpty" : value !== null && value < 15 ? " isLow" : ""}`}
            strokeDasharray={`${arcLength(value)} 100`} opacity={arcLength(value) > 0 ? 1 : 0} />
        ))}
      </svg>
      {children}
    </div>
  );
}

export function QuotaPowerIcon({ busy = false, authorization = false }: { busy?: boolean; authorization?: boolean }) {
  return (
    <svg className={busy ? "quotaPowerIcon isBusy" : "quotaPowerIcon"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {busy ? <path d="M12 3a9 9 0 0 1 9 9" /> : authorization ? <><circle cx="8" cy="9" r="4" /><path d="m11 12 9 9m-3-3 3-3m-6 0 3-3" /></> : <path d="M12 3v9M6 5.5a9 9 0 1 0 12 0" />}
    </svg>
  );
}
