import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'
import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

//puerto
const port = process.env.PORT ?? 3000
//inicializacion de la app
const app = express()
const server = createServer(app) //creacion del servidor http
//i-o = entrada - salida
const io = new Server(server, {
    connectionStateRecovery: {},
    maxHttpBufferSize: 10e6 // 10 MB para soportar imágenes y audio
})
const db = createClient({
    url: "libsql://chatexpo-jimenez.aws-us-east-1.turso.io",
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT,
    created_at TEXT,
    type TEXT DEFAULT 'text'
    )
    `)
// Agregar columna created_at si la tabla ya existia sin ella
try {
    await db.execute(`ALTER TABLE messages ADD COLUMN created_at TEXT`)
} catch (e) {
    // Ya existe la columna, no hacer nada
}

// Agregar columna type si no existe
try {
    await db.execute(`ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'`)
} catch (e) {
    // Ya existe la columna, no hacer nada
}

io.on('connection', async (socket) => {
    console.log('✅ Usuario conectado:', socket.handshake.auth.username ?? 'anonymous')
    
    socket.on('disconnect', () => {
        console.log('❌ Usuario desconectado:', socket.handshake.auth.username ?? 'anonymous')
    })

    // Mensajes de texto
    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:msg, :username, :timestamp, :type)',
                args: { msg, username, timestamp, type: 'text' }
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Mensajes con imagen
    socket.on('image message', async (imageData) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        console.log(`🖼️  ${username} envió una imagen`)
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:imageData, :username, :timestamp, :type)',
                args: { imageData, username, timestamp, type: 'image' }
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('image message', imageData, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Mensajes con audio
    socket.on('audio message', async (audioData) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        console.log(`🎤 ${username} envió un audio`)
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:audioData, :username, :timestamp, :type)',
                args: { audioData, username, timestamp, type: 'audio' }
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('audio message', audioData, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Crear sala de Jitsi Meet (100% GRATIS, sin API Key)
    socket.on('create-call-room', async () => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        
        console.log('📞 Creando sala de Jitsi para:', username)
        
        // Generar nombre único para la sala
        const roomName = `ExpoChat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const roomUrl = `https://meet.jit.si/${roomName}`
        
        console.log('✅ Sala creada:', roomUrl)
        
        // Enviar URL de sala al cliente
        socket.emit('call-room-created', { 
            roomUrl: roomUrl,
            roomName: roomName,
            username: username
        })
    })

    // Notificar llamada a todos
    socket.on('notify-call', (data) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        console.log(`📢 ${username} está notificando llamada`)
        socket.broadcast.emit('call-notification', { 
            roomUrl: data.roomUrl,
            roomName: data.roomName,
            username: username 
        })
    })

    if (!socket.recovered) { // <- recuperase los mensajes sin conexión
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user, created_at, type FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            results.rows.forEach(row => {
                const messageType = row.type || 'text'
                if (messageType === 'text') {
                    socket.emit('chat message', row.content, row.id.toString(), row.user, row.created_at)
                } else if (messageType === 'image') {
                    socket.emit('image message', row.content, row.id.toString(), row.user, row.created_at)
                } else if (messageType === 'audio') {
                    socket.emit('audio message', row.content, row.id.toString(), row.user, row.created_at)
                }
            })
        } catch (e) {
            console.error(e)
        }
    }
})

app.use(logger('dev'))
app.use(express.static('client'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log(`🚀 Servidor corriendo en puerto ${port}`)
    console.log(`🌐 http://localhost:${port}`)
})