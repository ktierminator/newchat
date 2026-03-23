// File: referral-chatroom/app.js

/**
 * FIREBASE CONFIGURATION
 * * Replace the values below with your own Firebase project configuration.
 * 1. Go to Firebase Console -> Project Settings -> General
 * 2. Scroll down to "Your apps" and copy the config object.
 */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAocy6Jpx0rbzL47vWMn4R1RlZYxWeuc_c",
  authDomain: "chatroom-928c2.firebaseapp.com",
  projectId: "chatroom-928c2",
  storageBucket: "chatroom-928c2.firebasestorage.app",
  messagingSenderId: "98082615156",
  appId: "1:98082615156:web:278129c34031be24604621",
  measurementId: "G-231X9JBY9P"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// State
let currentRoom = null;
let currentUser = null;
let unsubscribeMessages = null;

// DOM Elements
const views = {
  landing: document.getElementById('landing-view'),
  chat: document.getElementById('chat-view')
};

// Landing DOM
const tabs = {
  join: document.getElementById('tab-join'),
  create: document.getElementById('tab-create')
};
const forms = {
  join: document.getElementById('form-join'),
  create: document.getElementById('form-create')
};
const inputs = {
  joinUsername: document.getElementById('join-username'),
  joinCode: document.getElementById('join-code'),
  createUsername: document.getElementById('create-username')
};
const errors = {
  join: document.getElementById('join-error'),
  create: document.getElementById('create-error')
};

// Chat DOM
const chatUI = {
  roomCodeDisplay: document.getElementById('room-code-display'),
  currentUserDisplay: document.getElementById('current-user-display'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnLeave: document.getElementById('btn-leave'),
  messagesList: document.getElementById('messages-list'),
  formMessage: document.getElementById('form-message'),
  messageInput: document.getElementById('message-input'),
  fileInput: document.getElementById('file-input'),
  btnSend: document.getElementById('btn-send'),
  uploadIndicator: document.getElementById('upload-indicator'),
  filePreviewName: document.getElementById('file-preview-name'),
  btnClearFile: document.getElementById('btn-clear-file')
};

// --- Initialization ---
function init() {
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');

  // Load from localStorage
  const savedUser = localStorage.getItem('chat_username');
  const savedRoom = localStorage.getItem('chat_last_room');

  if (savedUser) {
    inputs.joinUsername.value = savedUser;
    inputs.createUsername.value = savedUser;
  }

  if (roomParam) {
    inputs.joinCode.value = roomParam.toUpperCase();
    switchTab('join');
  } else if (savedRoom) {
    inputs.joinCode.value = savedRoom;
  }

  // Event Listeners for tabs
  tabs.join.addEventListener('click', () => switchTab('join'));
  tabs.create.addEventListener('click', () => switchTab('create'));

  // Event Listeners for forms
  forms.join.addEventListener('submit', handleJoinRoom);
  forms.create.addEventListener('submit', handleCreateRoom);

  // Chat Event Listeners
  chatUI.btnLeave.addEventListener('click', leaveRoom);
  chatUI.btnCopyLink.addEventListener('click', copyInviteLink);
  chatUI.formMessage.addEventListener('submit', handleSendMessage);
  chatUI.fileInput.addEventListener('change', handleFileSelection);
  chatUI.btnClearFile.addEventListener('click', clearFileSelection);
}

// --- UI Helpers ---
function switchTab(tabName) {
  if (tabName === 'join') {
    tabs.join.classList.add('active');
    tabs.create.classList.remove('active');
    forms.join.classList.remove('hidden');
    forms.create.classList.add('hidden');
    errors.join.classList.add('hidden');
  } else {
    tabs.create.classList.add('active');
    tabs.join.classList.remove('active');
    forms.create.classList.remove('hidden');
    forms.join.classList.add('hidden');
    errors.create.classList.add('hidden');
  }
}

function showView(viewName) {
  views.landing.classList.add('hidden');
  views.chat.classList.add('hidden');
  views[viewName].classList.remove('hidden');
}

function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// --- Logic: Join / Create ---
async function handleCreateRoom(e) {
  e.preventDefault();
  errors.create.classList.add('hidden');
  
  const username = inputs.createUsername.value.trim();
  if (!username) return;

  const roomCode = generateRoomCode();
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    // Create the room document
    await setDoc(roomRef, {
      createdAt: serverTimestamp(),
      creator: username
    });
    
    joinChat(username, roomCode);
  } catch (err) {
    console.error(err);
    errors.create.textContent = "Failed to create room. Check Firebase config and rules.";
    errors.create.classList.remove('hidden');
  }
}

async function handleJoinRoom(e) {
  e.preventDefault();
  errors.join.classList.add('hidden');

  const username = inputs.joinUsername.value.trim();
  const roomCode = inputs.joinCode.value.trim().toUpperCase();

  if (!username || !roomCode) return;

  try {
    const roomRef = doc(db, 'rooms', roomCode);
    const roomSnap = await getDoc(roomRef);

    if (roomSnap.exists()) {
      joinChat(username, roomCode);
    } else {
      errors.join.textContent = "Room not found. Check the code and try again.";
      errors.join.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    errors.join.textContent = "Error connecting to database. Check Firebase config.";
    errors.join.classList.remove('hidden');
  }
}

function joinChat(username, roomCode) {
  currentUser = username;
  currentRoom = roomCode;

  // Save to local storage
  localStorage.setItem('chat_username', username);
  localStorage.setItem('chat_last_room', roomCode);

  // Update URL without reloading
  const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + roomCode;
  window.history.pushState({path:newUrl}, '', newUrl);

  // Update Chat UI
  chatUI.roomCodeDisplay.textContent = `Room: ${roomCode}`;
  chatUI.currentUserDisplay.textContent = `You: ${username}`;
  chatUI.messagesList.innerHTML = ''; // Clear previous messages

  showView('chat');
  listenForMessages();
}

function leaveRoom() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  currentRoom = null;
  
  // Clear URL params
  const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
  window.history.pushState({path:cleanUrl}, '', cleanUrl);
  
  showView('landing');
}

function copyInviteLink() {
  const link = window.location.origin + window.location.pathname + '?room=' + currentRoom;
  navigator.clipboard.writeText(link).then(() => {
    const originalText = chatUI.btnCopyLink.textContent;
    chatUI.btnCopyLink.textContent = "Copied!";
    setTimeout(() => {
      chatUI.btnCopyLink.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error("Failed to copy", err);
  });
}

// --- Logic: Messages & Media ---
function listenForMessages() {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const msg = change.doc.data();
        msg.id = change.doc.id;
        renderMessage(msg);
      }
    });
  });
}

function handleFileSelection() {
  const file = chatUI.fileInput.files[0];
  if (file) {
    const maxMB = 10;
    if (file.size > maxMB * 1024 * 1024) {
      alert(`File is too large. Max size is ${maxMB}MB.`);
      clearFileSelection();
      return;
    }
    chatUI.filePreviewName.querySelector('span').textContent = file.name;
    chatUI.filePreviewName.classList.remove('hidden');
  } else {
    clearFileSelection();
  }
}

function clearFileSelection() {
  chatUI.fileInput.value = '';
  chatUI.filePreviewName.classList.add('hidden');
  chatUI.filePreviewName.querySelector('span').textContent = '';
}

async function handleSendMessage(e) {
  e.preventDefault();
  
  const text = chatUI.messageInput.value.trim();
  const file = chatUI.fileInput.files[0];

  if (!text && !file) return;

  chatUI.btnSend.disabled = true;
  let mediaUrl = null;
  let mediaType = null;
  let messageType = 'text';

  try {
    // 1. Upload File if exists
    if (file) {
      chatUI.uploadIndicator.classList.remove('hidden');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const storagePath = `rooms/${currentRoom}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload and get URL
      await uploadBytesResumable(storageRef, file);
      mediaUrl = await getDownloadURL(storageRef);
      
      mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      messageType = text ? 'mixed' : 'media';
    }

    // 2. Save Message to Firestore
    const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
    await addDoc(messagesRef, {
      username: currentUser,
      text: text,
      type: messageType,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      createdAt: serverTimestamp()
    });

    // 3. Reset UI
    chatUI.messageInput.value = '';
    clearFileSelection();

  } catch (err) {
    console.error("Error sending message:", err);
    alert("Failed to send message. Please try again.");
  } finally {
    chatUI.btnSend.disabled = false;
    chatUI.uploadIndicator.classList.add('hidden');
    // Keep focus on input for typing next message
    chatUI.messageInput.focus();
  }
}

function renderMessage(msg) {
  const isMe = msg.username === currentUser;
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isMe ? 'me' : 'other'}`;

  // Formatted Time
  let timeString = '';
  if (msg.createdAt) {
    // Handling serverTimestamp which could be null momentarily or a Timestamp object
    const date = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
    timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Sender Name (only show for others)
  let senderHtml = '';
  if (!isMe) {
    senderHtml = `<div class="message-sender">${msg.username}</div>`;
  }

  // Media Content
  let mediaHtml = '';
  if (msg.mediaUrl) {
    if (msg.mediaType === 'video') {
      mediaHtml = `
        <div class="message-media">
          <video src="${msg.mediaUrl}" controls></video>
        </div>`;
    } else {
      mediaHtml = `
        <div class="message-media">
          <a href="${msg.mediaUrl}" target="_blank">
            <img src="${msg.mediaUrl}" alt="Attached media" loading="lazy" />
          </a>
        </div>`;
    }
  }

  // Text Content
  let textHtml = '';
  if (msg.text) {
    // Basic sanitization by using textContent paradigm via element creation or replacing brackets
    const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    textHtml = `<div>${safeText}</div>`;
  }

  wrapper.innerHTML = `
    ${senderHtml}
    <div class="message-bubble">
      ${mediaHtml}
      ${textHtml}
      <span class="message-time">${timeString}</span>
    </div>
  `;

  chatUI.messagesList.appendChild(wrapper);
  
  // Auto-scroll to bottom
  chatUI.messagesList.scrollTop = chatUI.messagesList.scrollHeight;
}

// Start app
init();