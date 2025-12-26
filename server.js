// Servidor Socket.io para Invisible Thief
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404</h1>', 'utf-8');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const io = new Server(server, {
    cors: { origin: '*' }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`✓ Usuario conectado: ${socket.id}`);

    // Crear sala
    socket.on('create-room', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            hostId: socket.id,
            players: [socket.id],
            createdAt: Date.now()
        };
        
        socket.join(roomCode);
        socket.emit('room-created', { roomCode });
        
        console.log(`✓ Sala creada: ${roomCode}`);
    });

    // Unirse a sala
    socket.on('join-room', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];

        if (!room) {
            socket.emit('error', { message: 'Sala no encontrada' });
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Sala llena' });
            return;
        }

        room.players.push(socket.id);
        socket.join(roomCode);
        socket.emit('room-joined', { roomCode });
        
        // Notificar al host
        io.to(room.hostId).emit('player-ready', { playerId: socket.id });
        
        console.log(`✓ Se unió: ${socket.id} a sala ${roomCode}`);
    });

    // Jugador listo
    socket.on('player-ready', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        
        if (room) {
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('player-ready', { playerId: socket.id });
                }
            });
        }
    });

    // Movimiento del ladrón
    socket.on('player-move', (data) => {
        const { roomCode, pos } = data;
        const room = rooms[roomCode];
        
        if (room) {
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('player-move', { pos });
                }
            });
        }
    });

    // Disparo del detective
    socket.on('player-guess', (data) => {
        const { roomCode, index } = data;
        const room = rooms[roomCode];
        
        if (room) {
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('player-guess', { index });
                }
            });
        }
    });

    // Resultado del disparo
    socket.on('guess-result', (data) => {
        const { roomCode, index, dist } = data;
        const room = rooms[roomCode];
        
        if (room) {
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('guess-result', { index, dist });
                }
            });
        }
    });

    // Salir de sala
    socket.on('leave-room', (data) => {
        const { roomCode } = data;
        if (rooms[roomCode]) {
            delete rooms[roomCode];
            console.log(`✗ Sala cerrada: ${roomCode}`);
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        console.log(`✗ Desconectado: ${socket.id}`);
        
        for (const [roomCode, room] of Object.entries(rooms)) {
            if (room.players.includes(socket.id)) {
                delete rooms[roomCode];
                console.log(`✗ Sala cerrada: ${roomCode}`);
            }
        }
    });
});

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

server.listen(PORT, () => {
    console.log(`🎮 Servidor en puerto ${PORT}`);
});
