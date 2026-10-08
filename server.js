// استبدلي معالج disconnect في server.js بهذا الكود:
socket.on('disconnect', () => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      // إعطاء مهلة 30 ثانية لإعادة الاتصال قبل الحذف النهائي
      player.isDisconnected = true;
      
      setTimeout(() => {
        if (player.isDisconnected) {
          const index = room.players.findIndex(p => p.id === socket.id);
          if (index !== -1) room.players.splice(index, 1);

          if (room.players.length === 0) {
            delete rooms[roomId];
          } else {
            if (room.hostId === socket.id) room.hostId = room.players[0].id;
            io.to(roomId).emit('updatePlayers', { players: room.players.filter(p => !p.isDisconnected), hostId: room.hostId });
          }
        }
      }, 30000); // 30 ثانية
      break;
    }
  }
});
