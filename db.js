const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

db.serialize(() => {

   
//  db.run(`DROP TABLE IF EXISTS users`);
//     db.run(`DROP TABLE IF EXISTS chats`);
//     db.run(`DROP TABLE IF EXISTS messages`);
//     db.run(`DROP TABLE IF EXISTS pdf_summaries`);

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tufts_id TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS pdf_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chat_id INTEGER,
            pdf_name TEXT NOT NULL,
            summary TEXT NOT NULL,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (chat_id) REFERENCES chats(id)
        )
    `);
    
});

module.exports = db;
