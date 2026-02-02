// importamos la biblioteca y traemos io, vanilla js
import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js'

const names = [
    'Carlos', 'María', 'Pedro', 'Ana', 'Luis', 'Sofia',
    'Diego', 'Laura', 'Miguel', 'Valentina', 'Andrés', 'Camila',
    'José', 'Isabella', 'Daniel', 'Lucía', 'Mateo', 'Paula',
    'Santiago', 'Renata'
]

const getUsername = () => {
    const username = localStorage.getItem('username')
    if (username) {
        console.log(`User existed ${username}`)
        return username
    }

    const randomName = names[Math.floor(Math.random() * names.length)]
    const randomSuffix = Math.random().toString(36).substring(2, 5)
    const randomUsername = `${randomName}_${randomSuffix}`

    localStorage.setItem('username', randomUsername)
    return randomUsername
}

const myUsername = getUsername()

const socket = io({
    auth: {
        username: myUsername,
        serverOffset: 0
    }
})

const form = document.getElementById('form')
const input = document.getElementById('input')
const messages = document.getElementById('messages')

// Formatea el timestamp como "Hoy HH:MM", "Ayer HH:MM" o "DD/MM/YYYY HH:MM"
const formatTimestamp = (isoString) => {
    if (!isoString) return ''

    const date = new Date(isoString)
    const now = new Date()

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const time = `${hours}:${minutes}`

    if (msgDate.getTime() === today.getTime()) {
        return `Hoy ${time}`
    } else if (msgDate.getTime() === yesterday.getTime()) {
        return `Ayer ${time}`
    } else {
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year} ${time}`
    }
}

socket.on('chat message', (msg, serverOffset, username, timestamp) => {
    const isOwn = username === myUsername
    const formattedTime = formatTimestamp(timestamp)

    const item = `<li class="${isOwn ? 'own' : 'other'}">
    ${isOwn ? '' : `<small>${username}</small>`}
    <p>${msg}</p>
    ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
  </li>`
    messages.insertAdjacentHTML('beforeend', item)
    socket.auth.serverOffset = serverOffset
    // scroll to bottom of messages
    messages.scrollTop = messages.scrollHeight
})

form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (input.value) {
        socket.emit('chat message', input.value)
        input.value = ''
    }
})