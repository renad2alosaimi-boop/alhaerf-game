const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const ARABIC_LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];
const rooms = {};

io.on('connection', (socket) => {
  console.log('لاعب متصل:', socket.id);

  // 1. إنشاء غرفة
  socket.on('createRoom', ({ playerName }) => {
    const roomId = 'ROOM-' + Math.floor(1000 + Math.random() * 9000);
    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      currentLetter: '',
      isGameStarted: false,
      answers: {},
      stoppedBy: null,
      lastRoundScores: {}
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players, isHost: true });
  });

  // 2. الانضمام لغرفة
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', 'رمز الغرفة غير صحيح!');
    if (room.isGameStarted) return socket.emit('errorMsg', 'اللعبة بدأت بالفعل!');

    room.players.push({ id: socket.id, name: playerName, score: 0 });
    socket.join(roomId);

    io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.hostId });
    socket.emit('roomJoined', { roomId, players: room.players, isHost: false });
  });

  // 3. بدء الجولة
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    const randomLetter = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    room.currentLetter = randomLetter;
    room.isGameStarted = true;
    room.answers = {};
    room.stoppedBy = null;

    io.to(roomId).emit('gameStarted', { letter: randomLetter, duration: 60 });
  });

  // 4. إيقاف الجولة (STOP)
  socket.on('stopGame', ({ roomId, answers }) => {
    const room = rooms[roomId];
    if (!room || room.stoppedBy) return;

    room.stoppedBy = socket.id;
    room.answers[socket.id] = answers;

    const player = room.players.find(p => p.id === socket.id);
    io.to(roomId).emit('gameStopped', { stoppedBy: player ? player.name : 'لاعب' });
  });

  // 5. إرسال الإجابات
  socket.on('submitAnswers', ({ roomId, answers }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.answers[socket.id] = answers;

    if (Object.keys(room.answers).length === room.players.length) {
      calculateScoresAndFinish(roomId);
    }
  });

  // 6. تعديل النقاط يدوياً من المضيف
  socket.on('adjustScore', ({ roomId, playerId, newRoundScore }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    const player = room.players.find(p => p.id === playerId);
    if (player && room.lastRoundScores) {
      const parsedScore = parseInt(newRoundScore, 10) || 0;
      const oldRoundScore = room.lastRoundScores[playerId] || 0;
      const diff = parsedScore - oldRoundScore;

      player.score += diff;
      room.lastRoundScores[playerId] = parsedScore;

      io.to(roomId).emit('roundResults', {
        answers: room.answers,
        roundScores: room.lastRoundScores,
        players: room.players
      });
    }
  });

  // 7. التعامل مع انقطاع الاتصال (داخل io.on)
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.isDisconnected = true;
        
        // إعطاء مهلة 30 ثانية قبل حذف اللاعب رسمياً
        setTimeout(() => {
          if (player.isDisconnected) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) room.players.splice(index, 1);

            if (room.players.length === 0) {
              delete rooms[roomId];
            } else {
              if (room.hostId === socket.id) room.hostId = room.players[0].id;
              io.to(roomId).emit('updatePlayers', { 
                players: room.players.filter(p => !p.isDisconnected), 
                hostId: room.hostId 
              });
            }
          }
        }, 30000);
        break;
      }
    }
  });
});

function calculateScoresAndFinish(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const categories = ['human', 'animal', 'plant', 'object', 'country'];
  const roundScores = {};

  room.players.forEach(p => { roundScores[p.id] = 0; });

  categories.forEach(cat => {
    const valuesCount = {};

    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        valuesCount[ans] = (valuesCount[ans] || 0) + 1;
      }
    });

    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        if (valuesCount[ans] === 1) {
          roundScores[p.id] += 10;
        } else {
          roundScores[p.id] += 5;
        }
      }
    });
  });

  room.lastRoundScores = roundScores;
  room.players.forEach(p => {
    p.score += roundScores[p.id];
  });

  room.isGameStarted = false;

  io.to(roomId).emit('roundResults', {
    answers: room.answers,
    roundScores,
    players: room.players
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
