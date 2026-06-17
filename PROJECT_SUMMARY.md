# Tóm tắt dự án ukeire-prototype

## 1) Mục tiêu dự án
Dự án là một ứng dụng web client-side để quản lý và đánh dấu (annotate) tài liệu 納品書.
Người dùng có thể đăng nhập, tải ảnh/PDF, vẽ ghi chú trực tiếp trên canvas, cập nhật trạng thái kiểm tra theo ngày, và lưu dữ liệu ngay trên trình duyệt.

## 2) Kiến trúc hiện tại
- Kiến trúc đa trang đơn giản:
  - Trang chính cho người dùng: `index.html` + `app-main.js`
  - Trang quản trị: `admin.html` + `admin.js`
- Giao diện dùng CSS thuần trong `style.css`.
- Xử lý PDF phía client bằng PDF.js (CDN).
- Không có backend; dữ liệu lưu bằng `localStorage`.

## 3) Thành phần theo file

### `index.html`
- Khai báo màn hình đăng nhập và khung ứng dụng chính sau đăng nhập.
- Có sidebar công cụ (upload, trạng thái hồ sơ, brush/eraser/crop, zoom, rotate, undo/clear).
- Có panel danh sách hồ sơ theo ngày và workspace gồm 3 lớp canvas (`bg-canvas`, `paint-canvas`, `crop-canvas`).
- Nạp PDF.js và script chính `app-main.js`.

### `app-main.js`
- Điều phối toàn bộ luồng người dùng:
  - Xác thực/phiên đăng nhập: `ensureDefaultAdmin()`, `handleLogin()`, `showAppForUser()`, `logout()`.
  - Quản lý hồ sơ theo ngày: `getRecords()`, `saveRecords()`, `renderRecordsByDate()`, `openRecord()`.
  - Upload và xử lý file: `parseFileToDataUrl()` (hỗ trợ image/PDF), `createRecordFromUpload()`.
  - Lưu metadata + nội dung canvas: `saveCurrentRecordMetaAndCanvas()`, `autoSaveCurrentRecord()`.
- Cung cấp tính năng canvas:
  - Vẽ/xóa, undo, clear.
  - Pan, zoom, rotate, fit-to-screen.
  - Crop bằng lớp canvas riêng.
  - Quản lý trạng thái hiển thị công cụ và tương tác mobile (pointer/pinch).

### `admin.html`
- Giao diện quản trị người dùng.
- Có form tạo người dùng mới (username, password, role, brush color).
- Có bảng danh sách người dùng để cập nhật hoặc xóa.
- Nạp script `admin.js`.

### `admin.js`
- Kiểm soát truy cập trang admin: chỉ cho phép user có role `admin`.
- Quản lý người dùng:
  - Tạo mới: `createUser()`
  - Hiển thị danh sách: `renderUsers()`
  - Cập nhật role/màu bút/mật khẩu
  - Xóa user
- Có ràng buộc an toàn: không cho xóa hoặc hạ quyền admin cuối cùng.

### `style.css`
- Định nghĩa toàn bộ giao diện cho login/app/admin.
- Bố cục sidebar, records panel, workspace canvas và trạng thái nút công cụ.
- Hỗ trợ responsive/mobile (overlay, sidebar toggle, hiển thị phù hợp màn hình nhỏ).

## 4) Luồng sử dụng chính
1. Người dùng đăng nhập ở màn hình auth.
2. Hệ thống mở app chính, gắn thông tin user/role và ngày lọc mặc định là hôm nay.
3. Người dùng upload ảnh/PDF để tạo hồ sơ mới.
4. Người dùng mở hồ sơ, chỉnh metadata (tên, checked/unchecked), và annotate trên canvas.
5. Dữ liệu được lưu local (thủ công hoặc tự động ở các điểm chuyển trạng thái).

## 5) Dữ liệu và phân quyền
- LocalStorage keys chính:
  - `ukeire_users_v1`: danh sách user
  - `ukeire_session_v1`: phiên đăng nhập hiện tại
  - `ukeire_nohinsho_records_v1`: dữ liệu hồ sơ theo ngày
- Phân quyền cơ bản:
  - `user`: dùng chức năng nghiệp vụ chính
  - `admin`: thêm quyền vào trang quản trị người dùng

## 6) Công nghệ và phạm vi
- Công nghệ: HTML/CSS/JavaScript thuần + PDF.js.
- Phạm vi hiện tại: prototype chạy hoàn toàn phía client, không có API/server/database trung tâm.
- Ghi chú: tài liệu này chỉ tóm tắt các thành phần đang dùng trực tiếp trong luồng hiện hành.