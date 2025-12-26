// Servidor con gestión de salas
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8000;

// Almacenar salas activas
const rooms = {};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API para crear sala
    if (pathname === '/api/create-room' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = JSON.parse(body);
            const roomCode = generateRoomCode();
            rooms[roomCode] = {
                hostId: data.peerId,
                hostName: data.playerName || 'Host',
                createdAt: Date.now(),
                players: [data.peerId]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ roomCode, message: 'Sala creada' }));
            console.log(`Sala creada: ${roomCode}`);
        });
        return;
    }

    // API para unirse a sala
    if (pathname === '/api/join-room' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = JSON.parse(body);
            const room = rooms[data.roomCode];
            
            if (!room) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Sala no encontrada' }));
                return;
            }

            if (room.players.length >= 2) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Sala llena' }));
                return;
            }

            room.players.push(data.peerId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                hostId: room.hostId,
                message: 'Unido a sala'
            }));
            console.log(`Jugador se unió a sala: ${data.roomCode}`);
        });
        return;
    }

    // API para obtener salas activas
    if (pathname === '/api/rooms' && req.method === 'GET') {
        const activeSalas = Object.entries(rooms)
            .filter(([code, room]) => room.players.length < 2)
            .map(([code, room]) => ({
                code,
                hostName: room.hostName,
                players: room.players.length
            }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(activeSalas));
        return;
    }

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
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Archivo no encontrado</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Error: ' + err, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
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
    console.log(`🎮 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Accede en: http://localhost:${PORT}`);
    console.log('Presiona Ctrl+C para detener');
});
