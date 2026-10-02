const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');

// Cấu hình cổng, thời hạn phiên và các giá trị hợp lệ cho dữ liệu API.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = 'naphutech_session';
const STATUS_VALUES = new Set(['todo', 'doing', 'done']);
const PRIORITY_VALUES = new Set(['low', 'medium', 'high']);
const GUIDE_CATEGORIES = new Set(['workflow', 'manual', 'troubleshooting']);
const NOTE_COLORS = new Set(['plain', 'teal', 'amber', 'violet']);

class ValidationError extends Error {}

// Bắt buộc thông tin quản trị đủ mạnh trước khi khởi động dịch vụ.
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD before starting the server.');
    process.exit(1);
}
if (process.env.ADMIN_PASSWORD.length < 12) {
    console.error('ADMIN_PASSWORD must contain at least 12 characters.');
    process.exit(1);
}

const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(dataDirectory, { recursive: true });
const database = new Database(path.join(dataDirectory, 'naphutech.sqlite'));
// Thiết lập SQLite và tạo các bảng lưu nội dung hướng dẫn, công việc, ghi chú.
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
    CREATE TABLE IF NOT EXISTS guide_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('workflow', 'manual', 'troubleshooting')),
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workspace_todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        due_date TEXT NOT NULL DEFAULT '',
        completed_date TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workspace_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'plain' CHECK (color IN ('plain', 'teal', 'amber', 'violet')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);
const todoColumns = database.pragma('table_info(workspace_todos)');
if (!todoColumns.some(column => column.name === 'completed_date')) {
    database.exec("ALTER TABLE workspace_todos ADD COLUMN completed_date TEXT NOT NULL DEFAULT ''");
}

const sessions = new Map();
const loginAttempts = new Map();
const app = express();
// Giới hạn payload JSON và áp dụng các header bảo mật cho mọi phản hồi.
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
});

// Các hàm tiện ích chuẩn hóa lỗi, dữ liệu đầu vào và thông tin phiên.
function sendError(res, status, message) {
    return res.status(status).json({ error: message });
}

function readString(value, field, { required = false, max = 1000 } = {}) {
    if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`);
    const normalized = value.trim();
    if (required && !normalized) throw new ValidationError(`${field} is required.`);
    if (normalized.length > max) throw new ValidationError(`${field} is too long (max ${max} characters).`);
    return normalized;
}

function parseId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function equalSecret(candidate, expected) {
    const candidateHash = crypto.createHash('sha256').update(candidate).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(candidateHash, expectedHash);
}

function clientAddress(req) {
    return req.socket.remoteAddress || 'unknown';
}

function sessionCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_TTL_MS
    };
}

function requireSession(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME] || parseCookieHeader(req.headers.cookie)[COOKIE_NAME];
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        return sendError(res, 401, 'Your session has expired. Please sign in again.');
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    res.cookie(COOKIE_NAME, token, sessionCookieOptions());
    req.session = session;
    next();
}

function parseCookieHeader(header = '') {
    return Object.fromEntries(header.split(';').map(part => {
        const separator = part.indexOf('=');
        if (separator < 0) return ['', ''];
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        try {
            return [key, decodeURIComponent(value)];
        } catch {
            return [key, ''];
        }
    }).filter(([key]) => key));
}

function enforceSameOrigin(req, res, next) {
    const origin = req.get('origin');
    if (!origin) return next();
    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch {
        return sendError(res, 403, 'Invalid request origin.');
    }
    if (originHost !== req.get('host')) return sendError(res, 403, 'Cross-origin requests are not allowed.');
    next();
}

// Tạo, kiểm tra và kết thúc phiên đăng nhập; giới hạn thử sai theo địa chỉ client.
app.post('/api/session', enforceSameOrigin, (req, res) => {
    const address = clientAddress(req);
    const attempts = loginAttempts.get(address) || { count: 0, blockedUntil: 0 };
    if (attempts.blockedUntil > Date.now()) return sendError(res, 429, 'Too many sign-in attempts. Try again later.');

    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!equalSecret(username, process.env.ADMIN_USERNAME) ||
        !equalSecret(password, process.env.ADMIN_PASSWORD)) {
        attempts.count += 1;
        if (attempts.count >= 5) {
            attempts.count = 0;
            attempts.blockedUntil = Date.now() + 5 * 60 * 1000;
        }
        loginAttempts.set(address, attempts);
        return sendError(res, 401, 'Incorrect username or password.');
    }

    loginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
    res.cookie(COOKIE_NAME, token, sessionCookieOptions());
    res.json({ username });
});

app.get('/api/session', (req, res) => {
    const token = parseCookieHeader(req.headers.cookie)[COOKIE_NAME];
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        return sendError(res, 401, 'Not signed in.');
    }
    res.json({ username: session.username });
});

app.delete('/api/session', enforceSameOrigin, (req, res) => {
    const token = parseCookieHeader(req.headers.cookie)[COOKIE_NAME];
    if (token) sessions.delete(token);
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    res.status(204).end();
});

app.use('/api', enforceSameOrigin, requireSession);

// Chuẩn bị truy vấn CRUD dùng chung để truy cập các bảng SQLite.
const guideList = database.prepare('SELECT * FROM guide_content ORDER BY updated_at DESC, id DESC');
const guideInsert = database.prepare(`
    INSERT INTO guide_content (title, category, summary, content) VALUES (@title, @category, @summary, @content)
`);
const guideUpdate = database.prepare(`
    UPDATE guide_content SET title=@title, category=@category, summary=@summary, content=@content,
        updated_at=CURRENT_TIMESTAMP WHERE id=@id
`);
const todoList = database.prepare("SELECT * FROM workspace_todos ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, due_date, id DESC");
const todoInsert = database.prepare(`
    INSERT INTO workspace_todos (title, description, status, priority, due_date, completed_date, tags)
    VALUES (@title, @description, @status, @priority, @due_date, @completed_date, @tags)
`);
const todoUpdate = database.prepare(`
    UPDATE workspace_todos SET title=@title, description=@description, status=@status, priority=@priority,
        due_date=@due_date, completed_date=@completed_date, tags=@tags, updated_at=CURRENT_TIMESTAMP WHERE id=@id
`);
const noteList = database.prepare('SELECT * FROM workspace_notes ORDER BY updated_at DESC, id DESC');
const noteInsert = database.prepare('INSERT INTO workspace_notes (title, content, color) VALUES (@title, @content, @color)');
const noteUpdate = database.prepare(`
    UPDATE workspace_notes SET title=@title, content=@content, color=@color, updated_at=CURRENT_TIMESTAMP WHERE id=@id
`);

function handleValidation(res, action) {
    try {
        return action();
    } catch (error) {
        if (error instanceof ValidationError) return sendError(res, 400, error.message);
        throw error;
    }
}

// API quản lý nội dung hướng dẫn: liệt kê, tạo, cập nhật và xóa.
app.get('/api/guide-content', (req, res) => res.json(guideList.all()));
app.post('/api/guide-content', (req, res) => handleValidation(res, () => {
    const category = readString(req.body?.category, 'Category', { required: true, max: 30 });
    if (!GUIDE_CATEGORIES.has(category)) return sendError(res, 400, 'Unsupported guide category.');
    const result = guideInsert.run({
        title: readString(req.body?.title, 'Title', { required: true, max: 160 }),
        category,
        summary: readString(req.body?.summary ?? '', 'Summary', { max: 300 }),
        content: readString(req.body?.content, 'Content', { required: true, max: 12000 })
    });
    res.status(201).json(database.prepare('SELECT * FROM guide_content WHERE id=?').get(result.lastInsertRowid));
}));
app.put('/api/guide-content/:id', (req, res) => handleValidation(res, () => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid guide content id.');
    const category = readString(req.body?.category, 'Category', { required: true, max: 30 });
    if (!GUIDE_CATEGORIES.has(category)) return sendError(res, 400, 'Unsupported guide category.');
    const result = guideUpdate.run({
        id,
        title: readString(req.body?.title, 'Title', { required: true, max: 160 }),
        category,
        summary: readString(req.body?.summary ?? '', 'Summary', { max: 300 }),
        content: readString(req.body?.content, 'Content', { required: true, max: 12000 })
    });
    if (!result.changes) return sendError(res, 404, 'Guide content was not found.');
    res.json(database.prepare('SELECT * FROM guide_content WHERE id=?').get(id));
}));
app.delete('/api/guide-content/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid guide content id.');
    const result = database.prepare('DELETE FROM guide_content WHERE id=?').run(id);
    return result.changes ? res.status(204).end() : sendError(res, 404, 'Guide content was not found.');
});

// API công việc và bộ chuẩn hóa trạng thái, ưu tiên, hạn hoàn thành.
app.get('/api/todos', (req, res) => res.json(todoList.all()));
app.post('/api/todos', (req, res) => handleValidation(res, () => {
    const todo = normalizeTodo(req.body);
    const result = todoInsert.run(todo);
    res.status(201).json(database.prepare('SELECT * FROM workspace_todos WHERE id=?').get(result.lastInsertRowid));
}));
app.put('/api/todos/:id', (req, res) => handleValidation(res, () => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid task id.');
    const result = todoUpdate.run({ ...normalizeTodo(req.body), id });
    if (!result.changes) return sendError(res, 404, 'Task was not found.');
    res.json(database.prepare('SELECT * FROM workspace_todos WHERE id=?').get(id));
}));
app.delete('/api/todos/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid task id.');
    const result = database.prepare('DELETE FROM workspace_todos WHERE id=?').run(id);
    return result.changes ? res.status(204).end() : sendError(res, 404, 'Task was not found.');
});

function normalizeTodo(body) {
    const status = readString(body?.status ?? 'todo', 'Status', { required: true, max: 20 });
    const priority = readString(body?.priority ?? 'medium', 'Priority', { required: true, max: 20 });
    if (!STATUS_VALUES.has(status)) throw new ValidationError('Unsupported task status.');
    if (!PRIORITY_VALUES.has(priority)) throw new ValidationError('Unsupported task priority.');
    const dueDate = readString(body?.due_date ?? '', 'Due date', { max: 10 });
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ValidationError('Due date must use YYYY-MM-DD.');
    const completedDate = readString(body?.completed_date ?? '', 'Completion date', { max: 10 });
    if (completedDate && !/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) {
        throw new ValidationError('Completion date must use YYYY-MM-DD.');
    }
    return {
        title: readString(body?.title, 'Title', { required: true, max: 180 }),
        description: readString(body?.description ?? '', 'Description', { max: 4000 }),
        status,
        priority,
        due_date: dueDate,
        completed_date: completedDate,
        tags: readString(body?.tags ?? '', 'Tags', { max: 120 })
    };
}

// API ghi chú và kiểm tra màu sắc, tiêu đề, nội dung trước khi lưu.
app.get('/api/notes', (req, res) => res.json(noteList.all()));
app.post('/api/notes', (req, res) => handleValidation(res, () => {
    const note = normalizeNote(req.body);
    const result = noteInsert.run(note);
    res.status(201).json(database.prepare('SELECT * FROM workspace_notes WHERE id=?').get(result.lastInsertRowid));
}));
app.put('/api/notes/:id', (req, res) => handleValidation(res, () => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid note id.');
    const result = noteUpdate.run({ ...normalizeNote(req.body), id });
    if (!result.changes) return sendError(res, 404, 'Note was not found.');
    res.json(database.prepare('SELECT * FROM workspace_notes WHERE id=?').get(id));
}));
app.delete('/api/notes/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid note id.');
    const result = database.prepare('DELETE FROM workspace_notes WHERE id=?').run(id);
    return result.changes ? res.status(204).end() : sendError(res, 404, 'Note was not found.');
});

function normalizeNote(body) {
    const color = readString(body?.color ?? 'plain', 'Color', { required: true, max: 20 });
    if (!NOTE_COLORS.has(color)) throw new ValidationError('Unsupported note color.');
    return {
        title: readString(body?.title, 'Title', { required: true, max: 180 }),
        content: readString(body?.content ?? '', 'Content', { max: 12000 }),
        color
    };
}

// Phục vụ giao diện/tài nguyên tĩnh và chuyển mọi lỗi về phản hồi thống nhất.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.use((req, res) => sendError(res, 404, 'Not found.'));
app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    sendError(res, 500, 'An unexpected server error occurred.');
});

// Khởi chạy máy chủ và đóng kết nối SQLite gọn gàng khi nhận tín hiệu dừng.
const server = app.listen(PORT, HOST, () => {
    console.log(`Naphutech workspace is listening on http://${HOST}:${PORT}`);
    console.log(`SQLite database: ${path.join(dataDirectory, 'naphutech.sqlite')}`);
});

function closeServer() {
    server.close(() => {
        database.close();
        process.exit(0);
    });
}
process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
