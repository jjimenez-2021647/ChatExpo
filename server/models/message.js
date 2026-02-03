import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    user: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'audio'],
        default: 'text'
    }
}, {
    timestamps: true
})

export default mongoose.model('Message', messageSchema)