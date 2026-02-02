import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import fetch from 'node-fetch'

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

// Daily.co API Key
const DAILY_API_KEY = process.env.DAILY_API_KEY

// LOGGING DE INICIO - Verificar configuración
console.log('='.repeat(60))
console.log('🚀 INICIANDO SERVIDOR EXPOCHAT')
console.log('='.repeat(60))
console.log('📍 Puerto:', port)
console.log('🔑 DB Token:', process.env.DB_TOKEN ? '✅ Configurado' : '❌ NO configurado')
console.log('🔑 Daily API Key:', DAILY_API_KEY ? '✅ Configurado' : '❌ NO configurado')
if (DAILY_API_KEY) {
    console.log('   Primeros caracteres:', DAILY_API_KEY.substring(0, 10) + '...')
}
console.log('='.repeat(60))

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
        console.log(`💬 Mensaje de ${username}: ${msg.substring(0, 50)}...`)
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:msg, :username, :timestamp, :type)',
                args: { msg, username, timestamp, type: 'text' }
            })
        } catch (e) {
            console.error('❌ Error guardando mensaje:', e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Mensajes con imagen
    socket.on('image message', async (imageData) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        console.log(`🖼️  Imagen de ${username}`)
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:imageData, :username, :timestamp, :type)',
                args: { imageData, username, timestamp, type: 'image' }
            })
        } catch (e) {
            console.error('❌ Error guardando imagen:', e)
            return
        }
        io.emit('image message', imageData, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Mensajes con audio
    socket.on('audio message', async (audioData) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        console.log(`🎤 Audio de ${username}`)
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at, type) VALUES (:audioData, :username, :timestamp, :type)',
                args: { audioData, username, timestamp, type: 'audio' }
            })
        } catch (e) {
            console.error('❌ Error guardando audio:', e)
            return
        }
        io.emit('audio message', audioData, result.lastInsertRowid.toString(), username, timestamp)
    })

    // Crear sala de Daily.co
    socket.on('create-call-room', async () => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        
        console.log('\n' + '='.repeat(60))
        console.log('📞 SOLICITUD DE CREACIÓN DE SALA')
        console.log('='.repeat(60))
        console.log('👤 Usuario:', username)
        console.log('🔑 API Key disponible:', DAILY_API_KEY ? 'SÍ ✅' : 'NO ❌')
        
        if (!DAILY_API_KEY) {
            console.error('❌ ERROR CRÍTICO: DAILY_API_KEY no está configurada')
            socket.emit('error', 'Configuración del servidor incompleta. Contacta al administrador.')
            console.log('='.repeat(60) + '\n')
            return
        }
        
        try {
            console.log('📡 Enviando petición a Daily.co API...')
            
            const requestBody = {
                properties: {
                    enable_screenshare: true,
                    enable_chat: false,
                    start_video_off: false,
                    start_audio_off: false,
                    max_participants: 10,
                    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 2) // Expira en 2 horas
                }
            }
            
            console.log('📦 Body de la petición:', JSON.stringify(requestBody, null, 2))
            
            const response = await fetch('https://api.daily.co/v1/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DAILY_API_KEY}`
                },
                body: JSON.stringify(requestBody)
            })
            
            console.log('📥 Status de respuesta:', response.status, response.statusText)
            
            const room = await response.json()
            
            console.log('📄 Respuesta completa de Daily.co:')
            console.log(JSON.stringify(room, null, 2))
            
            if (room.url) {
                console.log('✅ ¡SALA CREADA EXITOSAMENTE!')
                console.log('🔗 URL de la sala:', room.url)
                console.log('📛 Nombre de la sala:', room.name)
                console.log('⏰ Expira:', new Date(room.config?.exp * 1000).toLocaleString())
                
                socket.emit('call-room-created', { 
                    roomUrl: room.url,
                    username 
                })
                
                console.log('✉️  Evento "call-room-created" enviado al cliente')
            } else {
                console.error('❌ ERROR: No se recibió URL de sala')
                console.error('Detalles del error:', room.error || 'Error desconocido')
                console.error('Información adicional:', room.info || 'Sin información adicional')
                
                socket.emit('error', room.error || 'No se pudo crear la sala de llamada')
            }
        } catch (error) {
            console.error('❌ EXCEPCIÓN AL CREAR SALA:')
            console.error('Tipo:', error.name)
            console.error('Mensaje:', error.message)
            console.error('Stack:', error.stack)
            
            socket.emit('error', 'Error al crear la sala: ' + error.message)
        }
        
        console.log('='.repeat(60) + '\n')
    })

    // Notificar llamada a todos
    socket.on('notify-call', (roomUrl) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        console.log(`📢 ${username} está notificando llamada con URL: ${roomUrl}`)
        console.log(`   Enviando notificación a todos los demás clientes...`)
        socket.broadcast.emit('call-notification', { roomUrl, username })
        console.log(`   ✅ Notificación enviada`)
    })

    if (!socket.recovered) { // <- recuperase los mensajes sin conexión
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user, created_at, type FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            console.log(`📨 Recuperando ${results.rows.length} mensajes para ${socket.handshake.auth.username}`)
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
            console.error('❌ Error recuperando mensajes:', e)
        }
    }
})

app.use(logger('dev'))
app.use(express.static('client'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log('\n' + '='.repeat(60))
    console.log(`🟢 Servidor corriendo en puerto ${port}`)
    console.log(`🌐 Accede en: http://localhost:${port}`)
    console.log('='.repeat(60) + '\n')
})