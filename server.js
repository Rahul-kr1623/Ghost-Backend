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

// Use local MongoDB or your cluster URL
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ghost-protocol')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Updated Schema to match your frontend types
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
    reported: { type: Boolean, default: false }
});

const Post = mongoose.model('Post', postSchema);

// GET /api/posts - Fetch all active posts
app.get('/api/posts', async (req, res) => {
    try {
        const currentTime = Date.now();
        // Only fetch posts where createdAt + lifespan is greater than current time
        const activePosts = await Post.find().lean();
        const filteredPosts = activePosts.filter(p => (p.createdAt + p.lifespanMs) > currentTime);
        
        // Sort newest first
        filteredPosts.sort((a, b) => b.createdAt - a.createdAt);
        res.json(filteredPosts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/posts - Create a new spill
app.post('/api/posts', async (req, res) => {
    try {
        const newPost = new Post(req.body);
        await newPost.save();
        
        // Broadcast the new post to everyone
        io.emit('new_post', newPost);
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Socket Logic
io.on('connection', (socket) => {
    console.log('A ghost connected:', socket.id);

    // Chat Room Logic
    socket.on('join_thread', (postId) => {
        socket.join(postId);
        // Optionally notify others in room
    });

    socket.on('leave_thread', (postId) => {
        socket.leave(postId);
    });

    socket.on('send_message', (data) => {
        // data should have: roomId (postId), ghostId, alias, content, timestamp, id
        io.to(data.roomId).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('Ghost disconnected');
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));