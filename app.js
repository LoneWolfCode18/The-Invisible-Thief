// === INVISIBLE THIEF - MULTIPLAYER SOCKET.IO ===

const socket = io();

let mySocketId = null;
let myRole = null;
let thiefPos = null;
let turn = 'thief';
let gameActive = false;
let currentRoomCode = null;
let otherPlayerId = null;
let boardSize = 16; // Por defecto 4x4
let isHost = false; // Rastrear si es el creador de la sala
let playerReadyHandled = false; // Evitar disparar player-ready múltiples veces

// --- CONEXIÓN ---
socket.on('connect', () => {
    mySocketId = socket.id;
    document.getElementById('my-id').innerText = socket.id.substring(0, 12) + '...';
    console.log('✓ Conectado al servidor:', socket.id);
});

socket.on('disconnect', () => {
    console.log('✗ Desconectado del servidor');
});

// --- EVENTOS DE SALA ---
socket.on('room-created', (data) => {
    currentRoomCode = data.roomCode;
    isHost = data.isHost;
    showRoomUI(data.roomCode, true);
    console.log('✓ Sala creada:', data.roomCode);
});

socket.on('room-joined', (data) => {
    currentRoomCode = data.roomCode;
    isHost = data.isHost;
    showRoomUI(data.roomCode, false);
    console.log('✓ Unido a sala:', data.roomCode);
    console.log('✓ Esperando al otro jugador...');
});

socket.on('player-ready', (data) => {
    if (playerReadyHandled) return; // Evitar ejecutar múltiples veces
    playerReadyHandled = true;
    
    otherPlayerId = data.playerId;
    console.log('✓ Otro jugador conectado');
    document.getElementById('connection-status').innerText = '✓ ¡Conectado!';
    
    setTimeout(() => {
        document.getElementById('rooms-screen').classList.add('hidden');
        document.getElementById('board-size-screen').classList.remove('hidden');
        
        if (isHost) {
            updateStatus('Elige el tamaño del tablero');
        } else {
            showBoardSizeWaitingUI();
        }
    }, 500);
});

// --- EVENTOS DE JUEGO ---
socket.on('player-move', (data) => {
    thiefPos = data.pos;
    turn = 'detective';
    updateStatus('¡Ladrón escondido! Tu turno 🕵️');
});

socket.on('player-guess', (data) => {
    const dist = calculateDistance(data.index, thiefPos);
    socket.emit('guess-result', { 
        roomCode: currentRoomCode,
        index: data.index, 
        dist: dist 
    });
    
    if (dist === 0) {
        updateStatus('¡ATRAPADO! 😱');
        gameActive = false;
        showEndGameScreen('¡Ladrón atrapado!', '¡El detective te encontró! 😱');
    } else {
        updateStatus(`Falló (${dist})`);
        turn = 'thief';
    }
});

socket.on('guess-result', (data) => {
    showGuessResult(data.index, data.dist);
    if (data.dist === 0) {
        updateStatus('¡GANASTE! 🎉');
        gameActive = false;
        showEndGameScreen('¡Detectivé ganó!', '¡Has atrapado al ladrón! 🎉');
    } else {
        updateStatus(`Distancia: ${data.dist}`);
        turn = 'thief';
    }
});

// --- CREAR SALA ---
function createRoom() {
    socket.emit('create-room', {});
}

// --- MOSTRAR FORMULARIO ---
function showJoinRoomForm() {
    const form = document.getElementById('join-room-form');
    form.classList.toggle('hidden');
}

// --- UNIRSE A SALA ---
function joinRoom() {
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Ingresa código de sala');
        return;
    }
    
    updateStatus('Conectando...');
    socket.emit('join-room', { roomCode });
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
            <p id="connection-status">Esperando otro jugador...</p>
            <button onclick="leaveRoom()" class="btn-danger">Salir</button>
        </div>
    `;
}

// --- SALIR DE SALA ---
function leaveRoom() {
    socket.emit('leave-room', { roomCode: currentRoomCode });
    location.reload();
}

// --- ELEGIR ROL ---
function chooseRole(role) {
    if (!isHost) return; // Solo el host puede elegir el rol
    
    myRole = role;
    gameActive = true;
    
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const badge = role === 'thief' ? '🥷 LADRÓN' : '🕵️ DETECTIVE';
    document.getElementById('player-role-badge').innerText = badge;
    
    // Notificar al servidor
    socket.emit('player-ready', { 
        roomCode: currentRoomCode, 
        role: role 
    });
    
    updateStatus(role === 'thief' ? 'Elige escondite' : 'Esperando...');
    createBoard();
}

// --- ELEGIR TAMAÑO DE TABLERO ---
function chooseBoardSize(size) {
    if (!isHost) return; // Solo el host puede elegir
    
    const sizeMap = { 'small': 16, 'medium': 36, 'large': 64 };
    boardSize = sizeMap[size];
    
    // Notificar al otro jugador el tamaño
    socket.emit('board-size', { 
        roomCode: currentRoomCode, 
        boardSize: boardSize 
    });
    
    // Pasar a selección de rol
    setTimeout(() => {
        document.getElementById('board-size-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        updateStatus('¡Elige tu rol!');
    }, 300);
}

socket.on('board-size', (data) => {
    boardSize = data.boardSize;
    console.log('Tamaño de tablero:', boardSize);
});

socket.on('board-size-set', (data) => {
    boardSize = data.boardSize;
    console.log('Host eligió tamaño:', boardSize);
    
    // Limpiar mensaje de espera si existe
    const waitMessage = document.getElementById('wait-message');
    if (waitMessage) waitMessage.remove();
    
    // Habilitar botones de nuevo
    const buttons = document.querySelectorAll('.board-size-options button');
    buttons.forEach(btn => btn.disabled = false);
    
    // Pasar a selección de rol
    setTimeout(() => {
        document.getElementById('board-size-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
        showRoleSelectionWaitingUI();
        updateStatus('Host está eligiendo rol...');
    }, 500);
});

socket.on('host-role-selected', (data) => {
    const hostRole = data.role;
    console.log('Host eligió rol:', hostRole);
    
    // Asignar el rol opuesto al cliente
    myRole = hostRole === 'thief' ? 'detective' : 'thief';
    gameActive = true;
    
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    const badge = myRole === 'thief' ? '🥷 LADRÓN' : '🕵️ DETECTIVE';
    document.getElementById('player-role-badge').innerText = badge;
    
    updateStatus(myRole === 'thief' ? 'Elige escondite' : 'Esperando...');
    createBoard();
});

// --- CREAR TABLERO ---
function createBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    board.style.gridTemplateColumns = `repeat(${Math.sqrt(boardSize)}, 1fr)`;
    
    for (let i = 0; i < boardSize; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.onclick = () => handleCellClick(i);
        board.appendChild(cell);
    }
}

// --- CLICK EN CELDA ---
function handleCellClick(idx) {
    if (!gameActive) return;
    
    if (myRole === 'thief' && turn === 'thief') {
        thiefPos = idx;
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('thief-here'));
        document.querySelector(`[data-index="${idx}"]`).classList.add('thief-here');
        
        socket.emit('player-move', { 
            roomCode: currentRoomCode, 
            pos: idx 
        });
        
        turn = 'detective';
        updateStatus('¡Escondido!');
    } 
    else if (myRole === 'detective' && turn === 'detective') {
        socket.emit('player-guess', { 
            roomCode: currentRoomCode, 
            index: idx 
        });
        
        updateStatus('¡Disparo!');
        turn = 'thief';
    }
}

// --- DISTANCIA ---
function calculateDistance(idx1, idx2) {
    const cols = Math.sqrt(boardSize);
    const x1 = idx1 % cols, y1 = Math.floor(idx1 / cols);
    const x2 = idx2 % cols, y2 = Math.floor(idx2 / cols);
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

// --- VOLVER A JUGAR ---
function playAgain() {
    myRole = null;
    thiefPos = null;
    turn = 'thief';
    gameActive = false;
    
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-game-screen').classList.add('hidden');
    document.getElementById('board-size-screen').classList.remove('hidden');
    document.getElementById('board').innerHTML = '';
    
    updateStatus('Elige tamaño de tablero');
    socket.emit('play-again', { roomCode: currentRoomCode });
}

socket.on('play-again', () => {
    playAgain();
});

// --- PANTALLA DE FIN DE JUEGO ---
function showEndGameScreen(title, message) {
    setTimeout(() => {
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('end-game-screen').classList.remove('hidden');
        document.getElementById('end-game-title').innerText = title;
        document.getElementById('end-game-message').innerText = message;
    }, 1000);
}

// --- UI DE ESPERA PARA SELECCIÓN DE TAMAÑO ---
function showBoardSizeWaitingUI() {
    const boardSizeScreen = document.getElementById('board-size-screen');
    const options = boardSizeScreen.querySelector('.board-size-options');
    
    // Deshabilitar todos los botones
    const buttons = options.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    // Agregar mensaje de espera
    const waitMessage = document.createElement('p');
    waitMessage.id = 'wait-message';
    waitMessage.style.marginTop = '1rem';
    waitMessage.style.textAlign = 'center';
    waitMessage.style.color = '#a0aec0';
    waitMessage.innerText = '⏳ Esperando que el host elija el tamaño...';
    boardSizeScreen.appendChild(waitMessage);
}

// --- UI DE ESPERA PARA SELECCIÓN DE ROL ---
function showRoleSelectionWaitingUI() {
    const setupScreen = document.getElementById('setup-screen');
    const roleSelection = setupScreen.querySelector('.role-selection');
    
    // Deshabilitar todos los botones
    const buttons = roleSelection.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    // Agregar mensaje de espera
    const waitMessage = document.createElement('p');
    waitMessage.id = 'wait-message-role';
    waitMessage.style.marginTop = '1rem';
    waitMessage.style.textAlign = 'center';
    waitMessage.style.color = '#a0aec0';
    waitMessage.innerText = '⏳ Esperando que el host elija el rol...';
    setupScreen.appendChild(waitMessage);
}
