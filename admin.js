const USERS_KEY = 'ukeire_users_v1';
const SESSION_KEY = 'ukeire_session_v1';

const adminStatus = document.getElementById('admin-status');
const usersTable = document.getElementById('users-table');
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const newRoleInput = document.getElementById('new-role');
const newBrushColorInput = document.getElementById('new-brush-color');

function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function ensureDefaultAdmin() {
    const users = getUsers();
    if (users.length > 0) return;
    saveUsers([
        {
            id: `u-${Date.now()}`,
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            brushColor: '#ff0000'
        }
    ]);
}

function getSessionUser() {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    return getUsers().find((u) => u.id === userId) || null;
}

function clearSession() {
    localStorage.setItem(SESSION_KEY, '');
}

function countAdmins(users) {
    return users.filter((u) => u.role === 'admin').length;
}

function createUser() {
    const username = newUsernameInput.value.trim();
    const password = newPasswordInput.value.trim();
    const role = newRoleInput.value;
    const brushColor = newBrushColorInput.value;

    if (!username || !password) {
        alert('ユーザー名とパスワードを入力してください。');
        return;
    }

    const users = getUsers();
    if (users.some((u) => u.username === username)) {
        alert('同じユーザー名が存在します。');
        return;
    }

    users.push({
        id: `u-${Date.now()}`,
        username,
        password,
        role,
        brushColor
    });

    saveUsers(users);
    newUsernameInput.value = '';
    newPasswordInput.value = '';
    newRoleInput.value = 'user';
    newBrushColorInput.value = '#ff0000';
    renderUsers();
}

function renderUsers() {
    const sessionUser = getSessionUser();
    const users = getUsers();

    if (users.length === 0) {
        usersTable.innerHTML = '<div class="muted">ユーザーがありません。</div>';
        return;
    }

    usersTable.innerHTML = users.map((u) => {
        const disableDelete = u.id === sessionUser.id;
        return `
            <div class="user-row" data-id="${u.id}">
                <div class="user-name">${u.username}</div>
                <select class="user-role">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
                <input class="user-color" type="color" value="${u.brushColor || '#ff0000'}" />
                <input class="user-password" type="text" value="${u.password}" />
                <button class="btn-save-user">保存</button>
                <button class="btn-delete-user btn-danger" ${disableDelete ? 'disabled' : ''}>削除</button>
            </div>
        `;
    }).join('');

    usersTable.querySelectorAll('.btn-save-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('.user-row');
            const id = row.dataset.id;
            const role = row.querySelector('.user-role').value;
            const brushColor = row.querySelector('.user-color').value;
            const password = row.querySelector('.user-password').value.trim();

            if (!password) {
                alert('パスワードは空にできません。');
                return;
            }

            const list = getUsers();
            const idx = list.findIndex((x) => x.id === id);
            if (idx < 0) return;

            if (list[idx].role === 'admin' && role !== 'admin' && countAdmins(list) <= 1) {
                alert('最後のadminは変更できません。');
                return;
            }

            list[idx].role = role;
            list[idx].brushColor = brushColor;
            list[idx].password = password;
            saveUsers(list);
            alert('更新しました。');
            renderUsers();
        });
    });

    usersTable.querySelectorAll('.btn-delete-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('.user-row');
            const id = row.dataset.id;
            const list = getUsers();
            const target = list.find((x) => x.id === id);
            if (!target) return;

            if (target.role === 'admin' && countAdmins(list) <= 1) {
                alert('最後のadminは削除できません。');
                return;
            }

            if (!confirm(`ユーザー ${target.username} を削除しますか？`)) return;

            saveUsers(list.filter((x) => x.id !== id));
            renderUsers();
        });
    });
}

function boot() {
    ensureDefaultAdmin();
    const sessionUser = getSessionUser();

    if (!sessionUser || sessionUser.role !== 'admin') {
        alert('管理者のみアクセス可能です。');
        window.location.href = 'index.html';
        return;
    }

    adminStatus.textContent = `ログイン中: ${sessionUser.username} (admin)`;
    renderUsers();
}

document.getElementById('btn-create-user').addEventListener('click', createUser);
document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'index.html';
});
document.getElementById('btn-logout-admin').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
});

boot();
