// استبدل دالة calculateScoresAndFinish بهذه النسخة المحدثة
function calculateScoresAndFinish(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const categories = ['human', 'animal', 'plant', 'object', 'country'];
  const roundScores = {}; 

  room.players.forEach(p => { roundScores[p.id] = 0; });

  categories.forEach(cat => {
    const valuesCount = {};

    // تجميع الكلمات وتنظيفها
    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        valuesCount[ans] = (valuesCount[ans] || 0) + 1;
      }
    });

    // احتساب النقاط: 10 للفريدة و 5 للمكررة و 0 للفارغة
    room.players.forEach(p => {
      const ans = (room.answers[p.id] && room.answers[p.id][cat]) ? room.answers[p.id][cat].trim() : '';
      if (ans !== '') {
        if (valuesCount[ans] === 1) {
          roundScores[p.id] += 10; // 10 نقاط للكلمة الفريدة
        } else {
          roundScores[p.id] += 5;  // 5 نقاط للكلمة المكررة (نصف النقاط)
        }
      }
    });
  });

  // حفظ نقاط الجولة الحالية وتحديث المجموع
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

// أضف هذا المعالج داخل io.on('connection') لتسميح للمضيف بتعديل النقاط
socket.on('adjustScore', ({ roomId, playerId, newRoundScore }) => {
  const room = rooms[roomId];
  if (!room || room.hostId !== socket.id) return; // للمضيف فقط

  const player = room.players.find(p => p.id === playerId);
  if (player && room.lastRoundScores) {
    const oldRoundScore = room.lastRoundScores[playerId] || 0;
    const diff = newRoundScore - oldRoundScore;

    // تعديل المجموع ونقاط الجولة
    player.score += diff;
    room.lastRoundScores[playerId] = newRoundScore;

    // إرسال النتائج المحدثة للجميع
    io.to(roomId).emit('roundResults', {
      answers: room.answers,
      roundScores: room.lastRoundScores,
      players: room.players
    });
  }
});
