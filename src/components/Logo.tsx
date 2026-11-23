/** The wordmark: a pixel comet streaking down, and EXTINCTION RUN. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <svg viewBox="0 0 16 16" width={size * 1.25} height={size * 1.25} aria-hidden shapeRendering="crispEdges">
        <path d="M15 0h1v2h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1z" fill="#c2340e" />
        <path d="M13 1h2v1h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6V9h1V8h1V7h1V6h1V5h1V4h1V3h1z" fill="#ff8a2a" />
        <path d="M2 9h4v1h1v4H6v1H2v-1H1v-4h1z" fill="#ffb04a" />
        <path d="M3 10h2v1h1v2H5v1H3v-1H2v-2h1z" fill="#fff6dc" />
      </svg>
      <span className="logo-word">
        EXTINCTION<em>RUN</em>
      </span>
    </span>
  );
}
