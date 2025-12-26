// === INVISIBLE THIEF - MULTIPLAYER CON SALAS ===
// Sistema de salas usando Firebase Realtime Database

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCj_W2mxX1ZxQ9K0p9mK3X5L8N9O0P1Q2R",
    authDomain: "invisible-thief-game.firebaseapp.com",
    databaseURL: "https://invisible-thief-game-default-rtdb.firebaseio.com",
    projectId: "invisible-thief-game",
    storageBucket: "invisible-thief-game.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456789abcdef"
};

// Inicializar Firebase (si no está disponible, usaremos localStorage)
let db = null;
const useFirebase = false; // Cambiar a true si configuras Firebase

// --- CONFIGURACIÓN DE RED (PeerJS) ---
const peer = new Peer();
let conn = null;

// --- ESTADO DEL JUEGO ---
let myRole = null;
let myPeerId = null;
let thiefPos = null;
let turn = 'thief';
let gameActive = false;
let currentRoomCode = null;
let isRoomHost = false;

// --- SALAS (Sistema Local) ---
const rooms = {}; // roomCode => { hostId, playerIds: [], status }

// --- INICIALIZACIÓN PEERJS ---
peer.on('open', (id) => {
    myPeerId = id;
    document.getElementById('my-id').innerText = id;
    console.log('Mi ID de PeerJS:', id);
});

peer.on('connection', (c) => {
    conn = c;
    setupConnection();
    updateStatus('¡Jugador conectado! Ambos pueden elegir rol.');
});

// --- GENERAR CÓDIGO DE SALA ---
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// --- CREAR SALA ---
function createRoom() {
    const roomCode = generateRoomCode();
    currentRoomCode = roomCode;
    isRoomHost = true;
    
    // Crear sala local
    rooms[roomCode] = {
        hostId: myPeerId,
        playerIds: [myPeerId],
        status: 'waiting',
        createdAt: new Date().getTime()
    };
    
    // Mostrar UI
    document.getElementById('rooms-screen').innerHTML = `
        <div id="active-room">
            <h3>Sala Creada: <strong>${roomCode}</strong></h3>
            <p style="color: #38bdf8; font-size: 1.1rem; margin: 1rem 0;">
                📋 Código de Sala: <strong>${roomCode}</strong>
            </p>
            <p>Comparte este código con tu amigo para que se una.</p>
            <p style="color: #a0a0a0; font-size: 0.9rem; margin-top: 1rem;">
                Esperando otro jugador...
            </p>
            <button onclick="leaveRoom()" class="btn-danger" style="margin-top: 1rem;">Cancelar Sala</button>
        </div>
    `;
    
    console.log('Sala creada:', roomCode);
}

// --- MOSTRAR FORMULARIO PARA UNIRSE ---
function showJoinRoomForm() {
    const form = document.getElementById('join-room-form');
    form.classList.toggle('hidden');
}

// --- UNIRSE A SALA ---
function joinRoom() {
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Ingresa el código de sala');
        return;
    }
    
    if (!rooms[roomCode]) {
        alert('Sala no encontrada. Verifica el código.');
        return;
    }
    
    const room = rooms[roomCode];
    if (room.playerIds.length >= 2) {
        alert('La sala está llena');
        return;
    }
    
    // Unirse a la sala
    currentRoomCode = roomCode;
    room.playerIds.push(myPeerId);
    
    // Conectar con el host
    const hostId = room.hostId;
    if (hostId !== myPeerId) {
        conn = peer.connect(hostId);
        setupConnection();
    }
    
    // Actualizar UI
    document.getElementById('rooms-screen').innerHTML = `
        <div id="active-room">
            <h3>Unido a Sala: <strong>${roomCode}</strong></h3>
            <p>Conectando con el otro jugador...</p>
            <button onclick="leaveRoom()" class="btn-danger">Salir de Sala</button>
        </div>
    `;
    
    console.log('Unido a sala:', roomCode);
}

// --- ABANDONAR SALA ---
function leaveRoom() {
    if (currentRoomCode && rooms[currentRoomCode]) {
        delete rooms[currentRoomCode];
    }
    
    if (conn) {
        conn.close();
        conn = null;
    }
    
    currentRoomCode = null;
    isRoomHost = false;
    myRole = null;
    gameActive = false;
    
    // Volver a pantalla de salas
    location.reload();
}

// --- CONFIGURAR CONEXIÓN ---
function setupConnection() {
    conn.on('open', () => {
        console.log('Conexión P2P establecida');
        updateStatus('¡Jugador conectado! Ahora elige tu rol.');
        
        // Mostrar pantalla de rol
        document.getElementById('rooms-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    });

    conn.on('data', (data) => {
        if (data.type === 'move') {
            thiefPos = data.pos;
            turn = 'detective';
            updateStatus('¡Ladrón escondido! Tu turno, Detective 🕵️‍♂️');
        } 
        else if (data.type === 'guess') {
            const dist = calculateDistance(data.index, thiefPos);
            conn.send({ type: 'result', index: data.index, dist: dist });
            
            if (dist === 0) {
                updateStatus('¡TE ATRAPARON! Game Over 😱');
                gameActive = false;
            } else {
                updateStatus(`¡Fallaste! (Distancia: ${dist})`);
                turn = 'thief';
            }
        }
        else if (data.type === 'result') {
            showGuessResult(data.index, data.dist);
            if (data.dist === 0) {
                updateStatus('¡ATRAPASTE AL LADRÓN! 🎉');
                gameActive = false;
            } else {
                updateStatus(`Distancia: ${data.dist}. Espera su movimiento...`);
                turn = 'thief';
            }
        }
    });

    conn.on('error', (err) => {
        console.error('Error de conexión:', err);
        updateStatus('Error en la conexión');
    });

    conn.on('close', () => {
        console.log('Conexión cerrada');
        updateStatus('Conexión perdida');
    });
}

// --- ELEGIR ROL ---
function chooseRole(role) {
    if (!conn || !conn.open) {
        alert('No hay conexión con el otro jugador');
        return;
    }
    
    myRole = role;
    gameActive = true;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const badge = role === 'thief' ? '🥷 LADRÓN' : '🕵️ DETECTIVE';
    document.getElementById('player-role-badge').innerText = badge;
    
    if (role === 'thief') {
        updateStatus('Elige tu escondite inicial');
        turn = 'thief';
    } else {
        updateStatus('Espera a que el ladrón se esconda...');
        turn = 'thief';
    }
    
    createBoard();
}

// --- CREAR TABLERO ---
function createBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    
    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.onclick = () => handleCellClick(i);
        board.appendChild(cell);
    }
}

// --- MANEJAR CLICK EN CELDA ---
function handleCellClick(idx) {
    if (!gameActive || !conn || !conn.open) return;
    
    if (myRole === 'thief' && turn === 'thief') {
        thiefPos = idx;
        
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('thief-here'));
        document.querySelector(`[data-index="${idx}"]`).classList.add('thief-here');
        
        conn.send({ type: 'move', pos: idx });
        
        turn = 'detective';
        updateStatus('¡Te escondiste! Espera el disparo del detective...');
    } 
    else if (myRole === 'detective' && turn === 'detective') {
        conn.send({ type: 'guess', index: idx });
        updateStatus('Disparaste... esperando resultado...');
        turn = 'thief';
    }
}

// --- CALCULAR DISTANCIA ---
function calculateDistance(idx1, idx2) {
    const x1 = idx1 % 4, y1 = Math.floor(idx1 / 4);
    const x2 = idx2 % 4, y2 = Math.floor(idx2 / 4);
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// --- MOSTRAR RESULTADO ---
function showGuessResult(idx, dist) {
    const cell = document.querySelector(`[data-index="${idx}"]`);
    cell.classList.add('guessed');
    cell.textContent = dist;
}

// --- ACTUALIZAR ESTADO ---
function updateStatus(msg) {
    const element = document.getElementById('game-status');
    if (element) {
        element.innerText = msg;
    }
}
