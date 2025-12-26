// === INVISIBLE THIEF - MULTIPLAYER FUNCIONAL ===

// Socket.io para señalización
const socket = io();

// PeerJS para conexión P2P
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};
const peer = new Peer({ config: peerConfig });

// Estado del juego
let myPeerId = null;
let conn = null;
let myRole = null;
let thiefPos = null;
let turn = 'thief';
let gameActive = false;
let currentRoomCode = null;

// --- SOCKET.IO EVENTS ---
socket.on('connect', () => {
    console.log('✓ Conectado al servidor');
});

socket.on('player-joined', (data) => {
    console.log('✓ Otro jugador llegó:', data.playerId);
    // Intentar conectar con PeerJS
    if (myPeerId) {
        setTimeout(() => {
            conn = peer.connect(data.playerId);
            setupConnection();
        }, 500);
    }
});

socket.on('game-message', (message) => {
    // Este evento se usa si Socket.io transmite mensajes del juego
    console.log('Mensaje recibido:', message);
});

socket.on('disconnect', () => {
    console.log('✗ Desconectado del servidor');
    if (conn) conn.close();
});

// --- PEERJS EVENTS ---
peer.on('open', (id) => {
    myPeerId = id;
    document.getElementById('my-id').innerText = id;
    console.log('✓ PeerJS ID:', id);
});

peer.on('connection', (c) => {
    console.log('✓ Conexión P2P recibida');
    conn = c;
    setupConnection();
});

peer.on('error', (err) => {
    console.error('❌ Error PeerJS:', err);
});

// --- CREAR SALA ---
async function createRoom() {
    socket.emit('create-room', {}, (data) => {
        if (data.success) {
            currentRoomCode = data.roomCode;
            showRoomUI(data.roomCode, true);
            console.log('✓ Sala creada:', data.roomCode);
        }
    });
}

// --- UNIRSE A SALA ---
async function joinRoom() {
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Ingresa código de sala');
        return;
    }
    
    updateStatus('Conectando...');
    
    socket.emit('join-room', { roomCode }, (data) => {
        if (data.success) {
            currentRoomCode = roomCode;
            
            console.log('✓ Unido a sala:', roomCode);
            console.log('✓ Conectando con host:', data.hostId);
            
            // Conectar con PeerJS al host
            conn = peer.connect(data.hostId);
            setupConnection();
            
            showRoomUI(roomCode, false);
        } else {
            alert('Error: ' + data.error);
            updateStatus('Error');
        }
    });
}

// --- UI DE SALA ---
function showRoomUI(roomCode, isHost) {
    document.getElementById('rooms-screen').innerHTML = `
        <div id="active-room">
            <h3>Código de Sala</h3>
            <div style="background: #0f141a; padding: 1rem; border-radius: 8px; border: 2px solid var(--accent); margin: 1rem 0;">
                <p style="font-size: 2rem; margin: 0; color: var(--success); font-weight: bold; font-family: monospace;">
                    ${roomCode}
                </p>
            </div>
            <p id="connection-status">Esperando conexión P2P...</p>
            <button onclick="leaveRoom()" class="btn-danger">Salir</button>
        </div>
    `;
}

// --- MOSTRAR FORMULARIO ---
function showJoinRoomForm() {
    const form = document.getElementById('join-room-form');
    form.classList.toggle('hidden');
}

// --- SALIR DE SALA ---
function leaveRoom() {
    if (conn) conn.close();
    socket.emit('disconnect');
    location.reload();
}

// --- CONFIGURAR CONEXIÓN P2P ---
function setupConnection() {
    conn.on('open', () => {
        console.log('✓ Conexión P2P ESTABLECIDA');
        document.getElementById('connection-status').innerText = '✓ Conectado!';
        
        setTimeout(() => {
            document.getElementById('rooms-screen').classList.add('hidden');
            document.getElementById('setup-screen').classList.remove('hidden');
            updateStatus('¡Conectado! Elige rol.');
        }, 500);
    });

    conn.on('data', (data) => {
        if (data.type === 'move') {
            thiefPos = data.pos;
            turn = 'detective';
            updateStatus('¡Ladrón escondido! Tu turno 🕵️');
        } 
        else if (data.type === 'guess') {
            const dist = calculateDistance(data.index, thiefPos);
            conn.send({ type: 'result', index: data.index, dist: dist });
            
            if (dist === 0) {
                updateStatus('¡ATRAPADO! 😱');
                gameActive = false;
            } else {
                updateStatus(`Falló (${dist})`);
                turn = 'thief';
            }
        }
        else if (data.type === 'result') {
            showGuessResult(data.index, data.dist);
            if (data.dist === 0) {
                updateStatus('¡GANASTE! 🎉');
                gameActive = false;
            } else {
                updateStatus(`Distancia: ${data.dist}`);
            }
        }
    });

    conn.on('error', (err) => {
        console.error('❌ Error P2P:', err);
        updateStatus('Error en conexión');
    });

    conn.on('close', () => {
        console.log('✗ Conexión P2P cerrada');
        updateStatus('Conexión perdida');
    });
}

// --- ELEGIR ROL ---
function chooseRole(role) {
    if (!conn || !conn.open) {
        alert('No hay conexión con otro jugador');
        return;
    }
    
    myRole = role;
    gameActive = true;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const badge = role === 'thief' ? '🥷 LADRÓN' : '🕵️ DETECTIVE';
    document.getElementById('player-role-badge').innerText = badge;
    
    updateStatus(role === 'thief' ? 'Elige escondite' : 'Esperando...');
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

// --- CLICK EN CELDA ---
function handleCellClick(idx) {
    if (!gameActive || !conn || !conn.open) return;
    
    if (myRole === 'thief' && turn === 'thief') {
        thiefPos = idx;
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('thief-here'));
        document.querySelector(`[data-index="${idx}"]`).classList.add('thief-here');
        conn.send({ type: 'move', pos: idx });
        turn = 'detective';
        updateStatus('¡Escondido!');
    } 
    else if (myRole === 'detective' && turn === 'detective') {
        conn.send({ type: 'guess', index: idx });
        updateStatus('¡Disparo!');
        turn = 'thief';
    }
}

// --- DISTANCIA (Manhattan) ---
function calculateDistance(idx1, idx2) {
    const x1 = idx1 % 4, y1 = Math.floor(idx1 / 4);
    const x2 = idx2 % 4, y2 = Math.floor(idx2 / 4);
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// --- RESULTADO ---
function showGuessResult(idx, dist) {
    const cell = document.querySelector(`[data-index="${idx}"]`);
    cell.classList.add('guessed');
    cell.textContent = dist;
}

// --- ESTADO ---
function updateStatus(msg) {
    const el = document.getElementById('game-status');
    if (el) el.innerText = msg;
}
