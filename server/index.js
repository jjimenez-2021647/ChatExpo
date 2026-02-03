import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import Message from './models/message.js'
import dns from 'dns'

dotenv.config()

// Configurar Google DNS para resolver MongoDB Atlas
dns.setServers(['8.8.8.8', '8.8.4.4'])
console.log('🌐 DNS configurado: Google DNS (8.8.8.8)')

// Puerto
const port = process.env.PORT ?? 3000

// Inicialización de la app
const app = express()
const server = createServer(app)

// Socket.IO con soporte para archivos grandes
const io = new Server(server, {
    connectionStateRecovery: {},
    maxHttpBufferSize: 100e6 // 100MB para soportar imágenes de hasta 50MB (Base64 aumenta ~33%)
})

// Conexión a MongoDB Atlas con configuración estable
const mongoURI = process.env.MONGODB_URI

console.log('🔍 Intentando conectar a MongoDB...')
console.log('📋 URI presente:', mongoURI ? '✅' : '❌')

if (!mongoURI) {
    console.error('❌ MONGODB_URI no está definida en .env')
    process.exit(1)
}

mongoose.connect(mongoURI, {
    dbName: 'synapse-chat',
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true
    },
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4
})
    .then(async () => {
        console.log('✅ Conectado a MongoDB Atlas')
        await mongoose.connection.db.admin().ping()
        console.log('📁 Database:', mongoose.connection.db.databaseName)
        console.log('🏓 Ping exitoso!')
    })
    .catch(err => {
        console.error('❌ Error conectando a MongoDB:', err.message)
        console.error('📝 Tipo de error:', err.name)
        console.error('\n💡 Verifica:')
        console.error('   1. Network Access en MongoDB Atlas (0.0.0.0/0)')
        console.error('   2. Firewall/Antivirus de Windows')
        console.error('   3. Usuario y contraseña correctos')
        console.error('   4. Connection string en .env sin comillas\n')
        process.exit(1)
    })

io.on('connection', async (socket) => {
    console.log('✅ Usuario conectado:', socket.handshake.auth.username ?? 'anonymous')

    socket.on('disconnect', () => {
        console.log('❌ Usuario desconectado:', socket.handshake.auth.username ?? 'anonymous')
    })

    // Mensajes de texto
    socket.on('chat message', async (msg) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        try {
            const message = await Message.create({
                content: msg,
                user: username,
                type: 'text'
            })
            io.emit('chat message', msg, message._id.toString(), username, message.createdAt.toISOString())
            console.log(`💬 ${username}: ${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}`)
        } catch (e) {
            console.error('❌ Error guardando mensaje de texto:', e.message)
        }
    })

    // Mensajes con imagen
    socket.on('image message', async (imageData) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        const imageSizeKB = Math.round((imageData.length * 3) / 4 / 1024)
        console.log(`🖼️  ${username} envió una imagen (~${imageSizeKB}KB)`)
        
        try {
            const message = await Message.create({
                content: imageData,
                user: username,
                type: 'image'
            })
            io.emit('image message', imageData, message._id.toString(), username, message.createdAt.toISOString())
            console.log(`✅ Imagen guardada correctamente (ID: ${message._id})`)
        } catch (e) {
            console.error('❌ Error guardando imagen:', e.message)
            socket.emit('error', 'No se pudo guardar la imagen. Intenta con una más pequeña.')
        }
    })

    // Mensajes con audio
    socket.on('audio message', async (audioData) => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        const audioSizeKB = Math.round((audioData.length * 3) / 4 / 1024)
        console.log(`🎤 ${username} envió un audio (~${audioSizeKB}KB)`)
        
        try {
            const message = await Message.create({
                content: audioData,
                user: username,
                type: 'audio'
            })
            io.emit('audio message', audioData, message._id.toString(), username, message.createdAt.toISOString())
            console.log(`✅ Audio guardado correctamente (ID: ${message._id})`)
        } catch (e) {
            console.error('❌ Error guardando audio:', e.message)
            socket.emit('error', 'No se pudo guardar el audio.')
        }
    })

    // Crear sala de Jitsi Meet
    socket.on('create-call-room', async () => {
        const username = socket.handshake.auth.username ?? 'anonymous'
        console.log('📞 Creando sala de Jitsi para:', username)

        const roomName = `synapsechat${Date.now()}${Math.random().toString(36).substr(2, 6)}`
        const roomUrl = `https://8x8.vc/${roomName}`
        console.log('✅ Sala creada:', roomUrl)

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

    // Recuperar mensajes sin conexión
    if (!socket.recovered) {
        try {
            const serverOffset = socket.handshake.auth.serverOffset ?? 0

            let query = {}
            if (serverOffset && mongoose.Types.ObjectId.isValid(serverOffset)) {
                query = { _id: { $gt: new mongoose.Types.ObjectId(serverOffset) } }
            }

            const messages = await Message.find(query)
                .sort({ createdAt: 1 })
                .limit(50)

            console.log(`📥 Enviando ${messages.length} mensajes a ${socket.handshake.auth.username}`)

            messages.forEach(message => {
                if (message.type === 'text') {
                    socket.emit('chat message', message.content, message._id.toString(), message.user, message.createdAt.toISOString())
                } else if (message.type === 'image') {
                    socket.emit('image message', message.content, message._id.toString(), message.user, message.createdAt.toISOString())
                } else if (message.type === 'audio') {
                    socket.emit('audio message', message.content, message._id.toString(), message.user, message.createdAt.toISOString())
                }
            })
        } catch (e) {
            console.error('❌ Error recuperando mensajes:', e.message)
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
    console.log(`📦 Tamaño máximo de archivo: 100MB`)
    console.log(`🖼️  Imágenes soportadas: hasta 50MB`)
    console.log(`\n⚠️  Presiona Ctrl+C para detener el servidor\n`)
})

// ========== GRACEFUL SHUTDOWN ==========
// Manejar cierre limpio del servidor

async function gracefulShutdown(signal) {
    console.log(`\n\n🛑 Señal ${signal} recibida. Cerrando servidor...`)
    
    // Cerrar servidor HTTP
    server.close(() => {
        console.log('✅ Servidor HTTP cerrado')
    })
    
    // Cerrar todas las conexiones de Socket.IO
    io.close(() => {
        console.log('✅ Socket.IO cerrado')
    })
    
    // Cerrar conexión a MongoDB
    try {
        await mongoose.connection.close()
        console.log('✅ MongoDB desconectado')
    } catch (err) {
        console.error('❌ Error cerrando MongoDB:', err.message)
    }
    
    console.log('👋 Servidor detenido correctamente\n')
    process.exit(0)
}

// Capturar Ctrl+C (SIGINT)
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Capturar kill (SIGTERM)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Capturar errores no manejados
process.on('uncaughtException', (err) => {
    console.error('❌ Error no manejado:', err)
    gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rechazada no manejada:', reason)
    gracefulShutdown('UNHANDLED_REJECTION')
})