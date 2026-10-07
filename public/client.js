const socket = io();

const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const resultsScreen = document.getElementById('resultsScreen');

const playerNameInput = document.getElementById('playerNameInput');
const roomIdInput = document.getElementById('roomIdInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const displayRoomId = document.getElementById('displayRoomId');
const playersList = document.getElementById('playersList');
const playerCount = document.getElementById('playerCount');
const startGameBtn = document.getElementById('startGameBtn');

const currentLetter = document.getElementById('currentLetter');
const timerDisplay = document.getElementById('timer');
const stopBtn = document.getElementById('stopBtn');

const stoppedByMsg = document.getElementById('stoppedByMsg');
const resultsTableBody = document.getElementById('resultsTableBody');
const nextRoundBtn = document.getElementById('nextRoundBtn');

let currentRoomId = '';
let isHost = false;
let timerInterval = null;

createRoomBtn.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim();
  if (!playerName) return alert('يرجى إدخال اسمك!');
  socket.emit('createRoom', { playerName });
});

joinRoomBtn.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim();
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!playerName || !roomId) return alert('يرجى إدخال البيانات!');
  socket.emit('joinRoom', { roomId, playerName });
});

socket.on('roomCreated', (data) => setupLobby(data.roomId, data.players, true));
socket.on('roomJoined', (data) => setupLobby(data.roomId, data.players, false));

socket.on('updatePlayers', (data) => {
  isHost = (socket.id === data.hostId);
  updatePlayersUI(data.players);
  if (isHost) startGameBtn.classList.remove('hidden');
});

socket.on('errorMsg', (msg) => alert(msg));

function setupLobby(roomId, players, hostFlag) {
  currentRoomId = roomId;
  isHost = hostFlag;
  displayRoomId.textContent = roomId;
  authScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  updatePlayersUI(players);
  if (isHost) startGameBtn.classList.remove('hidden');
}

function updatePlayersUI(players) {
  playerCount.textContent = `${players.length} لاعبين`;
  playersList.innerHTML = players.map(p => `
    <li class="bg-slate-700 p-3 rounded-xl flex justify-between items-center">
      <span class="font-bold">${p.name} ${p.id === socket.id ? '(أنت)' : ''}</span>
      <span class="text-amber-400 text-xs font-bold">${p.score} نقطة</span>
    </li>
  `).join('');
}

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame', { roomId: currentRoomId });
});

socket.on('gameStarted', ({ letter, duration }) => {
  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  currentLetter.textContent = letter;
  document.querySelectorAll('.game-input').forEach(input => {
    input.value = '';
    input.disabled = false;
  });
  stopBtn.disabled = false;

  let timeLeft = duration;
  timerDisplay.textContent = timeLeft;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitMyAnswers();
    }
  }, 1000);
});

stopBtn.addEventListener('click', () => {
  stopBtn.disabled = true;
  socket.emit('stopGame', { roomId: currentRoomId, answers: getAnswers() });
});

socket.on('gameStopped', ({ stoppedBy }) => {
  clearInterval(timerInterval);
  document.querySelectorAll('.game-input').forEach(input => input.disabled = true);
  stopBtn.disabled = true;
  stoppedByMsg.textContent = `تم إيقاف الجولة بواسطة: ${stoppedBy}`;
  submitMyAnswers();
});

function getAnswers() {
  return {
    human: document.getElementById('ans_human').value,
    animal: document.getElementById('ans_animal').value,
    plant: document.getElementById('ans_plant').value,
    object: document.getElementById('ans_object').value,
    country: document.getElementById('ans_country').value
  };
}

function submitMyAnswers() {
  socket.emit('submitAnswers', { roomId: currentRoomId, answers: getAnswers() });
}

// عرض النتائج وإتاحة التعديل
socket.on('roundResults', ({ answers, roundScores, players }) => {
  gameScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  resultsTableBody.innerHTML = players.map(p => {
    const pAns = answers[p.id] || {};
    const currentScore = roundScores[p.id] || 0;

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
            <input type="number" value="${currentScore}" data-playerid="${p.id}"
                   class="score-edit-input w-16 bg-slate-700 border border-slate-500 rounded px-1 text-center text-white">
          ` : `+${currentScore}`}
        </td>
        <td class="p-2 text-amber-400 font-bold">${p.score}</td>
      </tr>
    `;
  }).join('');

  // إضافة المستمع لتغيير الأرقام
  if (isHost) {
    document.querySelectorAll('.score-edit-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const playerId = e.target.getAttribute('data-playerid');
        const newScore = parseInt(e.target.value, 10);
        socket.emit('adjustScore', {
          roomId: currentRoomId,
          playerId: playerId,
          newRoundScore: newScore
        });
      });
    });
    nextRoundBtn.classList.remove('hidden');
  } else {
    nextRoundBtn.classList.add('hidden');
  }
});

nextRoundBtn.addEventListener('click', () => {
  socket.emit('startGame', { roomId: currentRoomId });
});
