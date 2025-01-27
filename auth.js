const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const router = express.Router();

//register a new user
router.post('/register', async (req, res) => {
    const { tuftsId, password } = req.body;
    
    const passwordRequirements = {
        length: /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()]).{7,}$/,
        uppercase: /[A-Z]/,
        lowercase: /[a-z]/,
        number: /\d/,
        symbol: /[!@#$%^&*(),.?":{}|<>]/
    };

    if (!tuftsId || !password) return res.status(400).json({ error: 'Tufts ID and password are required.' });

    if (!passwordRequirements.length.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 7 characters long and contain a mix of uppercase, lowercase, numbers, and symbols.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
        `INSERT INTO users (tufts_id, password) VALUES (?, ?)`,
        [tuftsId, hashedPassword],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Tufts ID already exists.' });
                }
                return res.status(500).json({ error: 'Failed to register user.' });
            }
            res.json({ message: 'User registered successfully.', userId: this.lastID });
        }
    );
});

//sign in 
router.post('/signin', (req, res) => {
    const { tuftsId, password } = req.body;
    if (!tuftsId || !password) return res.status(400).json({ error: 'Tufts ID and password are required.' });

    db.get(`SELECT * FROM users WHERE tufts_id = ?`, [tuftsId], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Invalid credentials.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials.' });

        res.json({ message: 'Signed in successfully.', userId: user.id, tuftsId: user.tufts_id });
    });
});

// Guest mode (optional feature)
router.post('/guest', (req, res) => {
    res.json({ message: 'Guest session started.' });
});

module.exports = router;
