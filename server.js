const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Настройка для загрузки файлов (аватарок)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
app.use('/uploads', express.static('uploads'));

// --- МАРШРУТ РЕГИСТРАЦИИ ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Ник и пароль обязательны' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
        
        db.run(sql, [username, hashedPassword], function(err) {
            if (err) return res.status(400).json({ error: 'Этот никнейм уже занят' });
            res.status(201).json({ message: 'Пользователь успешно создан!' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// --- МАРШРУТ ВХОДА (ЛОГИН) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Ник и пароль обязательны' });

    const sql = `SELECT * FROM users WHERE username = ?`;
    db.get(sql, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!user) return res.status(401).json({ error: 'Неверный ник или пароль' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Неверный ник или пароль' });

        res.status(200).json({ message: 'Вход выполнен успешно!' });
    });
});

// --- ЛАЙКИ ---
app.post('/api/like', (req, res) => {
    const { username, songIndex } = req.body;
    db.get(`SELECT * FROM likes WHERE username = ? AND song_index = ?`, [username, songIndex], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            db.run(`DELETE FROM likes WHERE username = ? AND song_index = ?`, [username, songIndex], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Лайк убран', liked: false });
            });
        } else {
            db.run(`INSERT INTO likes (username, song_index) VALUES (?, ?)`, [username, songIndex], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Лайк поставлен', liked: true });
            });
        }
    });
});

app.get('/api/likes/:username', (req, res) => {
    db.all(`SELECT song_index FROM likes WHERE username = ?`, [req.params.username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(row => row.song_index));
    });
});

// --- ОБНОВЛЕНИЕ ПРОФИЛЯ ---
app.post('/api/update-profile', upload.single('avatar'), (req, res) => {
    const { username, display_name, bio } = req.body;
    if (!username) return res.status(400).json({ error: 'Нет имени пользователя' });

    let avatarPath = req.file ? `/uploads/${req.file.filename}` : null;
    let sql = `UPDATE users SET display_name = ?, bio = ?`;
    let params = [display_name, bio];

    if (avatarPath) {
        sql += `, avatar = ?`;
        params.push(avatarPath);
    }
    sql += ` WHERE username = ?`;
    params.push(username);

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
        res.json({ message: 'Профиль обновлен!' });
    });
});

// --- ПОЛУЧЕНИЕ ДАННЫХ ПРОФИЛЯ ---
app.get('/api/profile/:username', (req, res) => {
    db.get(`SELECT username, display_name, avatar, bio FROM users WHERE username = ?`, [req.params.username], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json(row);
    });
});
// --- ЗАГРУЗКА СВОЕЙ МУЗЫКИ ---
// Настраиваем папку для аудио (создастся папка uploads/audio)
const audioStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync('uploads/audio')) fs.mkdirSync('uploads/audio', { recursive: true });
        cb(null, 'uploads/audio/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const uploadAudio = multer({ storage: audioStorage });

app.post('/api/upload-music', uploadAudio.single('audio'), (req, res) => {
    const { username, songName, artist } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const filePath = `/uploads/audio/${req.file.filename}`;

    // Создаем таблицу для пользовательской музыки, если её нет
    db.run(`CREATE TABLE IF NOT EXISTS user_music (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        song_name TEXT,
        artist TEXT,
        file_path TEXT NOT NULL
    )`);

    db.run(`INSERT INTO user_music (username, song_name, artist, file_path) VALUES (?, ?, ?, ?)`, 
    [username, songName, artist, filePath], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
        res.json({ message: 'Музыка загружена!', file: filePath });
    });
});
// --- ПОЛУЧЕНИЕ СПИСКА СВОЕЙ МУЗЫКИ ---
app.get('/api/my-music/:username', (req, res) => {
    const username = req.params.username;
    db.all(`SELECT * FROM user_music WHERE username = ?`, [username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows); // Отправляем список песен на сайт
    });
});
// --- ПОЛЬЗОВАТЕЛИ И ДРУЗЬЯ ---

// Пинг (сервер запоминает, что ты онлайн)
app.post('/api/ping', (req, res) => {
    const { username } = req.body;
    db.run(`UPDATE users SET is_online = 1 WHERE username = ?`, [username]);
    res.sendStatus(200);
});

// Выход (запоминает, что ты офлайн)
app.post('/api/logout', (req, res) => {
    const { username } = req.body;
    db.run(`UPDATE users SET is_online = 0 WHERE username = ?`, [username]);
    res.sendStatus(200);
});

// Получить всех пользователей (для поиска друзей)
app.get('/api/all-users/:currentUser', (req, res) => {
    const currentUser = req.params.currentUser;
    // Получаем всех, кроме себя, и проверяем, добавлены ли они в друзья
    const sql = `
        SELECT u.username, u.display_name, u.avatar, u.is_online,
        (SELECT COUNT(*) FROM friends f WHERE (f.user1 = ? AND f.user2 = u.username) OR (f.user2 = ? AND f.user1 = u.username)) as is_friend
        FROM users u WHERE u.username != ?
    `;
    db.all(sql, [currentUser, currentUser, currentUser], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Добавить в друзья
app.post('/api/add-friend', (req, res) => {
    const { username, friendName } = req.body;
    db.run(`INSERT OR IGNORE INTO friends (user1, user2) VALUES (?, ?)`, [username, friendName], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Друг добавлен!' });
    });
});

// Получить список ТВОИХ друзей
app.get('/api/my-friends/:username', (req, res) => {
    const username = req.params.username;
    const sql = `
        SELECT u.username, u.display_name, u.avatar, u.is_online 
        FROM users u
        JOIN friends f ON (f.user1 = ? AND f.user2 = u.username) OR (f.user2 = ? AND f.user1 = u.username)
    `;
    db.all(sql, [username, username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Получить полный профиль ЛЮБОГО пользователя (включая его музыку и лайки)
app.get('/api/user-profile/:username', (req, res) => {
    const username = req.params.username;
    db.get(`SELECT username, display_name, avatar, bio FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });

        // Получаем его лайки (публичная библиотека)
        db.all(`SELECT song_index FROM likes WHERE username = ?`, [username], (err, likes) => {
            // Получаем его загруженную музыку
            db.all(`SELECT * FROM user_music WHERE username = ?`, [username], (err, music) => {
                res.json({
                    user: user,
                    likes: likes ? likes.map(l => l.song_index) : [],
                    uploadedMusic: music || []
                });
            });
        });
    });
});
// --- ПЛЕЙЛИСТЫ ---

// Создать новый плейлист
app.post('/api/create-playlist', (req, res) => {
    const { username, name, isPublic } = req.body;
    if (!username || !name) return res.status(400).json({ error: 'Нужно название' });

    db.run(`INSERT INTO custom_playlists (username, name, is_public) VALUES (?, ?, ?)`, 
    [username, name, isPublic ? 1 : 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Плейлист создан!', id: this.lastID });
    });
});

// Получить плейлисты пользователя
app.get('/api/my-playlists/:username', (req, res) => {
    db.all(`SELECT * FROM custom_playlists WHERE username = ?`, [req.params.username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
// Получить публичные плейлисты другого пользователя
app.get('/api/public-playlists/:username', (req, res) => {
    db.all(`SELECT * FROM custom_playlists WHERE username = ? AND is_public = 1`, [req.params.username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
// --- СОХРАНЕНИЕ ОФИЦИАЛЬНОГО ПЛЕЙЛИСТА В АККАУНТ ---
app.post('/api/save-official-playlist', (req, res) => {
    const { username, playlistName, songsArray } = req.body;
    
    if (!username || !playlistName || !songsArray) {
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    // Превращаем массив индексов [21, 18, 6...] в строку "21,18,6..."
    const songsString = songsArray.join(',');

    // Сначала проверим, нет ли уже такого плейлиста у пользователя
    db.get(`SELECT * FROM custom_playlists WHERE username = ? AND name = ?`, [username, playlistName], (err, row) => {
        if (row) {
            return res.status(400).json({ error: 'Этот плейлист уже есть в вашей библиотеке' });
        }

        // Если нет — сохраняем
        db.run(`INSERT INTO custom_playlists (username, name, is_public, songs) VALUES (?, ?, ?, ?)`, 
        [username, playlistName, 1, songsString], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
            res.json({ message: 'Плейлист сохранен!' });
        });
    });
});
// --- ЗАПУСК СЕРВЕРА (ВСЕГДА В САМОМ КОНЦЕ) ---
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});