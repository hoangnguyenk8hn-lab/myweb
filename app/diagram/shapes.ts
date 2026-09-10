/** Shape paths use a 100 × 100 coordinate system. Add a definition here to
 * register its palette icon, SVG rendering and editable JSON identity together. */
export type ShapeDefinition = {
  id: string;
  label: string;
  path: string;
  open?: boolean;
  section?: string;
};
const rect = "M5 15H95V85H5Z";
const round =
  "M18 15H82Q95 15 95 28V72Q95 85 82 85H18Q5 85 5 72V28Q5 15 18 15Z";
const ellipse = "M95 50A45 35 0 1 1 5 50A45 35 0 1 1 95 50Z";
const circle = "M90 50A40 40 0 1 1 10 50A40 40 0 1 1 90 50Z";
const diamond = "M50 5L95 50L50 95L5 50Z";
const cylinder =
  "M12 22A38 13 0 0 1 88 22V78A38 13 0 0 1 12 78ZM12 22A38 13 0 0 0 88 22";
const doc = "M8 8H92V78C62 56 40 103 8 78Z";
const arrow = "M4 35H62V10L96 50L62 90V65H4Z";
const define = (
  id: string,
  label: string,
  path: string,
  open = false,
): ShapeDefinition => ({ id, label, path, open });
export function regularPolygon(sides: number, radius = 43, star = false) {
  const n = star ? sides * 2 : sides;
  return (
    Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
      const r = star && i % 2 ? radius * 0.42 : radius;
      return `${i ? "L" : "M"}${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r}`;
    }).join(" ") + "Z"
  );
}

export const DOCUMENT_SHAPES: ShapeDefinition[] = [
  define("rectangle", "Rectangle", rect),
  define("rounded-rectangle", "Rounded Rectangle", round),
  define(
    "round-one",
    "Rounded Single Corner Rectangle",
    "M25 15H95V85H5V35Q5 15 25 15Z",
  ),
  define(
    "round-side",
    "Rounded Same Side Corner Rectangle",
    "M25 15H75Q95 15 95 35V85H5V35Q5 15 25 15Z",
  ),
  define(
    "round-diagonal",
    "Rounded Diagonal Corner Rectangle",
    "M25 15H95V65Q95 85 75 85H5V35Q5 15 25 15Z",
  ),
  define("snip-one", "Snip Single Corner Rectangle", "M5 15H75L95 35V85H5Z"),
  define(
    "snip-side",
    "Snip Same Side Corner Rectangle",
    "M25 15H75L95 35V85H5V35Z",
  ),
  define(
    "snip-diagonal",
    "Snip Diagonal Corner Rectangle",
    "M5 15H75L95 35V85H25L5 65Z",
  ),
  define(
    "snip-round",
    "Snip Round Single Corner Rectangle",
    "M25 15H75L95 35V85H5V35Q5 15 25 15Z",
  ),
  define("square", "Square", "M12 12H88V88H12Z"),
  define("parallelogram", "Parallelogram", "M25 15H95L75 85H5Z"),
  define("triangle", "Triangle", "M50 7L96 88H4Z"),
  define("right-triangle", "Right Triangle", "M8 8V92H92Z"),
  define("trapezoid", "Trapezoid", "M25 15H75L95 85H5Z"),
  define("diamond", "Diamond", diamond),
  define("pentagon", "Regular Pentagon", regularPolygon(5)),
  define("hexagon", "Hexagon", regularPolygon(6)),
  define("octagon", "Octagon", regularPolygon(8)),
  define("decagon", "Decagon", regularPolygon(10)),
  define("ellipse", "Ellipse", ellipse),
  define("circle", "Circle", circle),
  define("arc", "Arc", "M10 80A45 45 0 1 1 90 80", true),
  define("chord", "Chord", "M15 82A44 44 0 1 1 90 30Z"),
  define("pie", "Pie", "M50 50V5A45 45 0 1 1 5 50Z"),
  define("frame", "Frame", "M5 10H95V90H5ZM20 25V75H80V25Z"),
  define("half-frame", "Half Frame", "M5 10H95L80 25H20V75L5 90Z"),
  define("l-shape", "L Shape", "M8 8H32V70H92V92H8Z"),
  define("stripe", "Diagonal Stripe", "M5 80L80 5H95V20L20 95H5Z"),
  define("cross", "Cross", "M35 5H65V35H95V65H65V95H35V65H5V35H35Z"),
  define(
    "plaque",
    "Plaque",
    "M23 8H77Q77 23 92 23V77Q77 77 77 92H23Q23 77 8 77V23Q23 23 23 8Z",
  ),
  define("can", "Can", cylinder),
  define(
    "cube",
    "Cube",
    "M25 10H90V75L70 92H8V28ZM8 28H70V92M70 28L90 10M70 28L25 10",
  ),
  define(
    "bevel",
    "Bevel",
    "M5 10H95V90H5ZM20 25H80V75H20ZM5 10L20 25M95 10L80 25M95 90L80 75M5 90L20 75",
  ),
  define(
    "donut",
    "Donut",
    circle + "M72 50A22 22 0 1 0 28 50A22 22 0 1 0 72 50Z",
  ),
  define(
    "block-arc",
    "Block Arc",
    "M8 65A44 44 0 1 1 92 65L74 58A25 25 0 1 0 26 58Z",
  ),
  define(
    "folded-document",
    "Folded Corner Document",
    "M8 5H70L92 28V95H8ZM70 5V28H92",
  ),
  define("moon", "Moon", "M75 5A46 46 0 1 0 75 95A49 49 0 0 1 75 5Z"),
  define("tear-drop", "Tear Drop", "M95 5V52A45 43 0 1 1 49 5Z"),
  define(
    "cloud",
    "Cloud",
    "M18 75C-8 65 3 37 22 37C9 10 40 0 50 21C61-1 90 11 83 33C108 31 106 67 88 70C101 91 71 101 60 85C45 107 21 96 25 78Z",
  ),
  define(
    "smiley",
    "Smiley Face",
    circle + "M32 40H34M66 40H68M28 61Q50 83 72 61",
  ),
  define("right-angle", "Right Angle", "M12 8V88H92M12 68H32V88", true),
  define("star", "Star", regularPolygon(5, 46, true)),
  define(
    "spiral",
    "Spiral",
    Array.from({ length: 181 }, (_, i) => {
      const a = (i / 180) * Math.PI * 7;
      const r = (i / 180) * 46;
      return `${i ? "L" : "M"}${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
    }).join(" "),
    true,
  ),
];

export const FLOW_SHAPES: ShapeDefinition[] = [
  define("process", "Process", rect),
  define("alternative-process", "Alternative Process", round),
  define("decision", "Decision", diamond),
  define("data", "Data", "M25 15H95L75 85H5Z"),
  define(
    "predefined-process",
    "Predefined Process",
    rect + "M20 15V85M80 15V85",
  ),
  define("internal-storage", "Internal Storage", rect + "M22 15V85M5 32H95"),
  define("document", "Document", doc),
  define(
    "multidocument",
    "Multidocument",
    "M25 6H95V70M16 14H87V77M8 23H78V82C50 65 33 100 8 84Z",
  ),
  define(
    "terminator",
    "Terminator",
    "M28 18H72A32 32 0 0 1 72 82H28A32 32 0 0 1 28 18Z",
  ),
  define("preparation", "Preparation", "M22 15H78L98 50L78 85H22L2 50Z"),
  define("manual-input", "Manual Input", "M5 30L95 10V88H5Z"),
  define("manual-operation", "Manual Operation", "M5 15H95L75 85H25Z"),
  define("connector", "Connector", circle),
  define(
    "off-page-connector",
    "Off-page Connector",
    "M10 8H90V65L50 92L10 65Z",
  ),
  define("card", "Card", "M25 12H95V88H5V32Z"),
  define(
    "punched-tape",
    "Punched Tape",
    "M5 18C35-8 65 44 95 18V82C65 108 35 56 5 82Z",
  ),
  define(
    "summing-junction",
    "Summing Junction",
    circle + "M22 22L78 78M22 78L78 22",
  ),
  define("or", "Or", circle + "M10 50H90M50 10V90"),
  define("collate", "Collate", "M8 10H92L8 90H92Z"),
  define("sort", "Sort", diamond + "M5 50H95"),
  define("extract", "Extract", "M50 10L95 90H5Z"),
  define("merge", "Merge", "M5 10H95L50 90Z"),
  define(
    "stored-data",
    "Stored Data",
    "M22 15H95C70 35 70 65 95 85H22C-2 65-2 35 22 15Z",
  ),
  define("delay", "Delay", "M8 12H50A38 38 0 0 1 50 88H8Z"),
  define(
    "sequential-storage",
    "Sequential Access Storage",
    circle + "M50 90H95",
  ),
  define(
    "magnetic-disk",
    "Magnetic Disk",
    cylinder + "M12 32A38 13 0 0 0 88 32M12 42A38 13 0 0 0 88 42",
  ),
  define(
    "direct-storage",
    "Direct Access Storage",
    "M20 12H80A13 38 0 0 1 80 88H20A13 38 0 0 1 20 12ZM80 12A13 38 0 0 0 80 88",
  ),
  define("display", "Display", "M23 15H70C102 15 102 85 70 85H23L3 50Z"),
];

export const ELECTRICAL_SHAPES: ShapeDefinition[] = [
  define(
    "axis",
    "axis",
    "M18 95V5M12 14L18 5L24 14M5 75H97M89 69L97 75L89 81M40 71V79M62 71V79M84 71V79M14 53H22M14 31H22",
    true,
  ),
  define(
    "wave",
    "wave",
    "M5 50C15 0 25 100 35 50S55 100 65 50S85 100 95 50",
    true,
  ),
  define("quadratic", "y=x²", "M5 5Q50 175 95 5", true),
  define("cubic", "y=x³", "M5 95C45 95 55 5 95 5", true),
  define(
    "spring",
    "spring",
    "M3 50H12C38-20 30 120 23 50S49-20 43 50S69 120 63 50S89-20 83 50H97",
    true,
  ),
  define(
    "brace",
    "brace",
    "M5 75Q5 45 20 45H35Q50 45 50 25Q50 45 65 45H80Q95 45 95 75",
    true,
  ),
  define(
    "ruler",
    "ruler",
    "M5 75H95M5 75V25M20 75V45M35 75V25M50 75V45M65 75V25M80 75V45M95 75V25",
    true,
  ),
  define(
    "ruler-vertical",
    "ruler",
    "M25 5V95M25 5H75M25 20H55M25 35H75M25 50H55M25 65H75M25 80H55M25 95H75",
    true,
  ),
  define(
    "grid",
    "grid",
    "M5 5H95V95H5ZM5 27.5H95M5 50H95M5 72.5H95M27.5 5V95M50 5V95M72.5 5V95",
    true,
  ),
  define(
    "and-gate",
    "And Gate",
    "M5 30H25M5 70H25M25 15H55A35 35 0 0 1 55 85H25ZM90 50H100",
    true,
  ),
  define(
    "nand-gate",
    "Nand Gate",
    "M0 30H20M0 70H20M20 15H50A35 35 0 0 1 50 85H20ZM91 50A5 5 0 1 1 81 50A5 5 0 1 1 91 50ZM91 50H100",
    true,
  ),
  define(
    "or-gate",
    "Or Gate",
    "M5 30H25M5 70H25M20 15Q40 50 20 85Q75 90 92 50Q75 10 20 15M92 50H100",
    true,
  ),
  define(
    "xor-gate",
    "Xor Gate",
    "M0 30H25M0 70H25M12 15Q32 50 12 85M22 15Q42 50 22 85Q75 90 92 50Q75 10 22 15M92 50H100",
    true,
  ),
  define(
    "nor-gate",
    "Nor Gate",
    "M0 30H20M0 70H20M15 15Q35 50 15 85Q70 90 85 50Q70 10 15 15M95 50A5 5 0 1 1 85 50A5 5 0 1 1 95 50ZM95 50H100",
    true,
  ),
  define(
    "not-gate",
    "Not/Inverter Gate",
    "M0 50H15M15 10L80 50L15 90ZM90 50A5 5 0 1 1 80 50A5 5 0 1 1 90 50ZM90 50H100",
    true,
  ),
  define(
    "resistor",
    "Resistor",
    "M0 50H15L22 30L36 70L50 30L64 70L78 30L85 50H100",
    true,
  ),
  define(
    "resistor-box",
    "Resistor",
    "M0 50H18M18 30H82V70H18ZM82 50H100",
    true,
  ),
  define(
    "memristor",
    "Memristor",
    "M0 50H18M18 25H82V75H18ZM18 50H32V35H45V65H58V35H71V50H82M82 50H100",
    true,
  ),
  define(
    "capacitor",
    "Capacitor",
    "M0 50H42M42 15V85M58 15V85M58 50H100",
    true,
  ),
  define(
    "inductor",
    "Inductor",
    "M0 65H14C14 0 38 0 38 65C38 0 62 0 62 65C62 0 86 0 86 65H100",
    true,
  ),
  define(
    "inductor-core",
    "Inductor (Air Core)",
    "M0 65H14C14 0 38 0 38 65C38 0 62 0 62 65C62 0 86 0 86 65H100M14 85H86",
    true,
  ),
  define(
    "two-way-switch",
    "2 Way Switch",
    "M0 50H25L78 15M75 15H100M75 85H100M75 10V20M75 80V90",
    true,
  ),
  define(
    "switch",
    "Simple Switch",
    "M0 65H25L75 25M75 65H100M25 60V70M75 60V70",
    true,
  ),
  define("stay-put", "Stay Put", "M0 65H25L75 25M75 65H100M50 45V10H75", true),
  define(
    "diode",
    "Diode",
    "M0 50H25M25 20L75 50L25 80ZM75 20V80M75 50H100",
    true,
  ),
  define(
    "speaker",
    "Speaker",
    "M10 35H35L70 10V90L35 65H10ZM35 35V65M80 30Q98 50 80 70",
    true,
  ),
  define(
    "headphone",
    "Headphone",
    "M15 75V40A35 35 0 0 1 85 40V75M10 55H25V90H10ZM75 55H90V90H75Z",
    true,
  ),
  define(
    "battery",
    "Battery",
    "M0 50H32M32 10V90M47 30V70M62 10V90M77 30V70M77 50H100",
    true,
  ),
  define("fuse", "Fuse", "M0 50H100M20 30H80V70H20Z", true),
  define(
    "light-bulb",
    "Light Bulb",
    "M0 50H12M88 50H100M88 50A38 38 0 1 1 12 50A38 38 0 1 1 88 50ZM24 24L76 76M24 76L76 24",
    true,
  ),
  define(
    "lamp",
    "Lamp",
    "M30 75C-5 37 19 5 50 5C81 5 105 37 70 75ZM30 83H70M35 92H65M40 75L35 43L50 51L65 43L60 75",
    true,
  ),
  define("contact", "Contact", "M0 50H33M33 15V85M67 15V85M67 50H100", true),
  define(
    "not-contact",
    "Not Contact",
    "M0 50H33M33 15V85M67 15V85M67 50H100M20 88L80 12",
    true,
  ),
  define(
    "output",
    "Output",
    "M0 50H25M35 15Q5 50 35 85M65 15Q95 50 65 85M75 50H100",
    true,
  ),
  define("antenna", "Antenna", "M50 95V10M15 10L50 55L85 10", true),
  define(
    "ground",
    "Ground",
    "M50 0V45M12 45H88M25 60H75M37 75H63M45 90H55",
    true,
  ),
  define("pulse", "Pulse Wave Form", "M0 80H20V20H45V80H70V20H95V80H100", true),
  define(
    "sawtooth",
    "Sawtooth Wave Form",
    "M0 85L33 15V85L66 15V85L100 15V85",
    true,
  ),
  define(
    "sine",
    "Sine Wave Form",
    "M0 50C16-10 34-10 50 50S84 110 100 50",
    true,
  ),
  define(
    "square-wave",
    "Square Wave Form",
    "M0 80H10V20H50V80H90V20H100",
    true,
  ),
  define(
    "chopped",
    "Chopped Wave Form",
    "M0 80L15 20H35L50 80H60L75 20H95L100 50",
    true,
  ),
];

export const ARROW_SHAPES: ShapeDefinition[] = [
  define("circle-plus", "Circle Plus", circle + "M28 50H72M50 28V72"),
  define("plus", "Plus", "M35 5H65V35H95V65H65V95H35V65H5V35H35Z"),
  define("right-arrow", "Right Arrow", arrow),
  define("left-arrow", "Left Arrow", "M96 35H38V10L4 50L38 90V65H96Z"),
  define("up-arrow", "Up Arrow", "M35 96V38H10L50 4L90 38H65V96Z"),
  define("down-arrow", "Down Arrow", "M35 4V62H10L50 96L90 62H65V4Z"),
  define(
    "left-right-arrow",
    "Left Right Arrow",
    "M3 50L30 12V35H70V12L97 50L70 88V65H30V88Z",
  ),
  define(
    "up-down-arrow",
    "Up Down Arrow",
    "M50 3L88 30H65V70H88L50 97L12 70H35V30H12Z",
  ),
  define(
    "quad-arrow",
    "Quad Arrow",
    "M50 2L72 25H60V40H75V28L98 50L75 72V60H60V75H72L50 98L28 75H40V60H25V72L2 50L25 28V40H40V25H28Z",
  ),
  define(
    "left-top-right",
    "Left Top Right Arrow",
    "M50 2L74 27H61V39H76V27L99 50L76 73V61H24V73L1 50L24 27V39H39V27H26Z",
  ),
  define(
    "bend-arrow",
    "Bend Arrow",
    "M5 95V38Q5 20 25 20H65V5L95 35L65 65V50H35Q25 50 25 60V95Z",
  ),
  define(
    "u-turn-arrow",
    "U Turn Arrow",
    "M5 90V40A35 35 0 0 1 75 40V55H93L65 90L37 55H55V40A15 15 0 0 0 25 40V90Z",
  ),
  define(
    "left-up-arrow",
    "Left Up Arrow",
    "M50 3L85 32H65V70H35V90L3 60L35 30V50H45V32H25Z",
  ),
  define(
    "bend-up-arrow",
    "Bend Up Arrow",
    "M5 70H60V35H40L75 5L100 35H82V92H5Z",
  ),
  define(
    "curve-left-arrow",
    "Curve Left Arrow",
    "M95 85Q70 18 28 38V60L2 28L28 2V20Q85 1 95 85Z",
  ),
  define(
    "curve-right-arrow",
    "Curve Right Arrow",
    "M5 85Q30 18 72 38V60L98 28L72 2V20Q15 1 5 85Z",
  ),
  define(
    "striped-arrow",
    "Striped Right Arrow",
    "M32 35H64V10L96 50L64 90V65H32ZM20 35H27V65H20ZM8 35H15V65H8Z",
  ),
  define(
    "notched-arrow",
    "Notched Right Arrow",
    "M4 35H62V10L96 50L62 90V65H4L20 50Z",
  ),
  define("pentagon-arrow", "Pentagon Arrow", "M5 12H65L95 50L65 88H5Z"),
  define("chevron-arrow", "Chevron Arrow", "M5 12H60L95 50L60 88H5L40 50Z"),
  define(
    "callout-arrow",
    "Callout Right Arrow",
    "M5 10H58V35H72V15L98 50L72 85V65H58V90H5Z",
  ),
  define(
    "callout-double",
    "Callout Left Right Arrow",
    "M30 10H70V35H80V15L99 50L80 85V65H70V90H30V65H20V85L1 50L20 15V35H30Z",
  ),
  define(
    "callout-quad",
    "Callout Quad Arrow",
    "M50 1L70 22H58V30H70V42H78V30L99 50L78 70V58H70V70H58V78H70L50 99L30 78H42V70H30V58H22V70L1 50L22 30V42H30V30H42V22H30Z",
  ),
];

const REGULAR_POLYGON = define(
  "regular-polygon",
  "Regular Polygon",
  regularPolygon(5),
);
export const FIXED_ASPECT_SHAPES = new Set([
  "square",
  "circle",
  "regular-polygon",
]);
export const ALL_SHAPES = [
  ...DOCUMENT_SHAPES,
  ...FLOW_SHAPES,
  ...ELECTRICAL_SHAPES,
  ...ARROW_SHAPES,
  REGULAR_POLYGON,
];
export const SHAPE_MAP = Object.fromEntries(
  ALL_SHAPES.map((shape) => [shape.id, shape]),
);
/** Visible tools; legacy definitions remain readable in saved drawings. */
export const BASIC_SHAPES = [
  "rectangle",
  "square",
  "circle",
  "regular-polygon",
].map((id) => SHAPE_MAP[id]);
export const COORDINATE_SHAPES = ["axis", "grid", "quadratic"].map(
  (id) => SHAPE_MAP[id],
);
export function shapePath(id: string, parameters: Record<string, number> = {}) {
  if (id === "regular-polygon")
    return regularPolygon(
      Math.max(3, Math.min(100, Math.round(parameters.sides ?? 5))),
    );
  if (id === "star")
    return regularPolygon(
      Math.max(3, Math.round(parameters.sides ?? 5)),
      46,
      true,
    );
  if (
    ["pentagon", "hexagon", "octagon", "decagon"].includes(id) &&
    parameters.sides
  )
    return regularPolygon(Math.max(3, Math.round(parameters.sides)));
  return SHAPE_MAP[id]?.path ?? rect;
}
