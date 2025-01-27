let userId = null;
let activeChatId = null;
let chats = [];
let assistantEnabled = true;
let assistantReplySent = {}; 

const chatList = document.getElementById('chat-list');
const chatDisplay = document.getElementById('chat-display');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const signinBtn = document.getElementById('signinBtn');
const newChatBtn = document.getElementById('newChatBtn');
const logoutBtn = document.getElementById('logoutBtn');
const pdfFileInput = document.getElementById('pdfFileInput');
const uploadPdfBtn = document.getElementById('uploadPdfBtn');
const pdfSummary = document.getElementById('pdfSummary');
const pdfUploadSection = document.getElementById('pdf-upload-section');
const userIdDisplay = document.getElementById('userIdDisplay');

function setSession(data) {
    sessionStorage.setItem('userSession', JSON.stringify(data));
}

function getSession() {
    const session = sessionStorage.getItem('userSession');
    return session ? JSON.parse(session) : null;
}

function clearSession() {
    sessionStorage.removeItem('userSession');
}

//on page load
document.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (session && session.userId && session.tuftsId) {
        userId = session.userId;
        userIdDisplay.textContent = `Hi, ${session.tuftsId}`; // Display Tufts ID
        toggleSections('chat');
        await loadChats();
    } else {
        toggleSections('signin');
    }
    initializeListeners();
});

function toggleSections(active) {
    const signinSection = document.getElementById('signin-section');
    const chatSection = document.getElementById('chat-section');
    if (active === 'signin') {
        signinSection.style.display = 'flex';
        chatSection.style.display = 'none';
    } else {
        signinSection.style.display = 'none';
        chatSection.style.display = 'flex';
    }
}
//password
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('registerPassword');
    const registerBtn = document.getElementById('registerBtn');

    const passwordRequirements = {
        length: /^.{7,}$/, 
        uppercase: /[A-Z]/, 
        lowercase: /[a-z]/, 
        number: /\d/, 
        symbol: /[!@#$%^&*(),.?":{}|<>]/, 
    };

    function updatePasswordRequirement(rule, isValid, elementId) {
        const requirementItem = document.getElementById(elementId);
        if (isValid) {
            requirementItem.classList.remove('invalid');
            requirementItem.classList.add('valid');
        } else {
            requirementItem.classList.remove('valid');
            requirementItem.classList.add('invalid');
        }
    }

    function validatePassword() {
        const password = passwordInput.value;

        updatePasswordRequirement('length', passwordRequirements.length.test(password), 'length');
        updatePasswordRequirement('uppercase', passwordRequirements.uppercase.test(password), 'uppercase');
        updatePasswordRequirement('lowercase', passwordRequirements.lowercase.test(password), 'lowercase');
        updatePasswordRequirement('number', passwordRequirements.number.test(password), 'number');
        updatePasswordRequirement('symbol', passwordRequirements.symbol.test(password), 'symbol');

        const isValidPassword = Object.keys(passwordRequirements).every(key => passwordRequirements[key].test(password));
        registerBtn.disabled = !isValidPassword;
    }

    if (document.getElementById('register-section').style.display === 'flex') {
        validatePassword();
    }

    passwordInput.addEventListener('input', validatePassword); // Validate while typing

    document.getElementById('showRegisterBtn').addEventListener('click', () => {
        document.getElementById('signin-section').style.display = 'none';
        document.getElementById('register-section').style.display = 'flex';
    });

    document.getElementById('showSigninBtn').addEventListener('click', () => {
        document.getElementById('register-section').style.display = 'none';
        document.getElementById('signin-section').style.display = 'flex';
    });

    //registration 
    registerBtn.addEventListener('click', async () => {
        const tuftsId = document.getElementById('registerTuftsId').value.trim();
        const password = document.getElementById('registerPassword').value.trim();

        if (!tuftsId || !password) {
            alert('Tufts ID and password are required.');
            return;
        }

        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tuftsId, password }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error);
            }

            alert('Registration successful. Please sign in.');
            document.getElementById('register-section').style.display = 'none';
            document.getElementById('signin-section').style.display = 'flex';
        } catch (error) {
            alert(error.message);
        }
    });
});


//sign in
signinBtn.addEventListener('click', async () => {
    const tuftsId = document.getElementById('tuftsId').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!tuftsId) {
        alert('Please enter a valid Tufts ID.');
        return;
    }
    try {
        const response = await fetch('/auth/signin', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tuftsId, password }),
        });
        if (!response.ok) throw new Error('Failed to sign in. Please try again.');

        const data = await response.json();
        userId = data.userId;

        setSession({ userId: data.userId, tuftsId: data.tuftsId });
        userIdDisplay.textContent = `Hi, ${data.tuftsId}`;

        toggleSections('chat');
        await loadChats();

        if (chats.length === 0) {
            const chatName = 'New Chat';
            const createChatResponse = await fetch('/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, name: chatName }),
            });
            if (!createChatResponse.ok) throw new Error('Error creating chat.');

            const chatData = await createChatResponse.json();
            activeChatId = chatData.chatId;
        } else {
            activeChatId = chats[0].id;
        }

        await updateChatDisplay();
    } catch (error) {
        alert(error.message);
    }
});

//guest mode
document.getElementById('guestBtn').addEventListener('click', () => {
    toggleSections('chat');
    userId = null; 
    chats = [];
    activeChatId = null;
    chatList.innerHTML = ''; 
    chatDisplay.innerHTML = ''; 
});


//load chats
async function loadChats() {
    try {
        const response = await fetch(`/chats/${userId}`);
        const data = await response.json();
        chats = data.chats;
        updateChatList();
    } catch (error) {
        alert('Failed to load chats.');
    }
}

function updateChatList() {
    chatList.innerHTML = '';
    chats.forEach((chat) => {
        const chatItem = document.createElement('div');
        chatItem.textContent = chat.name;
        chatItem.classList.add('chat-item');
        chatItem.addEventListener('click', async () => {
            activeChatId = chat.id;
            await updateChatDisplay();
        });
        chatList.appendChild(chatItem);
    });
}

//new chat
newChatBtn.addEventListener('click', async () => {
    try {
        const nextChatNumber = chats.length + 1;
        const chatName = `Chat ${nextChatNumber}`;
        const response = await fetch('/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name: chatName }),
        });
        if (!response.ok) throw new Error('Error creating chat.');

        const data = await response.json();
        activeChatId = data.chatId;
        await loadChats();
        await updateChatDisplay();
    } catch (error) {
        alert(error.message);
    }
});

//load msgs
async function loadMessages(chatId) {
    try {
        const response = await fetch(`/messages/${chatId}`);
        const data = await response.json();
        return data.messages || [];
    } catch (error) {
        alert('Failed to load messages.');
        return [];
    }
}

async function updateChatDisplay() {
    if (!activeChatId) return;

    const messages = await loadMessages(activeChatId);
    chatDisplay.innerHTML = ''; 

    messages.forEach((msg) => {
        addMessage(msg.sender === 'You' ? 'user' : 'assistant', msg.text);
    });

    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

//send message
function initializeListeners() {
    sendMessageBtn.addEventListener('click', handleSendMessage);

    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSendMessage();
        }
    });
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatId) {
        alert('Please select a chat and enter a message.');
        return;
    }

    try {
        if (!assistantReplySent[activeChatId]) assistantReplySent[activeChatId] = false;

        const response = await fetch('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: activeChatId, sender: 'You', text, assistantEnabled }),
        });

        if (response.ok) {
            messageInput.value = ''; // clear input
            await updateChatDisplay();
        } else {
            throw new Error('Error sending message.');
        }
    } catch (error) {
        alert(error.message);
    }
}

//upload pdfs
uploadPdfBtn.addEventListener('click', async () => {
    const file = pdfFileInput.files[0];
    if (!file) {
        alert('Please select a PDF file.');
        return;
    }

    const formData = new FormData();
    formData.append('pdfFile', file);
    formData.append('chatId', activeChatId);

    try {
        addMessage('user', `Uploaded PDF: ${file.name}`);

        const response = await fetch('/upload-pdf', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error('Failed to upload and summarize PDF.');

        const data = await response.json();


        addMessage('assistant',`PDF Summary: ${data.summary}`);
        
        await fetch('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: activeChatId,
                sender: 'You',
                text: `Uploaded PDF: ${file.name}`,
            }),
        });

        await fetch('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: activeChatId,
                sender: 'Assistant',
                text: `PDF Summary: ${data.summary}`,
            }),
        });

        await updateChatDisplay();
        pdfFileInput.value = '';
    } catch (error) {
        alert(error.message);
    }
});

function addMessage(sender, text) {
    const messageElement = document.createElement('div');
    messageElement.textContent = text;
    messageElement.classList.add('chat-message', sender);
    chatDisplay.appendChild(messageElement);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}


//logout
logoutBtn.addEventListener('click', () => {
    clearSession();
    userId = null;
    activeChatId = null;
    chats = [];
    userIdDisplay.textContent = ''; 

    toggleSections('signin');
});

