interface LogoProps {
  className?: string;
}

// 24 nodes on a 250-degree arc; radius and opacity ramp along the path.
const NODES = [
  { cx: 21.74, cy: 7.81, r: 0.55, o: 0.45 },
  { cx: 20.08, cy: 6.87, r: 0.6, o: 0.47 },
  { cx: 18.29, cy: 6.27, r: 0.64, o: 0.5 },
  { cx: 16.42, cy: 6.01, r: 0.69, o: 0.52 },
  { cx: 14.53, cy: 6.11, r: 0.73, o: 0.55 },
  { cx: 12.7, cy: 6.56, r: 0.78, o: 0.57 },
  { cx: 10.97, cy: 7.36, r: 0.82, o: 0.6 },
  { cx: 9.43, cy: 8.46, r: 0.87, o: 0.62 },
  { cx: 8.12, cy: 9.84, r: 0.92, o: 0.65 },
  { cx: 7.1, cy: 11.43, r: 0.96, o: 0.67 },
  { cx: 6.4, cy: 13.19, r: 1.01, o: 0.69 },
  { cx: 6.05, cy: 15.05, r: 1.05, o: 0.72 },
  { cx: 6.05, cy: 16.95, r: 1.1, o: 0.74 },
  { cx: 6.4, cy: 18.81, r: 1.14, o: 0.77 },
  { cx: 7.1, cy: 20.57, r: 1.19, o: 0.79 },
  { cx: 8.12, cy: 22.16, r: 1.24, o: 0.82 },
  { cx: 9.43, cy: 23.54, r: 1.28, o: 0.84 },
  { cx: 10.97, cy: 24.64, r: 1.33, o: 0.87 },
  { cx: 12.7, cy: 25.44, r: 1.37, o: 0.89 },
  { cx: 14.53, cy: 25.89, r: 1.42, o: 0.91 },
  { cx: 16.42, cy: 25.99, r: 1.46, o: 0.94 },
  { cx: 18.29, cy: 25.73, r: 1.51, o: 0.96 },
  { cx: 20.08, cy: 25.13, r: 1.55, o: 0.98 },
  { cx: 21.74, cy: 24.19, r: 1.6, o: 1 },
];

/** Nodes tracing an open C: the arc is Cognita, the gap is the ongoing conversation. */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {NODES.map((node) => (
        <circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          opacity={node.o}
        />
      ))}
    </svg>
  );
}
