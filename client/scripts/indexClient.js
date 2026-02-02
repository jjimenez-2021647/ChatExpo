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
const attachBtn = document.getElementById('attach-btn')
const fileInput = document.getElementById('file-input')
const micBtn = document.getElementById('mic-btn')
const callBtn = document.getElementById('call-btn')

let mediaRecorder = null
let audioChunks = []
let isRecording = false

// Variables para Daily.co
let dailyCall = null
let inCall = false
let currentRoomUrl = null

// Elementos del modal
const callModalOverlay = document.getElementById('call-modal-overlay')
const callerNameEl = document.getElementById('caller-name')
const acceptCallBtn = document.getElementById('accept-call-btn')
const rejectCallBtn = document.getElementById('reject-call-btn')
const callContainer = document.getElementById('call-container')
const callFrame = document.getElementById('call-frame')

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

// Renderizar mensaje de texto
function renderTextMessage(msg, serverOffset, username, timestamp) {
    const isOwn = username === myUsername
    const formattedTime = formatTimestamp(timestamp)

    const item = `<li class="${isOwn ? 'own' : 'other'}">
        ${isOwn ? '' : `<small>${username}</small>`}
        <p>${msg}</p>
        ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
    </li>`
    
    messages.insertAdjacentHTML('beforeend', item)
    socket.auth.serverOffset = serverOffset
    messages.scrollTop = messages.scrollHeight
}

// Renderizar mensaje con imagen
function renderImageMessage(imageData, serverOffset, username, timestamp) {
    const isOwn = username === myUsername
    const formattedTime = formatTimestamp(timestamp)

    const item = `<li class="${isOwn ? 'own' : 'other'}">
        ${isOwn ? '' : `<small>${username}</small>`}
        <div class="message-image-container">
            <img src="${imageData}" class="message-image" alt="Imagen compartida" />
        </div>
        ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
    </li>`
    
    messages.insertAdjacentHTML('beforeend', item)
    socket.auth.serverOffset = serverOffset
    messages.scrollTop = messages.scrollHeight
}

// Renderizar mensaje con audio
function renderAudioMessage(audioData, serverOffset, username, timestamp) {
    const isOwn = username === myUsername
    const formattedTime = formatTimestamp(timestamp)

    const item = `<li class="${isOwn ? 'own' : 'other'}">
        ${isOwn ? '' : `<small>${username}</small>`}
        <div class="message-audio">
            <audio controls>
                <source src="${audioData}" type="audio/webm">
                Tu navegador no soporta audio.
            </audio>
        </div>
        ${formattedTime ? `<span class="timestamp">${formattedTime}</span>` : ''}
    </li>`
    
    messages.insertAdjacentHTML('beforeend', item)
    socket.auth.serverOffset = serverOffset
    messages.scrollTop = messages.scrollHeight
}

// Recibir mensajes de texto
socket.on('chat message', (msg, serverOffset, username, timestamp) => {
    renderTextMessage(msg, serverOffset, username, timestamp)
})

// Recibir mensajes con imagen
socket.on('image message', (imageData, serverOffset, username, timestamp) => {
    renderImageMessage(imageData, serverOffset, username, timestamp)
})

// Recibir mensajes con audio
socket.on('audio message', (audioData, serverOffset, username, timestamp) => {
    renderAudioMessage(audioData, serverOffset, username, timestamp)
})

// Enviar mensaje de texto
form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (input.value) {
        socket.emit('chat message', input.value)
        input.value = ''
    }
})

// Botón de adjuntar imagen
attachBtn.addEventListener('click', () => {
    fileInput.click()
})

// Enviar imagen
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Verificar que sea imagen y menor a 5MB
    if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona una imagen válida')
        return
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('La imagen es muy grande. Máximo 5MB')
        return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
        const imageData = event.target.result
        socket.emit('image message', imageData)
    }
    reader.readAsDataURL(file)

    // Limpiar input
    fileInput.value = ''
})

// Botón de micrófono - grabar audio
micBtn.addEventListener('click', async () => {
    if (!isRecording) {
        // Iniciar grabación
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            
            mediaRecorder = new MediaRecorder(stream)
            audioChunks = []

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data)
            }

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
                const reader = new FileReader()
                
                reader.onload = (event) => {
                    const audioData = event.target.result
                    socket.emit('audio message', audioData)
                }
                
                reader.readAsDataURL(audioBlob)

                // Detener stream
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            isRecording = true
            micBtn.classList.add('recording')
            micBtn.textContent = '⏹️'
            micBtn.title = 'Detener grabación'

        } catch (error) {
            console.error('Error al acceder al micrófono:', error)
            alert('No se pudo acceder al micrófono. Verifica los permisos.')
        }
    } else {
        // Detener grabación
        mediaRecorder.stop()
        isRecording = false
        micBtn.classList.remove('recording')
        micBtn.textContent = '🎤'
        micBtn.title = 'Grabar audio'
    }
})

// ========== FUNCIONALIDAD DE LLAMADAS GRUPALES CON DAILY.CO ==========

// Botón de llamada
callBtn.addEventListener('click', async () => {
    if (!inCall) {
        // Solicitar crear una sala
        socket.emit('create-call-room')
    } else {
        // Salir de la llamada
        endCall()
    }
})

// Recibir URL de sala creada
socket.on('call-room-created', ({ roomUrl, username }) => {
    console.log('Sala creada:', roomUrl)
    currentRoomUrl = roomUrl
    
    // Notificar a todos sobre la llamada
    socket.emit('notify-call', roomUrl)
    
    // Unirse automáticamente
    joinCall(roomUrl)
})

// Recibir notificación de llamada
socket.on('call-notification', ({ roomUrl, username }) => {
    if (!inCall) {
        currentRoomUrl = roomUrl
        callerNameEl.textContent = username
        callModalOverlay.classList.add('active')
    }
})

// Aceptar llamada
acceptCallBtn.addEventListener('click', () => {
    callModalOverlay.classList.remove('active')
    if (currentRoomUrl) {
        joinCall(currentRoomUrl)
    }
})

// Rechazar llamada
rejectCallBtn.addEventListener('click', () => {
    callModalOverlay.classList.remove('active')
    currentRoomUrl = null
})

// Función para unirse a una llamada
async function joinCall(roomUrl) {
    try {
        inCall = true
        callBtn.classList.add('in-call')
        callBtn.textContent = '📵'
        callBtn.title = 'Salir de la llamada'
        
        // Mostrar contenedor de llamada
        callContainer.style.display = 'block'
        
        // Crear instancia de Daily
        dailyCall = window.DailyIframe.createFrame(callFrame, {
            showLeaveButton: true,
            showFullscreenButton: true,
            iframeStyle: {
                width: '100%',
                height: '100%',
                border: '0'
            }
        })
        
        // Eventos de Daily
        dailyCall.on('left-meeting', () => {
            endCall()
        })
        
        dailyCall.on('error', (error) => {
            console.error('Daily error:', error)
            alert('Error en la llamada')
            endCall()
        })
        
        // Unirse a la sala
        await dailyCall.join({ 
            url: roomUrl,
            userName: myUsername
        })
        
        console.log('Unido a la llamada')
        
    } catch (error) {
        console.error('Error al unirse a la llamada:', error)
        alert('No se pudo unir a la llamada')
        endCall()
    }
}

// Función para terminar llamada
function endCall() {
    console.log('Finalizando llamada...')
    
    if (dailyCall) {
        dailyCall.destroy()
        dailyCall = null
    }
    
    callContainer.style.display = 'none'
    currentRoomUrl = null
    inCall = false
    callBtn.classList.remove('in-call')
    callBtn.textContent = '📞'
    callBtn.title = 'Iniciar llamada grupal'
}