// SVG pathLength=100: a full quota occupies 75% of the circle (270°).
export function arcLength(remaining: number | null): number {
  return remaining !== null && Number.isFinite(remaining)
    ? Math.max(0, Math.min(100, remaining)) * 0.75
    : 0;
}

export function startupArcFrames(remaining: number | null): Keyframe[] {
  if (remaining === null || !Number.isFinite(remaining)) return [];
  return [
    { strokeDasharray: "0 100", opacity: 0, offset: 0, easing: "ease-out" },
    { strokeDasharray: "75 100", opacity: 1, offset: 1 / 3, easing: "ease-in-out" },
    { strokeDasharray: `${arcLength(remaining)} 100`, opacity: remaining > 0 ? 1 : 0, offset: 1 },
  ];
}
