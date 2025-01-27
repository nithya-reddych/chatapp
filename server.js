const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const fetch = require('node-fetch');
const fs = require('fs');
const multer = require('multer');

const pdfParse = require('pdf-parse');
const path = require('path');

const upload = multer({ dest: 'uploads/' });
const authRoutes = require('./auth');

const app = express();

const OPEN_API_KEY = 'API_KEY_HERE';

app.use(bodyParser.json());
app.use(express.static('public'));


app.use('/auth', authRoutes);

// sign in or register user
app.post('/signin', (req, res) => {
    const { tuftsId } = req.body;

    db.run(
        `INSERT INTO users (tufts_id) VALUES (?) ON CONFLICT(tufts_id) DO NOTHING`,
        [tuftsId],
        (err) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                db.get(
                    `SELECT id, tufts_id FROM users WHERE tufts_id = ?`,
                    [tuftsId],
                    (err, user) => {
                        if (err) {
                            res.status(500).json({ error: 'Database error' });
                        } else {
                            const userId = user.id;

                            //ceate a new chat for the user
                            db.run(
                                `INSERT INTO chats (user_id, name) VALUES (?, ?)`,
                                [userId, 'New Chat'],
                                function (err) {
                                    if (err) {
                                        res.status(500).json({ error: 'Error creating new chat' });
                                    } else {
                                        const chatId = this.lastID;
                                        const initialMessage = "Welcome. How can I help you today?";
                                        const timestamp = new Date().toISOString();

                                        db.run(
                                            `INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, 'Assistant', ?, ?)`,
                                            [chatId, initialMessage, timestamp],
                                            (err) => {
                                                if (err) {
                                                    res.status(500).json({ error: 'Error adding initial message' });
                                                } else {
                                                    res.json({ userId, tuftsId: user.tufts_id, chatId });
                                                }
                                            }
                                        );
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );
});


//fetch chat list for a user
app.get('/chats/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all(
        `SELECT * FROM chats WHERE user_id = ?`,
        [userId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.json({ chats: rows });
            }
        }
    );
});



//create new chat
app.post('/chats', (req, res) => {
    const { userId, name } = req.body;

    if (!userId || !name) {
        return res.status(400).json({ error: 'userId and name are required' });
    }

    db.run(
        `INSERT INTO chats (user_id, name) VALUES (?, ?)`,
        [userId, name],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error while creating chat' });
            }

            const chatId = this.lastID;

            // Add an initial message from the assistant
            const initialMessage = "Welcome. How can I help you today?";
            const timestamp = new Date().toISOString();

            db.run(
                `INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, 'Assistant', ?, ?)`,
                [chatId, initialMessage, timestamp],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error while adding initial message' });
                    }

                    res.json({ chatId });
                }
            );
        }
    );
});


//fetch messages for a chat
app.get('/messages/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    db.all(
        `SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC`,
        [chatId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: 'Database error' });
            } else {
                res.json({ messages: rows });
            }
        }
    );
});

//send message and process with Assistant API
app.post('/messages', async (req, res) => {
    const { chatId, sender, text, assistantEnabled, lastk = 5 } = req.body;

    if (!chatId || !sender || !text) {
        return res.status(400).json({ error: 'chatId, sender, and text are required' });
    }

    const timestamp = new Date().toISOString();

    db.run(
        `INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?)`,
        [chatId, sender, text, timestamp],
        async function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error while sending message' });
            }

            if (assistantEnabled) {
                try {
                    //check for an existing assistant reply for the same chat
                    const recentAssistantReply = await new Promise((resolve, reject) => {
                        db.get(
                            `SELECT text FROM messages WHERE chat_id = ? AND sender = 'Assistant' ORDER BY timestamp DESC LIMIT 1`,
                            [chatId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row ? row.text : null);
                            }
                        );
                    });

                    if (recentAssistantReply && recentAssistantReply.includes(text)) {
                        return res.json({ assistantReply: recentAssistantReply });
                    }

                    const previousMessages = await new Promise((resolve, reject) => {
                        db.all(
                            `SELECT text FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?`,
                            [chatId, lastk],
                            (err, rows) => {
                                if (err) reject(err);
                                else resolve(rows.reverse().map((row) => row.text).join('\n'));
                            }
                        );
                    });

                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${OPEN_API_KEY}`,
                        },
                        body: JSON.stringify({
                            model: 'gpt-3.5-turbo',
                            messages: [
                                { role: 'system', content: 'You are a helpful assistant.' },
                                { role: 'user', content: `${previousMessages}\n${text}` },
                            ],
                        }),
                    });

                    const data = await response.json();

                    if (response.ok && data.choices && data.choices[0].message) {
                        const assistantReply = data.choices[0].message.content.trim();

                        db.run(
                            `INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?)`,
                            [chatId, 'Assistant', assistantReply, new Date().toISOString()],
                            (err) => {
                                if (err) console.error('Error inserting assistant reply:', err.message);
                            }
                        );

                        return res.json({ assistantReply });
                    } else {
                        console.error('Error with OpenAI API response:', data);
                        return res.status(500).json({ error: 'Assistant response error', details: data });
                    }
                } catch (error) {
                    console.error('Assistant API error:', error.message);
                    return res.status(500).json({ error: 'Assistant service unavailable' });
                }
            } else {
                return res.json({ messageId: this.lastID });
            }
        }
    );
});

app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const pdfPath = path.join(__dirname, req.file.path);
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        const pdfData = await pdfParse(pdfBuffer);
        const pdfText = pdfData.text;

        if (!pdfText) {
            return res.status(400).json({ error: 'No text found in PDF' });
        }

        const summary = await summarizeText(pdfText);
        // const combinedMessage = `Uploaded PDF: ${req.file.originalname}\nPDF Summary: ${summary}`;

        const timestamp = new Date().toISOString();
        const { userId, chatId } = req.body;

        // db.run(
        //     `INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?)`,
        //     [chatId, 'Assistant', `PDF Summary3: ${summary}`, timestamp],
        //     (err) => {
        //         if (err) {
        //             console.error('Error inserting PDF summary as message:', err);
        //             return res.status(500).json({ error: 'Error inserting summary into chat' });
        //         }
                
        //     }
        // );
        res.json({ summary });
        fs.unlinkSync(pdfPath);
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ error: 'Error processing PDF' });
    }
});

async function summarizeText(text) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPEN_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant.',
                    },
                    {
                        role: 'user',
                        content: `Summarize the following text:\n\n${text}`,
                    },
                ],
            }),
        });

        const data = await response.json();
        
        if (response.ok && data.choices && data.choices[0]) {
            return data.choices[0].message.content.trim();
        } else {
            throw new Error('Error generating summary from OpenAI');
        }
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
