# Frontend và Backend

Tài liệu này mô tả ngắn gọn kiến trúc hiện tại của project `ukeire-prototype`.

## Tổng quan

Project đang đi theo mô hình:

- `frontend` là ứng dụng static chạy trong trình duyệt
- `backend` là một server `Express`
- dữ liệu và xác thực được lưu trên `Supabase`

Điểm quan trọng:

- project **không** có frontend framework riêng như React/Vue
- project **không** có backend tách thành nhiều service
- toàn bộ backend hiện nằm trong một file: [`src/server.js`](../src/server.js)

## Frontend

Frontend nằm trong thư mục [`public/`](../public/).

### Các file chính

- [`public/index.html`](../public/index.html): màn hình chính cho người dùng
- [`public/admin.html`](../public/admin.html): màn hình quản trị
- [`public/js/dashboard.js`](../public/js/dashboard.js): logic của màn hình chính
- [`public/js/admin-panel.js`](../public/js/admin-panel.js): logic của màn hình admin
- [`public/css/style.css`](../public/css/style.css): style chung
- [`public/manifest.json`](../public/manifest.json): cấu hình PWA
- [`public/sw.js`](../public/sw.js): service worker

### Frontend làm gì

Frontend chịu trách nhiệm:

- hiển thị giao diện đăng nhập
- hiển thị danh sách và chi tiết `nohinsho`
- upload file hoặc folder
- chỉnh sửa, lưu, xoá record
- quản lý annotation và lịch sử chỉnh sửa
- phần admin để quản lý user và dữ liệu record

### Cách frontend giao tiếp với backend

Frontend gọi trực tiếp các REST API nội bộ như:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/records`
- `POST /api/records`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`
- `POST /api/uploads`

Token đăng nhập được lưu trong `localStorage` với key:

- `ukeire_auth_token_v2`

### Đặc điểm UI

- `public/index.html` là giao diện làm việc chính
- `public/admin.html` là giao diện quản trị
- có hỗ trợ PWA qua `manifest.json` và `sw.js`
- frontend dùng `pdf.js` từ CDN để xử lý file PDF

## Backend

Backend nằm ở [`src/server.js`](../src/server.js) và dùng:

- `express` để tạo API
- `@supabase/supabase-js` để đọc/ghi dữ liệu
- `bcryptjs` để hash và kiểm tra mật khẩu
- `ws` để hỗ trợ realtime client cho Supabase

### Backend làm gì

Backend chịu trách nhiệm:

- xác thực user bằng username/password
- tạo session token
- kiểm tra quyền `admin`
- CRUD user
- CRUD record
- upload file lên Supabase Storage
- lưu annotation và lịch sử chỉnh sửa
- soft delete và hard purge record đã xoá mềm

### Các nhóm API chính

#### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

#### Users

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

#### Records

- `GET /api/records`
- `POST /api/records`
- `GET /api/records/:id`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`

#### Annotation / History

- `GET /api/records/:id/annotations`
- `POST /api/records/:id/annotations`
- `GET /api/records/:id/history`

#### Upload

- `POST /api/uploads`

#### Health

- `GET /health`

### Luồng dữ liệu

1. User đăng nhập từ frontend
2. Backend kiểm tra `users.password_hash`
3. Nếu hợp lệ, backend tạo token trong `user_sessions`
4. Frontend gắn token đó vào `Authorization: Bearer ...`
5. Các API khác đọc token để xác thực user hiện tại

### Supabase được dùng cho gì

Supabase hiện là nơi lưu:

- bảng `users`
- bảng `user_sessions`
- bảng `nohinsho_records`
- bảng `nohinsho_annotations`
- bảng `nohinsho_record_history`
- file upload trong Supabase Storage

## Phần nối giữa frontend và backend

Frontend không truy cập database trực tiếp.
Mọi thao tác đều đi qua backend REST API.

Lợi ích:

- gom logic xác thực vào một chỗ
- dễ kiểm soát quyền admin/user
- backend có thể kiểm tra và chuẩn hoá dữ liệu trước khi ghi vào Supabase

## Kết luận ngắn

Nếu nhìn rất gọn:

- `public/` = giao diện người dùng
- `src/server.js` = backend API
- `Supabase` = database + storage
