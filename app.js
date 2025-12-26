// === INVISIBLE THIEF - MULTIPLAYER CON SALAS FUNCIONALES ===

// Configuración de PeerJS con servidores STUN/TURN
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

const peer = new Peer({ config: peerConfig });
let conn = null;
let myPeerId = null;
let myRole = null;
let thiefPos = null;
let turn = 'thief';
let gameActive = false;
let currentRoomCode = null;

// --- INICIALIZACIÓN ---
peer.on('open', (id) => {
    myPeerId = id;
    document.getElementById('my-id').innerText = id;
    console.log('✓ Conectado a PeerJS con ID:', id);
});

peer.on('connection', (c) => {
    console.log('✓ Conexión entrante recibida');
    conn = c;
    setupConnection();
});

peer.on('error', (err) => {
    console.error('❌ Error de PeerJS:', err);
    updateStatus('Error: ' + err.message);
});

// --- CREAR SALA ---
async function createRoom() {
    const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: myPeerId, playerName: 'Jugador' })
    });
    
    const data = await response.json();
    currentRoomCode = data.roomCode;
    
    showRoomUI(data.roomCode, true);
    console.log('Sala creada:', data.roomCode);
}

// --- UNIRSE A SALA ---
async function joinRoom() {
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Ingresa el código de sala');
        return;
    }
    
    updateStatus('Conectando a sala...');
    
    try {
        const response = await fetch('/api/join-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode, peerId: myPeerId })
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert('Error: ' + error.error);
            updateStatus('Error al unirse a sala');
            return;
        }
        
        const data = await response.json();
        currentRoomCode = roomCode;
        
        console.log('Conectando con host:', data.hostId);
        
        // Conectar con el host
        conn = peer.connect(data.hostId, { reliable: true });
        
        conn.on('error', (err) => {
            console.error('Error al conectar:', err);
            updateStatus('❌ Error: No se pudo conectar con el host');
        });
        
        setupConnection();
        showRoomUI(roomCode, false);
    } catch (error) {
        console.error('Error:', error);
        alert('Error de red');
        updateStatus('Error de conexión');
    }
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
            ${isHost ? '<p>Comparte este código con tu amigo</p>' : '<p>Conectando con el host...</p>'}
            <button onclick="leaveRoom()" class="btn-danger" style="margin-top: 1rem;">Salir</button>
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
    conn = null;
    currentRoomCode = null;
    myRole = null;
    gameActive = false;
    location.reload();
}

// --- CONFIGURAR CONEXIÓN P2P ---
function setupConnection() {
    conn.on('open', () => {
        console.log('✓ Conexión P2P establecida');
        document.getElementById('rooms-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        updateStatus('¡Conectado! Elige tu rol.');
    });

    conn.on('data', (data) => {
        if (data.type === 'move') {
            thiefPos = data.pos;
            turn = 'detective';
            updateStatus('¡Ladrón escondido! Tu turno 🕵️‍♂️');
        } 
        else if (data.type === 'guess') {
            const dist = calculateDistance(data.index, thiefPos);
            conn.send({ type: 'result', index: data.index, dist: dist });
            
            if (dist === 0) {
                updateStatus('¡ATRAPADO! 😱');
                gameActive = false;
            } else {
                updateStatus(`Falló (distancia: ${dist})`);
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
                turn = 'thief';
            }
        }
    });

    conn.on('error', (err) => {
        console.error('❌ Error en conexión:', err);
        updateStatus('Error en la conexión P2P');
    });

    conn.on('close', () => {
        console.log('⚠️ Conexión cerrada');
        updateStatus('Conexión perdida');
    });
}

// --- ELEGIR ROL ---
function chooseRole(role) {
    if (!conn || !conn.open) {
        alert('No hay conexión');
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
        updateStatus('¡Escondido! Espera disparo...');
    } 
    else if (myRole === 'detective' && turn === 'detective') {
        conn.send({ type: 'guess', index: idx });
        updateStatus('¡Disparo!');
        turn = 'thief';
    }
}

// --- DISTANCIA ---
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
