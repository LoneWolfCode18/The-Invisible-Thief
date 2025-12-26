// Servidor con Socket.io para señalización P2P
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    
    // Servir archivos estáticos
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
            res.end('<h1>404 - Archivo no encontrado</h1>', 'utf-8');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Socket.io para señalización
const io = new Server(server, {
    cors: { origin: '*' }
});

// Almacenar salas activas
const rooms = {};
const userSockets = {};

io.on('connection', (socket) => {
    console.log(`✓ Usuario conectado: ${socket.id}`);

    // Crear sala
    socket.on('create-room', (data, callback) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            hostId: socket.id,
            players: [socket.id],
            createdAt: Date.now()
        };
        userSockets[socket.id] = socket;
        
        socket.join(roomCode);
        console.log(`✓ Sala creada: ${roomCode} (Host: ${socket.id})`);
        
        callback({ roomCode, success: true });
    });

    // Unirse a sala
    socket.on('join-room', (data, callback) => {
        const { roomCode } = data;
        const room = rooms[roomCode];

        if (!room) {
            callback({ success: false, error: 'Sala no encontrada' });
            return;
        }

        if (room.players.length >= 2) {
            callback({ success: false, error: 'Sala llena' });
            return;
        }

        room.players.push(socket.id);
        userSockets[socket.id] = socket;
        socket.join(roomCode);

        console.log(`✓ Usuario se unió: ${socket.id} a sala ${roomCode}`);
        
        callback({ 
            success: true, 
            roomCode 
        });
    });

    // Intercambiar PeerJS IDs
    socket.on('send-peer-id', (data) => {
        const { roomCode, peerId } = data;
        const room = rooms[roomCode];
        
        if (room) {
            // Enviar el PeerJS ID a los otros jugadores en la sala
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('peer-id', { peerId });
                }
            });
            console.log(`📍 PeerJS ID compartido en sala ${roomCode}: ${peerId}`);
        }
    });

    // Mensajes de juego
    socket.on('game-message', (data) => {
        const { roomCode, message } = data;
        const room = rooms[roomCode];
        
        if (room) {
            // Enviar al otro jugador
            room.players.forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('game-message', message);
                }
            });
        }
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
    console.log(`🎮 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Accede en: http://localhost:${PORT}`);
});
