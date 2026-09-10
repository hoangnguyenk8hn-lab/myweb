# Diagram Draw — giao diện Drawing 

Ứng dụng vẽ độc lập bằng React + TypeScript + SVG. 

Mã nguồn được viết lại và có thể chỉnh sửa. Ứng dụng không cần đăng nhập Mathcha và không tải bundle Mathcha để chạy.

## Chạy trên máy

Cài Node.js 22.13 trở lên. Giải nén, mở terminal trong thư mục chứa `package.json`:

```bash
npm ci
npm run dev
```

Mở địa chỉ localhost được terminal in ra (bản portable dùng cổng 5173). Giữ terminal mở khi dùng ứng dụng. Sửa mã rồi lưu tệp: trình duyệt sẽ cập nhật.

Kiểm tra và chạy bản production:

```bash
npx tsc --noEmit
npm run build
npm run start
```

Các gói được khóa phiên bản trong `package-lock.json`. Font toán được đặt trong `public/mathlive/fonts`. Source ZIP không kèm node_modules, dữ liệu cá nhân hoặc thông tin đăng nhập.

## Cách dùng

1. Trong Shapes, chọn Rectangle, Square, Circle hoặc Regular Polygon rồi kéo trong vùng lưới. Chọn đa giác đã vẽ và sửa ô Sides trên thanh thuộc tính để chọn từ 3 đến 100 cạnh. Nhấn Esc để về chế độ chọn.
2. Chọn đối tượng: thanh trên sẽ đổi sang thuộc tính của đối tượng đó. Kéo các ô xanh để đổi kích thước; kéo nút tròn cam để xoay.
3. Chọn ƒx, bấm trên canvas rồi gõ công thức. Có thể gõ LaTeX như `\\frac{a}{b}`, `C_{n+2}^{2}`, `\\sqrt{x}`. Nhấn Ctrl/Cmd+Enter hoặc ✓ để kết thúc. Nháy đúp để sửa lại.
4. Với Polygon / Curved Polygon, bấm lần lượt các điểm rồi nhấn Enter hoặc nháy đúp để kết thúc.
5. Kéo mũi tên màu xám bên cạnh một nhãn đã chọn sang đối tượng khác để tạo connector. Đường nối đi theo hai đối tượng khi chúng di chuyển.
6. Bỏ chọn đối tượng để thấy Options và Export. Nút Image mở các lựa chọn PNG/JPEG/SVG, tỉ lệ 1–4×, nền trắng/trong suốt và lưới.
7. Menu ··· có Undo/Redo, nhóm/tách nhóm, xếp lớp, căn hàng, mở/lưu JSON, tạo trang mới, nạp ví dụ và đổi kích thước canvas.
8. Trong nhóm Plot, chọn loại đồ thị, sửa biểu thức hoặc bảng điểm; phần xem trước thay đổi theo dữ liệu.
9. Với Line/Curve, các ô **Tail / Head / Middle** hiển thị ký hiệu rõ ràng. Chọn một ký hiệu rồi kéo **Size 0.1–2 px**; kích cỡ mỗi vị trí độc lập. `∅` nghĩa là không có ký hiệu. Size là độ dày danh nghĩa của nét ký hiệu, hình ký hiệu được co giãn tương ứng; độ dày thân đường có thanh Size riêng.
10. **Boxed** bật khung chọn để resize/xoay toàn bộ Line/Curve. Tắt Boxed để sửa trực tiếp. Kéo nút vuông xanh ở đầu mút hoặc nút vàng tại đỉnh để di chuyển. Bấm dấu **+** giữa hai đỉnh để thêm vertex; chọn một vertex rồi bấm dấu **× đỏ** cạnh nó hoặc nhấn Delete/Backspace để xóa. Line/Curve luôn giữ tối thiểu hai vertex. Curve có từ ba vertex trở lên trở thành đường cong trơn đi qua từng vertex; khi còn hai vertex, hai control handle Bézier vẫn chỉnh được như trước.
11. Chọn đối tượng, mở **Intersection** rồi bật **Intersection** hoặc chọn vòng tròn/chấm/dấu chéo. Dấu xuất hiện tại các chỗ cắt nhau và tự cập nhật khi kéo/resize/xoay. Kích cỡ mặc định là **0.4 px**; kéo **Size 0.1–2 px** để chỉnh theo cùng cách với marker của Line/Curve. Khi vẽ hoặc chỉnh đầu đường, đưa con trỏ gần dấu để bắt đúng giao điểm; vòng hồng báo đã bắt điểm. Thao tác này hoạt động cả khi tắt Snap to Other Shapes. **Block Intersection** chặn dấu và bắt điểm liên quan đến đối tượng đó. Ảnh, nhãn và plot dùng đường biên khung.
12. Màu nét và Fill dùng vùng chọn độ bão hòa/độ sáng, thanh Hue/Alpha, ô Hex–RGBA và các màu mẫu. **Change Preset Colors** cho phép lưu màu đang chọn vào một ô mẫu. Fill có **Basic / Gradient / Pattern**. Màu mẫu lưu trong trình duyệt.
13. **Bắt điểm:** khi vẽ mới, kéo đầu mút, chỉnh đỉnh hoặc di chuyển hình, đưa điểm cần nối tới gần đầu mút, trung điểm, đỉnh hoặc tâm của đối tượng khác. Vòng hồng kèm nhãn cho biết điểm đã bắt. Đa giác bắt được từng đỉnh và trung điểm từng cạnh; đường cong dùng điểm giữa trùng vị trí marker Middle mặc định. Các điểm này tự có sẵn, không cần bật Intersection. Khi di chuyển hình, giữ Alt để tạm bỏ bắt điểm.
14. **Xóa:** bấm chọn nét/hình rồi nhấn Delete hoặc Backspace; cũng có thể bấm nút × đỏ hoặc chuột phải → Delete. Sau khi chỉnh Size hay thuộc tính, bấm lại lên hình để bàn phím trở về vùng vẽ. Với đối tượng đang khóa, mở khóa trước khi xóa. Ctrl/Cmd+Z hoàn tác thao tác xóa.
15. **Chọn:** kéo vùng chọn chỉ cần chạm một phần của nét/đối tượng là chọn. Với các Shape như Circle, Ellipse, Rectangle và đa giác, thao tác bấm chỉ nhận đường viền; phần bên trong không chọn, kể cả khi hình có Fill.

**Lưu để sửa tiếp:** dùng ··· → Save JSON, hoặc Ctrl/Cmd+S. Sau này mở bằng ··· → Open JSON. PNG/SVG là bản xuất hình; JSON là tài liệu để mở lại đầy đủ các đối tượng trong ứng dụng.

Saved nghĩa là sơ đồ đã lưu trong trình duyệt đang dùng. Dữ liệu này không tự đồng bộ sang máy khác. Nếu trình duyệt hết dung lượng, nút sẽ báo Save failed; hãy lưu JSON.

## Chức năng đã triển khai

- Shapes gồm hình chữ nhật, hình vuông, hình tròn và đa giác đều tùy số cạnh. Axis, Grid chỉ có axis, grid và y=x². Đã bỏ nhóm Flowchart và Arrow Shapes khỏi bảng công cụ.
- Khung chọn tính theo đường bao SVG thực tế, cùng phép xoay/nghiêng với hình. Resize và chọn nhóm dùng đúng khung này; hình vuông, hình tròn và đa giác đều giữ tỉ lệ khi đổi kích thước.
- Math / Text / Text Box, hình cơ bản, đa giác, đa giác cong, đường thẳng, Bézier, mũi tên, vẽ tự do và ảnh.
- Chọn nhiều, kéo vùng chọn, nhóm/tách, di chuyển, đổi kích thước, xoay, nghiêng, khóa, căn hàng, phân bố và đổi thứ tự trước/sau.
- Nét liền/đứt/chấm, màu nét/nền/chữ, độ dày, độ trong suốt, đầu/cuối/giữa đường, ngắt đường.
- Thêm, xóa và kéo từng vertex của Line/Curve; chỉnh trực tiếp đầu mút và hai điểm điều khiển Bézier; connector bám vào đối tượng.
- Kéo tạo hình giữ cố định góc bắt đầu của đường bao, không trượt do khoảng đệm SVG. Boxed cho Line/Curve; control handle theo đúng đầu mút.
- Giao điểm tự cập nhật khi di chuyển, resize hoặc xoay hình; chặn dấu giao điểm trên từng đối tượng. Màu RGBA, gradient và pattern đi cùng JSON/SVG/PNG.
- Hai mức lưới, kích thước ô, snap vào lưới/đối tượng, hướng dẫn tâm, zoom và pan.
- Công thức bằng MathLive, hiển thị vector bằng MathJax: phân số, căn, chỉ số, tổng, ma trận…
- Function, parametric, scatter, line, area, bar, pie và mặt 3D dạng khung dây.
- Undo/redo theo từng thao tác kéo, clipboard nội bộ, phím tắt, tự lưu; mở lại JSON của bản dựng trước.
- Xuất PNG, JPEG, SVG, JSON và mã TikZ/.tex.

## Mức độ tương đồng và giới hạn

Đây là bản tái dựng giao diện và thao tác chính, **chưa phải bản sao giống hệt 100% Mathcha**. Kết quả đối chiếu là cửa sổ Drawing, không bao gồm trình soạn thảo tài liệu bên ngoài.

- Bộ nhập toán dùng MathLive/MathJax nên menu gợi ý, bàn phím toán và cách gõ không hoàn toàn giống engine của Mathcha.
- Hình SVG được dựng lại; một số hình phức tạp chưa có toàn bộ tay nắm tham số chuyên dụng của Mathcha.
- Chưa có toàn bộ Plotly charts của Mathcha như contour, heatmap, scatter/mesh 3D và trình cấu hình ma trận giao hoán. Mặt 3D hiện là khung dây cố định, chưa có xoay camera.
- JSON là định dạng riêng của dự án. Không mở trực tiếp tài liệu gốc hoặc clipboard nội bộ của Mathcha.
- SVG/PNG giữ công thức dưới dạng nét vector/ảnh. TikZ giữ công thức là LaTeX và chuyển đường bao thành các đoạn lấy mẫu có thể sửa; ảnh chèn không được nhúng vào .tex. Một số chi tiết clipping và độ nghiêng chữ trong TikZ có thể khác SVG.
- Đường thẳng–circle/ellipse và circle–circle có phép giải trực tiếp, bao gồm tiếp xúc. Các cặp đường cong khác dùng đường bao lấy mẫu với sai số khoảng 0.05 đơn vị canvas; các đường gần tiếp xúc trong khoảng sai số này có thể không có dấu. Hai đường trùng nhau không được biểu diễn thành vô số điểm. TikZ dùng kiểu pattern chuẩn của PGF, nên khoảng cách họa tiết và alpha của từng điểm màu gradient có thể khác SVG; dùng SVG/PNG nếu cần giữ chính xác hiệu ứng tô màu.
- File .tex dùng XeLaTeX để hỗ trợ chữ Unicode. Chưa kiểm chứng mọi lệnh LaTeX do người dùng tự nhập.
- Đã kiểm tra TypeScript, production build, parser đồ thị, công thức SVG, dữ liệu nhập và undo/redo/connector. Chưa xác nhận tương đồng từng pixel trên mọi kích thước màn hình.

## Sửa và mở rộng

Đọc **HUONG_DAN_MO_RONG.md** trong cùng thư mục. Các điểm vào chính:

| Muốn sửa                             | Tệp                                                 |
| ------------------------------------ | --------------------------------------------------- |
| Màu, kích thước, vị trí giao diện    | app/current.css                                     |
| Thêm hình vào thư viện               | app/diagram/shapes.ts                               |
| Sắp xếp nhóm công cụ                 | app/diagram/CurrentToolPalette.tsx                  |
| Thanh thuộc tính và menu             | app/diagram/EditorToolbar.tsx                       |
| Bảng màu, Hex/RGBA, gradient/pattern | app/diagram/ColorPicker.tsx; PaintDefinition.tsx    |
| Giao điểm và quy tắc chặn dấu        | app/diagram/intersections.ts; IntersectionLayer.tsx |
| Vẽ, kéo, resize, xoay, sửa nhãn      | app/diagram/CurrentCanvas.tsx                       |
| Lưu, phím tắt, lệnh cấp tài liệu     | app/diagram/CurrentDiagramEditor.tsx                |
| Mô hình JSON                         | app/diagram/types.ts                                |
| Hiển thị từng đối tượng              | app/diagram/SceneElement.tsx                        |
| Xuất ảnh / JSON / TikZ               | app/diagram/currentExporters.ts                     |


