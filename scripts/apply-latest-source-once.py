from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected source block not found in {path}")
    p.write_text(text.replace(old, new, 1))


# CurrentCanvas: bring in the new marquee semantics, while preserving the
# existing Option/Alt center-resize + line-axis behavior. Option/Alt disables
# only grid quantization; object-point snapping remains available.
replace_once(
    "app/diagram/CurrentCanvas.tsx",
    'import { collectIntersections, dropLineEndpoint } from "./intersections";',
    'import {\n  collectIntersections,\n  dropLineEndpoint,\n  elementTouchesRect,\n} from "./intersections";',
)

replace_once(
    "app/diagram/CurrentCanvas.tsx",
    '''      const next = event.altKey
        ? { x: base.x + dx, y: base.y + dy }
        : snap(
            { x: base.x + dx, y: base.y + dy },
            g.originals.map((e) => e.id),
          );
      let shift = { x: next.x - base.x, y: next.y - base.y };
      const aligned =
        !event.altKey && !event.shiftKey
          ? translationSnap(
              g.originals.flatMap(objectSnapTargets),
              { x: dx, y: dy },
              snapTargets,
              g.originals.map((e) => e.id),
              zoom,
            )
          : null;
      if (aligned) {
        shift = aligned.shift;
        snappedTarget.current = aligned.target;
        setSnapPoint(aligned.target);
        setSnapLines({ x: aligned.target.point.x, y: aligned.target.point.y });
      } else if (event.altKey || event.shiftKey) {
        snappedTarget.current = null;
        setSnapPoint(null);
        if (event.altKey) setSnapLines({});
      }''',
    '''      const next = snap(
        { x: base.x + dx, y: base.y + dy },
        g.originals.map((e) => e.id),
      );
      let shift = { x: next.x - base.x, y: next.y - base.y };
      const aligned =
        !event.shiftKey
          ? translationSnap(
              g.originals.flatMap(objectSnapTargets),
              { x: dx, y: dy },
              snapTargets,
              g.originals.map((e) => e.id),
              zoom,
            )
          : null;
      if (aligned) {
        shift = aligned.shift;
        snappedTarget.current = aligned.target;
        setSnapPoint(aligned.target);
        setSnapLines({ x: aligned.target.point.x, y: aligned.target.point.y });
      } else if (event.shiftKey) {
        snappedTarget.current = null;
        setSnapPoint(null);
      }''',
)

replace_once(
    "app/diagram/CurrentCanvas.tsx",
    '''    if (g.kind === "marquee") {
      const b = normalizeBox(g.start, q);
      p.onSelect([
        ...new Set([
          ...g.add,
          ...elements
            .filter((e) => {
              const eb = worldBounds(e);
              return (
                eb.x >= b.x &&
                eb.y >= b.y &&
                eb.x + eb.width <= b.x + b.width &&
                eb.y + eb.height <= b.y + b.height
              );
            })
            .flatMap((e) =>
              e.groupId
                ? elements
                    .filter((n) => n.groupId === e.groupId)
                    .map((n) => n.id)
                : [e.id],
            ),
        ]),
      ]);
      setMarquee(null);
    }''',
    '''    if (g.kind === "marquee") {
      const b = normalizeBox(g.start, q);
      const dragged = b.width > 1 / zoom || b.height > 1 / zoom;
      p.onSelect([
        ...new Set([
          ...g.add,
          ...elements
            .filter((e) => dragged && elementTouchesRect(e, b))
            .flatMap((e) =>
              e.groupId
                ? elements
                    .filter((n) => n.groupId === e.groupId)
                    .map((n) => n.id)
                : [e.id],
            ),
        ]),
      ]);
      setMarquee(null);
    }''',
)

# SceneElement: hollow geometric objects are selected only from their visible
# outline. Text/image/plot remain area objects. Polyline/curve hit targets use
# a generous invisible stroke without making the interior clickable.
replace_once(
    "app/diagram/SceneElement.tsx",
    '''        <path
          d={d}
          {...common}
          fill={e.type === "freehand" ? "none" : common.fill}
        />
        {interactive && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth="10"
            data-hit-area
          />
        )}''',
    '''        <path
          d={d}
          {...common}
          fill={e.type === "freehand" ? "none" : common.fill}
          pointerEvents="none"
        />
        {interactive && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth="10"
            pointerEvents="stroke"
            data-hit-area
          />
        )}''',
)

replace_once(
    "app/diagram/SceneElement.tsx",
    '''    content = (
      <g
        transform={`translate(${e.x} ${e.y}) scale(${e.width / 100} ${e.height / 100})`}
      >
        <path
          d={shapePath(shape, e.parameters)}
          {...common}
          fill={definition?.open ? "none" : common.fill}
          fillRule="evenodd"
        />
      </g>
    );''',
    '''    content = (
      <g
        transform={`translate(${e.x} ${e.y}) scale(${e.width / 100} ${e.height / 100})`}
      >
        <path
          d={shapePath(shape, e.parameters)}
          {...common}
          fill={definition?.open ? "none" : common.fill}
          fillRule="evenodd"
          pointerEvents="none"
        />
        {interactive && (
          <path
            d={shapePath(shape, e.parameters)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(10, s.strokeWidth + 6)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="stroke"
            data-hit-area
          />
        )}
      </g>
    );''',
)

replace_once(
    "app/diagram/SceneElement.tsx",
    '''      {interactive && !LINE_TYPES.has(e.type) && e.type !== "freehand" && (
        <rect
          x={b.x}
          y={b.y}
          width={Math.max(b.width, 8)}
          height={Math.max(b.height, 8)}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
          data-hit-area
        />
      )}''',
    '''      {interactive &&
        (TEXT_TYPES.has(e.type) || e.type === "image" || e.type === "plot") && (
        <rect
          x={b.x}
          y={b.y}
          width={Math.max(b.width, 8)}
          height={Math.max(b.height, 8)}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
          data-hit-area
        />
      )}''',
)

# Intersections also provide the painted-geometry test used by marquee select.
replace_once(
    "app/diagram/intersectionsBase.ts",
    '''export function elementSegments(e: DiagramElement): Segment[] {
  const { path, matrix } = elementContour(e);
  const key = `${matrix.join(",")}:${path}`;
  let segments = cache.get(key);
  if (!segments) {
    segments = svgPathSegments(path, matrix);
    if (path.length < 20000) {
      cache.set(key, segments);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
    }
  }
  return segments;
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;''',
    '''export function elementSegments(e: DiagramElement): Segment[] {
  const { path, matrix } = elementContour(e);
  const key = `${matrix.join(",")}:${path}`;
  let segments = cache.get(key);
  if (!segments) {
    segments = svgPathSegments(path, matrix);
    if (path.length < 20000) {
      cache.set(key, segments);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
    }
  }
  return segments;
}

/** Whether a marquee touches painted geometry, rather than just its bounding box. */
export function elementTouchesRect(e: DiagramElement, rect: Bounds): boolean {
  const box = worldBounds(e);
  if (!overlaps(box, rect)) return false;

  // These are area objects: a partial overlap with their visible frame counts.
  if (TEXT_TYPES.has(e.type) || e.type === "image" || e.type === "plot")
    return true;

  const contains = (p: Point) =>
    p.x >= rect.x - 1e-8 &&
    p.x <= rect.x + rect.width + 1e-8 &&
    p.y >= rect.y - 1e-8 &&
    p.y <= rect.y + rect.height + 1e-8;
  const edges: Segment[] = [
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
    ],
    [
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ],
    [
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
    [
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x, y: rect.y },
    ],
  ];
  return elementSegments(e).some(
    ([from, to]) =>
      contains(from) ||
      contains(to) ||
      edges.some((edge) => segmentIntersection([from, to], edge)),
  );
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;''',
)

print("latest source merge applied")
