const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ghost-protocol')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// 🔥 UPDATED: Added messages array
const postSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    ghostId: String,
    alias: String,
    content: String,
    mood: String,
    visibility: String,
    createdAt: { type: Number, default: Date.now },
    lifespanMs: { type: Number, default: 7200000 },
    echoes: [String],
    reported: { type: Boolean, default: false },
    messages: { type: Array, default: [] } 
});

const Post = mongoose.model('Post', postSchema);

app.get('/api/posts', async (req, res) => {
    try {
        const currentTime = Date.now();
        const activePosts = await Post.find().lean();
        const filteredPosts = activePosts.filter(p => (p.createdAt + p.lifespanMs) > currentTime);
        
        filteredPosts.sort((a, b) => b.createdAt - a.createdAt);
        res.json(filteredPosts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/posts', async (req, res) => {
    try {
        const newPost = new Post(req.body);
        await newPost.save();
        
        io.emit('new_post', newPost);
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔥 UPDATED: Socket Logic with DB sync
io.on('connection', (socket) => {
    console.log('A ghost connected:', socket.id);

    socket.on('join_thread', async (postId) => {
        socket.join(postId);
        try {
            const post = await Post.findOne({ id: postId });
            if (post && post.messages && post.messages.length > 0) {
                socket.emit('chat_history', post.messages);
            }
        } catch (err) { console.error("History fetch error", err); }
    });

    socket.on('leave_thread', (postId) => {
        socket.leave(postId);
    });

    socket.on('send_message', async (data) => {
        try {
            await Post.findOneAndUpdate(
                { id: data.roomId },
                { $push: { messages: data } }
            );
        } catch (err) { console.error("Message save error", err); }

        io.to(data.roomId).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('Ghost disconnected');
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));