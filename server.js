const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// قائمة الأحرف العربية المتاحة للعب
const ARABIC_LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];

// تخزين بيانات الغرف في الذاكرة
const rooms = {};

io.on('connection', (socket) => {
  console.log('لاعب متصل:', socket.id);

  // 1. إنشاء غرفة جديدة
  socket.on('createRoom', ({ playerName }) => {
    const roomId = 'ROOM-' + Math.floor(1000 + Math.random() * 9000);
    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      currentLetter: '',
      isGameStarted: false,
      answers: {},
      stoppedBy: null
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players, isHost: true });
  });

  // 2. الانضمام لغرفة موجودة
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit('errorMsg', 'رمز الغرفة غير صحيح!');
    }
    if (room.isGameStarted) {
      return socket.emit('errorMsg', 'اللعبة بدأت بالفعل في هذه الغرفة!');
    }

    room.players.push({ id: socket.id, name: playerName, score: 0 });
    socket.join(roomId);

    // إعلام الجميع بالقائمة الحديثة
    io.to(roomId).emit('updatePlayers', { 
      players: room.players, 
      hostId: room.hostId 
    });
    socket.emit('roomJoined', { roomId, players: room.players, isHost: false });
  });

  // 3. بدء الجولة (للمضيف فقط)
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    // اختيار حرف عشوائي
    const randomLetter = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    room.currentLetter = randomLetter;
    room.isGameStarted = true;
    room.answers = {};
    room.stoppedBy = null;

    io.to(roomId).emit('gameStarted', { 
      letter: randomLetter, 
      duration: 60 
    });
  });

  // 4. الضغط على زر بس / STOP
  socket.on('stopGame', ({ roomId, answers }) => {
    const room = rooms[roomId];
    if (!room || room.stoppedBy) return; // منع الضغط المزدوج

    room.stoppedBy = socket.id;
    room.answers[socket.id] = answers;

    const player = room.players.find(p => p.id === socket.id);
    const stoppedByName = player ? player.name : 'لاعب';

    // إعلام جميع اللاعبين بإيقاف القلم فوراً مع اسم القاطع
    io.to(roomId).emit('gameStopped', { stoppedBy: stoppedByName });
  });

  // 5. إرسال الإجابات عند انتهاء الوقت أو عند الإيقاف
  socket.on('submitAnswers', ({ roomId, answers }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.answers[socket.id] = answers;

    // التأكد من استلام إجابات جميع اللاعبين
    if (Object.keys(room.answers).length === room.players.length) {
      calculateScoresAndFinish(roomId);
    }
  });

  // 6. التعامل مع قطع الاتصال
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id; // نقل الضيافة لأول لاعب متواجد
          }
          io.to(roomId).emit('updatePlayers', { players: room.players, hostId: room.hostId });
        }
        break;
      }
    }
  });
});

// دالة حساب النقاط والنتائج
function calculateScoresAndFinish(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const categories = ['human', 'animal', 'plant', 'object', 'country'];
  const roundScores = {}; // نقاط الجولة الحالية

  room.players.forEach(p => { roundScores[p.id] = 0; });

  // حساب النقاط لكل فئة على حدة
  categories.forEach(cat => {
    const valuesCount = {};

    // تجميع الكلمات وتنظيفها
    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        valuesCount[ans] = (valuesCount[ans] || 0) + 1;
      }
    });

    // احتساب النقاط
    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        if (valuesCount[ans] === 1) {
          roundScores[p.id] += 10; // كلمة فريدة وصحيحة
        } else {
          roundScores[p.id] += 5;  // كلمة مكررة
        }
      }
    });
  });

  // تحديث المجموع الكلي
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
server.listen(PORT, () => {
  console.log(`السيرفر يعمل الآن على Port ${PORT}`);
});