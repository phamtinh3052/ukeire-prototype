# REST API (Supabase)

## Auth

- `POST /api/auth/login`
  - body: `{ "username": "admin", "password": "admin123" }`
  - response: `{ token, expiresAt, user }`
- `GET /api/auth/me` (Bearer token)
- `POST /api/auth/logout` (Bearer token)

## Users (admin only)

- `GET /api/users?includeInactive=true|false`
- `POST /api/users`
  - body: `{ "username", "password", "role": "admin|user", "brushColor": "#ff0000" }`
- `PATCH /api/users/:id`
  - body (optional fields): `{ "role", "brushColor", "password", "isActive" }`
- `DELETE /api/users/:id` (soft disable user + revoke sessions)

## Records

- `GET /api/records?date=YYYY-MM-DD&search=...&includeDeleted=true|false`
- `POST /api/records`
  - body: `{ "name", "date", "status", "rotation", "sourceUrl", "sourceStoragePath", "sourceFileType", "uploadStatus" }`
- `GET /api/records/:id`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id` (soft delete)

### Admin hard delete (records)

- `DELETE /api/admin/records/purge-soft-deleted` (admin only)
  - Xóa cứng toàn bộ record đã soft delete (`is_deleted=true`)
  - Đồng thời xóa file tương ứng trong Supabase Storage (nếu có)

## Uploads

- `POST /api/uploads`
  - body: `{ "dataUrl", "fileName", "date" }`
  - response: `{ "storagePath", "publicUrl" }`

## Annotations / Edit history

- `GET /api/records/:id/annotations`
- `POST /api/records/:id/annotations`
  - body: `{ "linesHistory": [...], "comment": "..." }`
  - mỗi lần save tạo version mới
- `GET /api/records/:id/history`

## Health

- `GET /health`
