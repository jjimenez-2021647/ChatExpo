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
    connectionStateRecovery: {}
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
    created_at TEXT
    )
    `)
// Agregar columna created_at si la tabla ya existia sin ella
try {
    await db.execute(`ALTER TABLE messages ADD COLUMN created_at TEXT`)
} catch (e) {
    // Ya existe la columna, no hacer nada
}
io.on('connection', async (socket) => {
    console.log('a user has connected!')
    socket.on('disconnect', () => {
        console.log('a user has disconnected!')
    })
    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        const timestamp = new Date().toISOString()
        console.log({ username })
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, created_at) VALUES (:msg, :username, :timestamp)',
                args: { msg, username, timestamp }
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username, timestamp)
    })
    if (!socket.recovered) { // <- recuperase los mensajes sin conexión
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user, created_at FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user, row.created_at)
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
});
server.listen(port, () => {
    console.log(`Server running on port ${port}`)
})