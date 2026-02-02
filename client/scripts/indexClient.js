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
console.log('👤 Mi usuario:', myUsername)

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

// Elementos de tabs
const tabBtns = document.querySelectorAll('.tab-btn')
const messagesView = document.getElementById('messages-view')
const callView = document.getElementById('call-view')
const callTab = document.getElementById('call-tab')

let mediaRecorder = null
let audioChunks = []
let isRecording = false

// Variables para Jitsi Meet
let jitsiAPI = null
let inCall = false
let currentRoomUrl = null
let currentRoomName = null

// Elementos del modal
const callModalOverlay = document.getElementById('call-modal-overlay')
const callerNameEl = document.getElementById('caller-name')
const acceptCallBtn = document.getElementById('accept-call-btn')
const rejectCallBtn = document.getElementById('reject-call-btn')
const callFrame = document.getElementById('call-frame')

// ========== SISTEMA DE TABS ==========
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab
        switchTab(targetTab)
    })
})

function switchTab(tabName) {
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active')
        } else {
            btn.classList.remove('active')
        }
    })

    if (tabName === 'messages') {
        messagesView.classList.add('active')
        callView.classList.remove('active')
    } else if (tabName === 'call') {
        messagesView.classList.remove('active')
        callView.classList.add('active')
    }
}

socket.on('connect', () => {
    console.log('✅ Conectado al servidor')
})

socket.on('disconnect', () => {
    console.log('❌ Desconectado del servidor')
})

socket.on('error', (errorMsg) => {
    console.error('❌ Error del servidor:', errorMsg)
    alert('Error: ' + errorMsg)
})

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

socket.on('chat message', (msg, serverOffset, username, timestamp) => {
    renderTextMessage(msg, serverOffset, username, timestamp)
})

socket.on('image message', (imageData, serverOffset, username, timestamp) => {
    renderImageMessage(imageData, serverOffset, username, timestamp)
})

socket.on('audio message', (audioData, serverOffset, username, timestamp) => {
    renderAudioMessage(audioData, serverOffset, username, timestamp)
})

form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (input.value) {
        socket.emit('chat message', input.value)
        input.value = ''
    }
})

attachBtn.addEventListener('click', () => {
    fileInput.click()
})

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return
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
    fileInput.value = ''
})

micBtn.addEventListener('click', async () => {
    if (!isRecording) {
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
        mediaRecorder.stop()
        isRecording = false
        micBtn.classList.remove('recording')
        micBtn.textContent = '🎤'
        micBtn.title = 'Grabar audio'
    }
})

// ========== LLAMADAS CON JITSI MEET ==========

callBtn.addEventListener('click', async () => {
    if (!inCall) {
        console.log('📞 Solicitando crear sala de Jitsi...')
        callBtn.disabled = true
        callBtn.textContent = '⏳'
        socket.emit('create-call-room')
        setTimeout(() => {
            if (!inCall) {
                callBtn.disabled = false
                callBtn.textContent = '📞'
            }
        }, 10000)
    } else {
        endCall()
    }
})

socket.on('call-room-created', ({ roomUrl, roomName, username }) => {
    console.log('✅ Sala de Jitsi creada:', roomUrl)
    currentRoomUrl = roomUrl
    currentRoomName = roomName
    callBtn.disabled = false
    socket.emit('notify-call', { roomUrl, roomName })
    joinCall(roomUrl, roomName)
})

socket.on('call-notification', ({ roomUrl, roomName, username }) => {
    console.log('🔔 Llamada de:', username)
    if (!inCall) {
        currentRoomUrl = roomUrl
        currentRoomName = roomName
        callerNameEl.textContent = username
        callModalOverlay.classList.add('active')
    }
})

acceptCallBtn.addEventListener('click', () => {
    console.log('✅ Aceptando llamada')
    callModalOverlay.classList.remove('active')
    if (currentRoomUrl && currentRoomName) {
        joinCall(currentRoomUrl, currentRoomName)
    }
})

rejectCallBtn.addEventListener('click', () => {
    console.log('❌ Rechazando llamada')
    callModalOverlay.classList.remove('active')
    currentRoomUrl = null
    currentRoomName = null
})

function joinCall(roomUrl, roomName) {
    try {
        console.log('📞 Uniéndose a llamada de Jitsi:', roomName)

        if (typeof JitsiMeetExternalAPI === 'undefined') {
            console.error('❌ Jitsi API no cargada')
            alert('Error: API de Jitsi no disponible')
            return
        }

        inCall = true
        callBtn.classList.add('in-call')
        callBtn.textContent = '📵'
        callBtn.disabled = false

        callTab.style.display = 'flex'
        switchTab('call')

        // Configuración de Jitsi SIN moderador
        const domain = 'meet.jit.si'
        const options = {
            roomName: roomName,
            width: '100%',
            height: '100%',
            parentNode: callFrame,
            userInfo: {
                displayName: myUsername
            },
            configOverwrite: {
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                prejoinPageEnabled: false,
                disableDeepLinking: true,
                // CRÍTICO: Deshabilitar moderadores
                enableUserRolesBasedOnToken: false,
                disableModeratorIndicator: true,
                startAudioOnly: false,
                startVideoMuted: false
            },
            interfaceConfigOverwrite: {
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false,
                SHOW_BRAND_WATERMARK: false,
                MOBILE_APP_PROMO: false,
                TOOLBAR_BUTTONS: [
                    'microphone', 'camera', 'closedcaptions', 'desktop',
                    'fullscreen', 'fodeviceselection', 'hangup',
                    'chat', 'recording', 'livestreaming', 'etherpad',
                    'sharedvideo', 'settings', 'raisehand',
                    'videoquality', 'filmstrip', 'invite',
                    'feedback', 'stats', 'shortcuts',
                    'tileview', 'videobackgroundblur', 'download', 'help'
                ]
            }
        }

        jitsiAPI = new JitsiMeetExternalAPI(domain, options)

        jitsiAPI.addEventListener('videoConferenceJoined', () => {
            console.log('✅ Unido a la videollamada')
        })

        jitsiAPI.addEventListener('videoConferenceLeft', () => {
            console.log('🚪 Saliste de la videollamada')
            endCall()
        })

        jitsiAPI.addEventListener('readyToClose', () => {
            console.log('🔚 Ventana de Jitsi cerrada')
            endCall()
        })

        console.log('✅ Jitsi inicializado')

    } catch (error) {
        console.error('❌ Error al unirse:', error)
        alert('No se pudo unir a la llamada: ' + error.message)
        endCall()
    }
}

function endCall() {
    console.log('📵 Finalizando llamada')

    if (jitsiAPI) {
        try {
            jitsiAPI.dispose()
        } catch (e) {
            console.error('Error al cerrar Jitsi:', e)
        }
        jitsiAPI = null
    }

    callFrame.innerHTML = ''
    callTab.style.display = 'none'
    switchTab('messages')

    currentRoomUrl = null
    currentRoomName = null
    inCall = false
    callBtn.classList.remove('in-call')
    callBtn.textContent = '📞'
    callBtn.disabled = false

    console.log('✅ Llamada finalizada')
}

console.log('🚀 Cliente iniciado con Jitsi Meet')
console.log('👤 Usuario:', myUsername)
console.log('📱 Jitsi API:', typeof JitsiMeetExternalAPI !== 'undefined' ? '✅' : '❌')