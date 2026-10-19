const sqlite3 = require('sqlite3').verbose();

// Создаем файл базы данных (он появится в папке backend)
const db = new sqlite3.Database('./music.db', (err) => {
    if (err) {
        console.error('Ошибка открытия базы данных:', err.message);
    } else {
        console.log('Подключение к базе данных SQLite успешно.');
    }
});

db.serialize(() => {
    // 1. Создаем таблицу пользователей, если её нет
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )`);

    // 2. Добавляем новые колонки для профиля
    db.run("ALTER TABLE users ADD COLUMN display_name TEXT", (err) => {});
    db.run("ALTER TABLE users ADD COLUMN avatar TEXT", (err) => {});
    db.run("ALTER TABLE users ADD COLUMN bio TEXT", (err) => {});
    
    // 3. НОВОЕ: Добавляем колонку для приватности библиотеки (0 - приватная, 1 - публичная)
    db.run("ALTER TABLE users ADD COLUMN is_library_public INTEGER DEFAULT 0", (err) => {});

    // 4. НОВОЕ: Создаем таблицу для лайков
    db.run(`CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        song_index INTEGER NOT NULL,
        UNIQUE(username, song_index)
    )`);
    // Внутри db.serialize(() => {
// ... (твои старые таблицы) ...
    
    // Новая колонка для статуса "онлайн/офлайн" (1 - онлайн, 0 - офлайн)
    db.run("ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0", (err) => {});

    // Таблица для друзей
    db.run(`CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1 TEXT NOT NULL,
        user2 TEXT NOT NULL,
        UNIQUE(user1, user2)
    )`);
        // 7. НОВОЕ: Таблица для пользовательских плейлистов
    db.run(`CREATE TABLE IF NOT EXISTS custom_playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        name TEXT NOT NULL,
        is_public INTEGER DEFAULT 0,
        songs TEXT DEFAULT '' -- Сюда будем сохранять индексы песен через запятую
    )`);
});

module.exports = db;