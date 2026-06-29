const bcrypt = require("bcryptjs");
const {
  SESSION_DAYS,
  ROLES,
  RECORD_STATUSES,
  UPLOAD_STATUSES,
} = require("./config");
const {
  toSafeUser,
  normalizeRecordRow,
  withLinesHistory,
  fetchLatestAnnotationsMap,
  randomToken,
  isValidDateString,
  badRequest,
  countActiveAdmins,
  ensureStorageBucket,
  uploadDataUrlToStorage,
  removeStoragePaths,
} = require("./helpers");

function createServices({ supabase }) {
  async function ensureDefaultAdmin() {
    const { data: users, error } = await supabase
      .from("users")
      .select("id")
      .limit(1);
    if (error) throw new Error(`Default admin check failed: ${error.message}`);
    if (users && users.length > 0) return;

    const passwordHash = await bcrypt.hash("admin123", 10);
    const { error: insertError } = await supabase.from("users").insert({
      username: "admin",
      password_hash: passwordHash,
      role: "admin",
      brush_color: "#ff0000",
      is_active: true,
    });
    if (insertError)
      throw new Error(`Default admin create failed: ${insertError.message}`);
  }

  async function verifySchema() {
    const checks = [
      "users",
      "user_sessions",
      "nohinsho_records",
      "nohinsho_annotations",
      "nohinsho_record_history",
    ];
    for (const table of checks) {
      const { error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error)
        throw new Error(
          `Schema missing or inaccessible table '${table}': ${error.message}`,
        );
    }
  }

  async function logRecordHistory({
    recordId,
    actorUserId,
    action,
    beforeData = null,
    afterData = null,
  }) {
    const { error } = await supabase.from("nohinsho_record_history").insert({
      record_id: recordId,
      actor_user_id: actorUserId || null,
      action,
      before_data: beforeData,
      after_data: afterData,
    });
    if (error) throw new Error(`History insert failed: ${error.message}`);
  }

  async function login(username, password) {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    if (error) throw new Error(`Login query failed: ${error.message}`);
    if (!user || !user.is_active) return null;
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return null;

    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error: sessionError } = await supabase
      .from("user_sessions")
      .insert({ user_id: user.id, token, expires_at: expiresAt });
    if (sessionError)
      throw new Error(`Session create failed: ${sessionError.message}`);
    return { token, expiresAt, user: toSafeUser(user) };
  }

  async function logout(token) {
    const { error } = await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", token);
    if (error) throw new Error(`Logout failed: ${error.message}`);
  }

  async function listUsers(includeInactive) {
    let query = supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw new Error(`Users fetch failed: ${error.message}`);
    return (data || []).map(toSafeUser);
  }

  async function createUser({ username, password, role, brushColor }) {
    if (!username || !password)
      return { error: "username and password are required" };
    if (!ROLES.has(role)) return { error: "invalid role" };
    const passwordHash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("users")
      .insert({
        username,
        password_hash: passwordHash,
        role,
        brush_color: brushColor,
        is_active: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Create user failed: ${error.message}`);
    return toSafeUser(data);
  }

  async function updateUser(userId, body) {
    const { data: before, error: beforeError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (beforeError)
      throw new Error(`Fetch user failed: ${beforeError.message}`);
    if (!before) return { notFound: true };

    const patch = {};
    let nextRole = before.role;
    let nextIsActive = before.is_active;
    if (typeof body?.role === "string") {
      if (!ROLES.has(body.role)) return { error: "invalid role" };
      patch.role = body.role;
      nextRole = body.role;
    }
    if (typeof body?.brushColor === "string")
      patch.brush_color = body.brushColor;
    if (typeof body?.isActive === "boolean") {
      patch.is_active = body.isActive;
      nextIsActive = body.isActive;
    }
    if (typeof body?.password === "string" && body.password.trim())
      patch.password_hash = await bcrypt.hash(body.password.trim(), 10);
    if (Object.keys(patch).length === 0)
      return { error: "no valid fields to update" };

    if (
      before.role === "admin" &&
      before.is_active &&
      (nextRole !== "admin" || !nextIsActive)
    ) {
      const activeAdminCount = await countActiveAdmins();
      if (activeAdminCount <= 1)
        return { error: "cannot change the last active admin" };
    }

    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Update user failed: ${error.message}`);

    if (before.is_active && !data.is_active) {
      const { error: revokeError } = await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (revokeError)
        throw new Error(`Revoke sessions failed: ${revokeError.message}`);
    }
    return toSafeUser(data);
  }

  async function deleteUser(userId, currentUserId) {
    if (currentUserId === userId)
      return { error: "cannot delete current user" };
    const { data: targetUser, error: targetError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (targetError)
      throw new Error(`Fetch user failed: ${targetError.message}`);
    if (!targetUser) return { notFound: true };
    if (targetUser.role === "admin" && targetUser.is_active) {
      const activeAdminCount = await countActiveAdmins();
      if (activeAdminCount <= 1)
        return { error: "cannot delete the last active admin" };
    }
    const { error } = await supabase
      .from("users")
      .update({ is_active: false })
      .eq("id", userId);
    if (error) throw new Error(`Delete user failed: ${error.message}`);
    const { error: revokeError } = await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
    if (revokeError)
      throw new Error(`Revoke sessions failed: ${revokeError.message}`);
  }

  async function purgeSoftDeletedRecords() {
    const { data: targets, error: fetchError } = await supabase
      .from("nohinsho_records")
      .select(
        "id, source_storage_path, deleted_storage_path, is_deleted, upload_status",
      )
      .or("is_deleted.eq.true,upload_status.eq.deleted");
    if (fetchError)
      throw new Error(
        `Fetch soft-deleted records failed: ${fetchError.message}`,
      );
    const rows = Array.isArray(targets) ? targets : [];
    if (rows.length === 0) return { purgedCount: 0, removedStorageCount: 0 };
    const recordIds = rows.map((r) => r.id).filter(Boolean);
    const storagePaths = rows.flatMap((r) => [
      r.source_storage_path,
      r.deleted_storage_path,
    ]);
    const { removedStorageCount } = await removeStoragePaths(storagePaths);
    const { error: deleteError } = await supabase
      .from("nohinsho_records")
      .delete()
      .in("id", recordIds);
    if (deleteError)
      throw new Error(`Hard delete records failed: ${deleteError.message}`);
    return { purgedCount: recordIds.length, removedStorageCount };
  }

  async function listRecords({ date, search, includeDeleted }) {
    let query = supabase
      .from("nohinsho_records")
      .select("*")
      .order("updated_at", { ascending: false });
    if (isValidDateString(date)) query = query.eq("work_date", date);
    if (!includeDeleted)
      query = query.eq("is_deleted", false).neq("upload_status", "deleted");
    const { data, error } = await query;
    if (error) throw new Error(`Records fetch failed: ${error.message}`);
    let rows = data || [];
    if (search)
      rows = rows.filter((r) =>
        `${r.name || ""}`.toLowerCase().includes(search.toLowerCase()),
      );
    const linesHistoryByRecordId = await fetchLatestAnnotationsMap(
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      withLinesHistory(
        normalizeRecordRow(row),
        linesHistoryByRecordId.get(row.id) || [],
      ),
    );
  }

  async function createRecord(payload, actorUserId) {
    const name = `${payload.name || ""}`.trim();
    const date = `${payload.date || ""}`.trim();
    if (!name) return { error: "name is required" };
    if (!isValidDateString(date)) return { error: "date must be YYYY-MM-DD" };

    const status = RECORD_STATUSES.has(payload.status)
      ? payload.status
      : "not_checked";
    const uploadStatus = UPLOAD_STATUSES.has(payload.uploadStatus)
      ? payload.uploadStatus
      : "done";
    const insertData = {
      name,
      work_date: date,
      status,
      rotation: Number.isFinite(payload.rotation) ? payload.rotation : 0,
      source_url: `${payload.sourceUrl || ""}`,
      source_storage_path: `${payload.sourceStoragePath || ""}`,
      source_file_type: `${payload.sourceFileType || ""}`,
      upload_status: uploadStatus,
      editor_user_id: actorUserId,
      created_by: actorUserId,
      updated_by: actorUserId,
      is_deleted: false,
    };
    const { data, error } = await supabase
      .from("nohinsho_records")
      .insert(insertData)
      .select("*")
      .single();
    if (error) throw new Error(`Create record failed: ${error.message}`);
    return data;
  }

  async function getRecord(recordId) {
    const { data, error } = await supabase
      .from("nohinsho_records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new Error(`Fetch record failed: ${error.message}`);
    if (!data) return null;
    const { data: latestAnnotation } = await supabase
      .from("nohinsho_annotations")
      .select("*")
      .eq("record_id", data.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestLinesHistory = Array.isArray(latestAnnotation?.lines_history)
      ? latestAnnotation.lines_history
      : [];
    return {
      record: withLinesHistory(normalizeRecordRow(data), latestLinesHistory),
      latestAnnotation: latestAnnotation || null,
    };
  }

  async function updateRecord(recordId, body, actorUserId) {
    const { data: before, error: beforeError } = await supabase
      .from("nohinsho_records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle();
    if (beforeError)
      throw new Error(`Fetch before update failed: ${beforeError.message}`);
    if (!before) return { notFound: true };
    const patch = { updated_by: actorUserId };
    if (typeof body?.name === "string" && body.name.trim())
      patch.name = body.name.trim();
    if (typeof body?.date === "string" && isValidDateString(body.date))
      patch.work_date = body.date;
    if (typeof body?.status === "string" && RECORD_STATUSES.has(body.status))
      patch.status = body.status;
    if (Number.isFinite(body?.rotation)) patch.rotation = body.rotation;
    if (typeof body?.sourceUrl === "string") patch.source_url = body.sourceUrl;
    if (typeof body?.sourceStoragePath === "string")
      patch.source_storage_path = body.sourceStoragePath;
    if (typeof body?.sourceFileType === "string")
      patch.source_file_type = body.sourceFileType;
    if (
      typeof body?.uploadStatus === "string" &&
      UPLOAD_STATUSES.has(body.uploadStatus)
    )
      patch.upload_status = body.uploadStatus;
    if (typeof body?.isDeleted === "boolean") patch.is_deleted = body.isDeleted;
    if (typeof body?.deletedStoragePath === "string")
      patch.deleted_storage_path = body.deletedStoragePath;
    if (typeof body?.deletedAt === "string" || body?.deletedAt === null)
      patch.deleted_at = body.deletedAt;
    const { data: after, error } = await supabase
      .from("nohinsho_records")
      .update(patch)
      .eq("id", recordId)
      .select("*")
      .single();
    if (error) throw new Error(`Update record failed: ${error.message}`);
    return { before, after };
  }

  async function softDeleteRecord(recordId, actorUserId) {
    const { data: before, error: beforeError } = await supabase
      .from("nohinsho_records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle();
    if (beforeError)
      throw new Error(`Fetch record failed: ${beforeError.message}`);
    if (!before) return { notFound: true };
    const { data: after, error } = await supabase
      .from("nohinsho_records")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        upload_status: "deleted",
        updated_by: actorUserId,
      })
      .eq("id", recordId)
      .select("*")
      .single();
    if (error) throw new Error(`Soft delete failed: ${error.message}`);
    return { before, after };
  }

  async function listAnnotations(recordId) {
    const { data, error } = await supabase
      .from("nohinsho_annotations")
      .select("*")
      .eq("record_id", recordId)
      .order("version", { ascending: false });
    if (error) throw new Error(`Annotations fetch failed: ${error.message}`);
    return data || [];
  }

  async function saveAnnotation(recordId, linesHistory, comment, actorUserId) {
    const { data: latest } = await supabase
      .from("nohinsho_annotations")
      .select("version")
      .eq("record_id", recordId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version || 0) + 1;
    const { data, error } = await supabase
      .from("nohinsho_annotations")
      .insert({
        record_id: recordId,
        version: nextVersion,
        lines_history: linesHistory,
        comment,
        created_by: actorUserId,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Save annotation failed: ${error.message}`);
    await supabase
      .from("nohinsho_records")
      .update({ updated_by: actorUserId })
      .eq("id", recordId);
    return data;
  }

  async function listHistory(recordId) {
    const { data, error } = await supabase
      .from("nohinsho_record_history")
      .select(
        "id, record_id, actor_user_id, action, before_data, after_data, created_at",
      )
      .eq("record_id", recordId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`History fetch failed: ${error.message}`);
    return data || [];
  }

  return {
    ensureDefaultAdmin,
    verifySchema,
    logRecordHistory,
    login,
    logout,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    purgeSoftDeletedRecords,
    listRecords,
    createRecord,
    getRecord,
    updateRecord,
    softDeleteRecord,
    listAnnotations,
    saveAnnotation,
    listHistory,
    ensureStorageBucket,
    uploadDataUrlToStorage,
  };
}

module.exports = { createServices };
