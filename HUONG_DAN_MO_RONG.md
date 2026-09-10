# Chỉnh sửa và thêm tính năng cho Diagram Draw

## 1. Bắt đầu từ đâu?

Mở thư mục dự án trong VS Code, mở Terminal → New Terminal, chạy:

```bash
npm ci
npm run dev
```

Mở địa chỉ localhost trong terminal. Bây giờ sửa một tệp và nhấn Save; trình duyệt sẽ tự cập nhật.

- Chỉ muốn đổi giao diện: mở `app/current.css`.
- Muốn thêm một hình: mở `app/diagram/shapes.ts`.
- Muốn thêm thao tác: mở `CurrentDiagramEditor.tsx` và `EditorToolbar.tsx`.
- Muốn đổi cơ chế kéo hình/điểm: mở `CurrentCanvas.tsx`.
- Bảng màu: `ColorPicker.tsx`, chuyển đổi Hex/RGBA/HSV trong `colorModel.ts`, hiển thị nền trong `PaintDefinition.tsx`.
- Giao điểm: `intersections.ts` tính điểm trên đường bao; `IntersectionLayer.tsx` vẽ dấu. `blockIntersection` được ưu tiên hơn `intersection` của đối tượng khác.

Giữ một bản JSON của sơ đồ trước khi thử thay đổi mô hình dữ liệu.

## 2. Dữ liệu đi qua ứng dụng như thế nào?

`DiagramDocument` chứa kích thước canvas, thiết lập lưới và mảng `elements`. Mỗi phần tử là dữ liệu thuần. React đọc dữ liệu này để vẽ SVG.

Khi kéo hình, canvas cập nhật tọa độ trong tài liệu. Bộ history giữ trạng thái trước và sau một thao tác. Khi thao tác kết thúc, tài liệu được tự lưu trong trình duyệt.

| Thành phần                    | Trách nhiệm                                        |
| ----------------------------- | -------------------------------------------------- |
| currentDocument.ts            | Tạo trang trắng, đối tượng và ví dụ                |
| types.ts                      | Khai báo kiểu TypeScript của dữ liệu               |
| shapes.ts                     | Định nghĩa SVG và danh sách hình được hiển thị     |
| CurrentToolPalette.tsx        | Các nhóm công cụ bên trái                          |
| CurrentCanvas.tsx             | Pointer events và lớp tay nắm                      |
| sceneGeometry.ts              | Tọa độ, Bézier, điểm nối, biến đổi                 |
| pathBounds.ts                 | Cực trị đường SVG để tính khung chọn đúng với hình |
| SceneElement.tsx              | Render hình, nhãn, đường và marker                 |
| MathInput.tsx                 | Bộ nhập công thức MathLive                         |
| MathFormula.tsx / mathSvg.ts  | Chuyển LaTeX sang SVG                              |
| plotting.ts / PlotGraphic.tsx | Parser số học và hình đồ thị                       |
| PlotDialog.tsx                | Cấu hình đồ thị                                    |
| EditorControls.tsx            | Dropdown, ô số, màu, độ dày, marker                |
| EditorToolbar.tsx             | Thanh thuộc tính theo lựa chọn                     |
| CurrentDiagramEditor.tsx      | Trạng thái ứng dụng, clipboard, lưu, lệnh          |
| currentHistory.ts             | Undo/redo và giao dịch kéo                         |
| currentExporters.ts           | Kiểm tra JSON, xuất ảnh và TikZ                    |

## 3. Đổi giao diện

Trong `app/current.css`:

| Selector                    | Nội dung                                    |
| --------------------------- | ------------------------------------------- |
| .drawing-app                | Nền và khoảng cách quanh cửa sổ             |
| .drawing-workarea           | Chia cột trái/phải; cột trái mặc định 281px |
| .category-heading           | Tiêu đề nhóm hình                           |
| .shape-grid / .shape-button | Số cột, kích thước các icon                 |
| .drawing-toolbar            | Thanh thuộc tính cao 35px                   |
| .drawing-bottom-bar         | Zoom, Guides và tọa độ                      |
| .drawing-footer             | Hai nút Close/Saved                         |
| .control-popover            | Menu thả xuống                              |
| .inline-text-editor         | Vùng sửa nhãn                               |

Ví dụ đổi sidebar thành 300px:

```css
.drawing-workarea {
  grid-template-columns: 300px minmax(0, 1fr);
}
```

Đổi canvas mặc định trong `blankDocument()` của `currentDocument.ts`:

```ts
return {
  version: 1,
  width: 900,
  height: 500,
  grid: {
    visible: true,
    major: false,
    size: 10,
    snap: false,
    snapShapes: true,
    editOnly: false,
  },
  elements: [],
};
```

Thay đổi mặc định không ghi đè sơ đồ đã tự lưu. Chọn ··· → New Drawing để thấy giá trị mới.

## 4. Thêm hình mới — cách ngắn nhất

Các hình dùng đường SVG trong hệ tọa độ 100 × 100. Thêm một dòng vào mảng `DOCUMENT_SHAPES` trong `shapes.ts`:

```ts
define(
  "house",
  "House",
  "M10 45L50 10L90 45V90H60V62H40V90H10Z"
),
```

Thêm ID `"house"` vào danh sách `BASIC_SHAPES` ở cuối tệp rồi lưu. Hình House sẽ xuất hiện trong bảng công cụ và có sẵn chọn, kéo, resize, xoay, màu nét/nền, JSON và xuất SVG.

- `id` phải duy nhất, ổn định, chỉ nên dùng chữ thường/số/dấu gạch ngang.
- Đường khép kín: kết thúc bằng `Z`.
- Nếu chỉ có nét, không được tô nền: truyền `true` làm đối số thứ tư của `define()`.
- `BASIC_SHAPES` quyết định những hình xuất hiện trong Shapes; `COORDINATE_SHAPES` quyết định các công cụ trong Axis, Grid. Các định nghĩa cũ vẫn được giữ để đọc sơ đồ đã lưu.
- Mảng `ALL_SHAPES` và `SHAPE_MAP` tự tổng hợp; không cần thêm một kiểu đối tượng mới.

Ví dụ dữ liệu đã tạo:

```json
{
  "id": "house-1",
  "type": "shape",
  "shape": "house",
  "x": 150,
  "y": 100,
  "width": 140,
  "height": 110,
  "rotation": 0,
  "style": {
    "stroke": "#000000",
    "fill": "transparent",
    "strokeWidth": 1,
    "dash": "solid",
    "opacity": 1
  }
}
```

## 5. Thêm một tham số cho hình

Ví dụ thêm hình có độ bo góc thay đổi:

1. Dùng `parameters` có sẵn để lưu tham số, chẳng hạn `parameters.radius`.
2. Trong `shapePath(id, parameters)`, thêm nhánh trả về đường theo giá trị đó:

```ts
if (id === "custom-rounded") {
  const r = Math.max(0, Math.min(25, parameters?.radius ?? 8));
  return `M${r} 0H${100 - r}Q100 0 100 ${r}V${100 - r}Q100 100 ${100 - r} 100H${r}Q0 100 0 ${100 - r}V${r}Q0 0 ${r} 0Z`;
}
```

3. Trong `EditorToolbar.tsx`, khi `e.shape === "custom-rounded"`, hiển thị:

```tsx
<NumberControl
  label="Corner Radius"
  value={e.parameters?.radius ?? 8}
  min={0}
  max={25}
  onChange={(radius) => onPatch({ parameters: { ...e.parameters, radius } })}
/>
```

`SceneElement` tự gọi `shapePath()`, nên thay đổi được phản ánh ngay trên canvas và ảnh xuất.

Nếu cần một trường hoàn toàn mới thay vì `parameters`, khai báo trong `DiagramElement` ở `types.ts`, thêm giá trị mặc định nếu cần và mở rộng `validDocument()` để kiểm tra dữ liệu nhập.

## 6. Thêm nút lệnh và phím tắt

Ví dụ thêm lệnh đặt góc xoay về 0:

Trong `run(command)` ở `CurrentDiagramEditor.tsx`:

```ts
case "reset-rotation":
  patch({ rotation: 0, skewX: 0 });
  break;
```

Trong menu ··· của `EditorToolbar.tsx`:

```tsx
<button
  className="menu-row"
  data-close-menu
  onClick={() => onCommand("reset-rotation")}
>
  Reset Rotation
</button>
```

Muốn gắn phím tắt, thêm vào bộ xử lý `keydown` ở editor. Giữ kiểm tra `typing()` để phím không kích hoạt khi người dùng đang nhập chữ hoặc công thức.

## 7. Chỉnh tương tác và undo/redo

Các thao tác nằm trong `CurrentCanvas.tsx`:

- `backgroundDown`: bắt đầu tạo hình hoặc vùng chọn.
- `elementDown`: chọn/kéo đối tượng.
- `move`: cập nhật thao tác đang diễn ra.
- `up`: kết thúc thao tác.
- `gesture.current`: giữ dữ liệu gốc và loại thao tác.
- `patch()`: cập nhật một phần tử trong lúc kéo.
- `updateText()`: đổi nhãn và đo lại kích thước công thức.

Một thao tác kéo phải dùng đúng chuỗi:

```ts
onBegin(); // trước khi thay đổi
onReplace(nextDocument); // mỗi lần pointer di chuyển
onEnd(); // khi thả chuột
// hoặc onCancel() khi nhấn Escape
```

Với một nút bấm thay đổi ngay lập tức, dùng `history.commit()`. Không sửa trực tiếp thuộc tính trong `document.elements`: hãy tạo object/mảng mới để render, history và autosave nhận đúng thay đổi.

## 8. Connector

Một đường nối lưu `fromId` và `toId` của hai đối tượng. `resolveElement()` tính lại điểm đầu/cuối ở cạnh đối tượng trước khi render và xuất.

Muốn hỗ trợ điểm nối chuyên dụng trên từng hình:

1. Thêm trường như `fromAnchor?: "top" | "right" | "bottom" | "left"`.
2. Sửa hàm `anchor` bên trong `resolveElement()`.
3. Cho `startConnect` hoặc thao tác kéo endpoint lưu anchor đó.
4. Giữ cùng quy tắc trong mọi nơi render/export.

Hiện tại xóa một đối tượng sẽ xóa các connector đang nối với đối tượng đó. Sao chép cả hai đầu và đường nối sẽ cấp ID mới và nối đúng các bản sao.

## 9. Công thức và đồ thị

Công thức:

- `MathInput.tsx` cấu hình MathLive và phím kết thúc.
- `mathSvg.ts` cấu hình các gói TeX, giới hạn đầu vào và bộ nhớ đệm MathJax.
- `MathFormula.tsx` đặt SVG công thức vào đúng vị trí.
- Font đã có trong `public/mathlive/fonts`; cập nhật font nếu đổi phiên bản MathLive.

Đồ thị:

- `PlotSettings` trong `types.ts` lưu kiểu và dữ liệu.
- `compileExpression()` dùng parser số học; không dùng `eval` hoặc `new Function`.
- Muốn thêm hàm số mới, thêm vào danh sách hàm cho phép của parser.
- Thêm loại plot: cập nhật union `PlotSettings.kind`, menu palette, hộp cài đặt, renderer và validator.
- Chọn thư viện đồ thị 3D đầy đủ nếu cần camera, contour, heatmap hoặc mesh tương đương Mathcha; hiện renderer 3D là khung dây.

## 10. Lưu và xuất

- JSON: dữ liệu gốc, dùng để mở/sửa lại.
- SVG: hình vector, công thức được chuyển thành path để không phụ thuộc font bên ngoài.
- PNG/JPEG: raster từ SVG; tỉ lệ 1–4×.
- TikZ: đường bao lấy mẫu từ SVG đang hiển thị; nhãn toán giữ nguyên LaTeX.
- `latexDocument()` tạo file standalone cho XeLaTeX. Để chèn vào dự án LaTeX có sẵn, chỉ sao chép phần `tikzpicture`; dự án cần các gói TikZ và AMS tương ứng.
- Ảnh chèn hiện đi cùng JSON/SVG/PNG, chưa được đóng gói trong .tex.
- Mọi tay nắm phải gắn `data-ui`, mọi vùng bắt chuột phải gắn `data-hit-area` để bị loại khỏi ảnh xuất.

Không thay `version` của JSON nếu thay đổi vẫn tương thích. Với thay đổi phá vỡ dữ liệu cũ, viết hàm chuyển đổi rồi mới tăng version.

## 11. Kiểm tra sau khi sửa

Khung chọn đơn dùng `sceneBounds()` trong hệ tọa độ của hình; chọn nhóm và chọn bằng vùng kéo dùng `worldBounds()` sau xoay/nghiêng. `SceneElement` và lớp selection cùng dùng `elementTransform()`. Không lấy cả ô SVG 100 × 100 làm bounds vì nhiều đường vẽ có khoảng đệm. Khi sửa resize, giữ phép đổi tâm trong `resizeElements()` để hình không nhảy khi kéo tay nắm.

`drawElement()` đặt đường bao thực tế vào vùng kéo, bù khoảng đệm SVG và giữ nguyên góc bắt đầu ở cả bốn hướng. `moveLineEndpoint()` dịch handle tương ứng với đầu mút, đồng thời đổi gốc lưu control point và bù tâm xoay/nghiêng. Không nhân lại control point theo chiều dài mới của đường khi người dùng chỉ kéo một endpoint.

`boxed` chỉ thay kiểu tay nắm khi chọn Line/Curve; không thêm hình chữ nhật vào bản vẽ hay ảnh xuất. Các trường `startMarkerSize`, `endMarkerSize`, `midMarkerSize` dùng khoảng 0.1–2 cho độ dày danh nghĩa của ký hiệu; renderer co giãn ký hiệu 10 đơn vị tương ứng. Trường `markerSize` cũ vẫn được đọc để giữ hình thức của JSON đã lưu.

Line/Curve dùng `points` khi đã bật chỉnh nhiều vertex. `lineVertices()` trả về hai đầu mút cũ nếu `points` chưa có, nên JSON cũ vẫn hoạt động. `addLineVertex()` chèn đúng điểm giữa của đoạn đang hiển thị; với Bézier hai đầu mút, điểm mới là giá trị tại t=0.5 chứ không phải trung điểm của khung. `moveLineVertex()` và `removeLineVertex()` dựng lại hệ tọa độ chuẩn hóa, bù tâm xoay/nghiêng, giữ các vertex còn lại tại đúng vị trí canvas và tách liên kết đầu mút khi chính đầu đó bị sửa. Curve nhiều vertex dùng Catmull–Rom đổi sang các đoạn cubic Bézier mở; curve còn hai vertex tiếp tục dùng `control1` và `control2`. `linePoint()` dùng chung cho marker Middle, break và hướng marker.

Trong `CurrentCanvas.tsx`, dấu cộng ở giữa mỗi đoạn gọi `addLineVertex()`. Nút đỉnh gọi gesture `point` hoặc `endpoint`; vertex đang chọn hiện nút xóa đỏ và Delete/Backspace chỉ xóa vertex đó khi đường còn hơn hai vertex. Mỗi thao tác thêm, xóa hoặc kéo vertex là một bước undo/redo. Khi `boxed` bật, các nút vertex được ẩn và khung resize/xoay hoạt động như trước.

`style.fillPaint` là kiểu phân biệt `gradient` hoặc `pattern`; `style.fill` là màu Basic. Khi thêm kiểu tô mới, cập nhật `types.ts`, `ColorPicker.tsx`, `PaintDefinition.tsx` và `validDocument()`. Bảng màu và thanh Size gom một lần kéo thành một bước undo bằng gesture của toolbar.

Giao điểm sử dụng `contourIntersections()` và các contour từ `svgPathSegments()` trong cùng bộ đọc đường SVG với bounds. Line–ellipse giải phương trình bậc hai trong hệ tọa độ ellipse, kể cả xoay/nghiêng; hai circle dùng phép giải hình học nên nhận cả tiếp xúc. Các cặp Bézier/arc khác được chia thích nghi với dung sai 0.05 đơn vị canvas. Các subpath không bị nối nhầm. Image/Text/Plot dùng khung đối tượng; có thể mở rộng `elementSegments()` nếu muốn bắt giao điểm của riêng dữ liệu plot.

Menu **Intersection** trên toolbar bật trường `intersection` của đối tượng, chọn kiểu dấu và điều chỉnh `intersectionMarkerSize` trong khoảng 0.1–2. Dấu mới dùng mặc định `DEFAULT_INTERSECTION_MARKER_SIZE = 0.4`. Thanh `SizeSlider` dùng chung với marker của Line/Curve. `intersectionAppearance()` chuyển kích cỡ thành bán kính và độ dày nét cho cả canvas lẫn TikZ; vẫn đọc `intersectionSize` từ JSON cũ và giữ nguyên giao diện cũ. Điểm giao được tính lại khi tài liệu thay đổi; SVG/PNG dùng lớp giao điểm đang hiển thị.

`snapping.ts` gom đầu mút, trung điểm, đỉnh, tâm và giao điểm thành các mục tiêu dùng chung. `svgPathAnchors()` lấy điểm từ các lệnh SVG gốc, không dùng đỉnh giả sinh ra khi chia nhỏ đường cong. Trung điểm Bézier lấy tại tham số t=0.5, cùng vị trí marker Middle mặc định. Mọi điểm được biến đổi sang hệ tọa độ canvas trước khi tìm điểm gần nhất bằng `nearestSnapTarget()`, với dung sai theo zoom. `translationSnap()` căn một điểm thực trên hình đang kéo tới mục tiêu và giữ độ lệch giữa con trỏ với chỗ đã bấm vào hình.

`CurrentCanvas.tsx` giữ danh sách mục tiêu tại thời điểm bắt đầu kéo đầu mút, để đầu mút có thể bắt lại chỗ giao của chính đường đó mà mục tiêu không chạy theo con trỏ. `dropLineEndpoint()` ưu tiên tọa độ đã bắt khi thả chuột, tránh cơ chế tự nối vào khung hình làm lệch điểm. `movePolygonPoint()` bù vị trí tâm xoay sau khi thay đổi khung đa giác để giữ các đỉnh còn lại. `blockIntersection` chỉ chặn dấu và mục tiêu giao điểm; đầu mút và đỉnh vẫn có thể bắt được.

Chọn vùng gọi `elementTouchesRect()` để kiểm tra vùng quét có thực sự chạm nét của đối tượng, thay vì buộc toàn bộ `worldBounds()` phải nằm trong vùng. Nhờ đó, vùng nằm hoàn toàn trong khoảng rỗng của Circle/Ellipse không chọn nhầm hình. `SceneElement.tsx` đặt Shape/Polyline ở chế độ hit-test theo `stroke`; lớp hit vô hình rộng hơn nét thật giúp vẫn dễ bấm, nhưng fill hoặc khoảng rỗng bên trong không kích hoạt chọn.

Vùng SVG nhận focus trong `onPointerDownCapture`, trước khi gesture gọi `preventDefault()`. Nhờ đó Delete/Backspace không còn bị giữ ở ô thuộc tính sau khi người dùng bấm chọn hình. Phím xóa vẫn sửa nội dung khi đang gõ chữ/số, còn thanh range và checkbox cho phép xóa đối tượng. Menu dùng listener capture để đóng khi bấm vào vùng vẽ.

Các tài liệu cũ có `intersectionWith` vẫn được đọc: không có trường này nghĩa là giao với mọi đối tượng; mảng rỗng nghĩa là không còn liên kết. Khi sao chép cả nhóm, các liên kết được đổi sang ID của bản sao. Bật lại Intersection trên toolbar chuyển đối tượng sang chế độ giao với mọi đối tượng. Undo/redo và JSON lưu các thuộc tính này cùng tài liệu.

Chạy:

```bash
npx tsc --noEmit
node --test tests/*.test.cjs
npm run build
```

Sau đó thử đúng tính năng vừa đổi: tạo, sửa, undo/redo, Save JSON → Open JSON và xuất SVG. Khi sửa tọa độ, thử thêm zoom, xoay và đối tượng được nhóm. Khi sửa công thức, thử phân số, căn, chỉ số kép và ma trận.

Các giới hạn về mức độ tương đồng với Mathcha được ghi trong README.md. Nên mở rộng từ tính năng cụ thể bạn cần thay vì phụ thuộc vào bundle Mathcha cũ trong ZIP tham chiếu.
