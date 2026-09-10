import { intersectionAppearance, type IntersectionMark } from "./intersections";
export function IntersectionLayer({ marks }: { marks: IntersectionMark[] }) {
  return (
    <g data-intersections pointerEvents="none">
      {marks.map(({ point: p, owner: e, ids }, i) => {
        if (e.intersectionHidden) return null;
        const { radius: r, strokeWidth } = intersectionAppearance(e),
          color = e.style.stroke === "transparent" ? "#000000" : e.style.stroke;
        return (
          <g
            key={`${ids.join("-")}-${i}`}
            opacity={e.style.opacity}
            data-intersection-owner={e.id}
          >
            {e.intersectionKind === "cross" ? (
              <path
                d={`M${p.x - r} ${p.y - r}L${p.x + r} ${p.y + r}M${p.x - r} ${p.y + r}L${p.x + r} ${p.y - r}`}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
              />
            ) : (
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                stroke={color}
                strokeWidth={strokeWidth}
                fill={e.intersectionKind === "dot" ? color : "white"}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
