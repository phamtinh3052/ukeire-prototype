# Deploy backend Supabase-only

Backend hiện chỉ dùng Supabase. Không còn mode file/postgres fallback.
Backend API đã chuyển sang REST thật (`/api/auth`, `/api/users`, `/api/records`).

## Cấu trúc thư mục (sau refactor)

- `src/server.js`: backend Express + API
- `public/`: frontend static
	- `public/js/`: `app-main.js`, `admin.js`
	- `public/css/`: `style.css`
	- `public/assets/`: `icon.svg`
	- root của `public/`: `index.html`, `admin.html`, `sw.js`, `manifest.json`

## 1) Chuẩn bị Supabase

Tạo project Supabase, mở SQL Editor và chạy toàn bộ file [supabase-setup.sql](../../supabase-setup.sql).

Schema này gồm:
- `users`
- `user_sessions`
- `nohinsho_records`
- `nohinsho_annotations`
- `nohinsho_record_history`
- `app_store` (giữ lại chỉ để migrate dữ liệu cũ)

## 2) Chạy local

Set env:

- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service_role_key>`
- `SUPABASE_STORAGE_BUCKET=nohinsho-assets` (optional)
- `CORS_ORIGIN=*` (optional)

Chạy:

`npm start`

Kiểm tra:

- App: http://localhost:5173
- Health: http://localhost:5173/health (phải trả `store: "supabase"`)

Bucket ảnh sẽ được backend tự tạo nếu chưa tồn tại.

## 3) Deploy Render/Railway

1. Push code lên GitHub.
2. Tạo Web Service từ repo.
3. Build: `npm install`
4. Start: `npm start`
5. Set env vars như phần local (bắt buộc có 2 biến Supabase).

Nếu thiếu `SUPABASE_URL` hoặc `SUPABASE_SERVICE_ROLE_KEY`, server sẽ không khởi động.
