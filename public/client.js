// تحديث استقبال النتائج في client.js
socket.on('roundResults', ({ answers, roundScores, players }) => {
  gameScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  resultsTableBody.innerHTML = players.map(p => {
    const pAns = answers[p.id] || {};
    const currentRoundScore = roundScores[p.id] || 0;

    return `
      <tr>
        <td class="p-2 font-bold">${p.name} ${p.id === socket.id ? '(أنت)' : ''}</td>
        <td class="p-2 text-slate-300">${pAns.human || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.animal || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.plant || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.object || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.country || '-'}</td>
        <td class="p-2 text-emerald-400 font-bold">
          ${isHost ? `
            <input type="number" value="${currentRoundScore}" 
                   onchange="updatePlayerScore('${p.id}', this.value)"
                   class="w-16 bg-slate-700 border border-slate-500 rounded px-1 text-center text-white">
          ` : `+${currentRoundScore}`}
        </td>
        <td class="p-2 text-amber-400 font-bold">${p.score}</td>
      </tr>
    `;
  }).join('');

  if (isHost) {
    nextRoundBtn.classList.remove('hidden');
  } else {
    nextRoundBtn.classList.add('hidden');
  }
});

// دالة إرسال التعديل اليدوي للنقاط (تُنفّذ عند تغيير الرقم من قبل المضيف)
function updatePlayerScore(playerId, newScore) {
  const parsedScore = parseInt(newScore, 10);
  if (!isNaN(parsedScore)) {
    socket.emit('adjustScore', {
      roomId: currentRoomId,
      playerId: playerId,
      newRoundScore: parsedScore
    });
  }
}
