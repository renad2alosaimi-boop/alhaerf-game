const socket = io();

// العناصر
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

// إنشاء غرفة
createRoomBtn.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim();
  if (!playerName) return alert('يرجى إدخال اسمك أولاً!');
  socket.emit('createRoom', { playerName });
});

// انضمام لغرفة
joinRoomBtn.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim();
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!playerName || !roomId) return alert('يرجى إدخال اسمك ورمز الغرفة!');
  socket.emit('joinRoom', { roomId, playerName });
});

// أحداث Socket - إنشاء والانضمام
socket.on('roomCreated', (data) => {
  setupLobby(data.roomId, data.players, true);
});

socket.on('roomJoined', (data) => {
  setupLobby(data.roomId, data.players, false);
});

socket.on('updatePlayers', (data) => {
  isHost = (socket.id === data.hostId);
  updatePlayersUI(data.players);
  if (isHost) startGameBtn.classList.remove('hidden');
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

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

// بدء الجولة
startGameBtn.addEventListener('click', () => {
  socket.emit('startGame', { roomId: currentRoomId });
});

socket.on('gameStarted', ({ letter, duration }) => {
  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  currentLetter.textContent = letter;
  
  // إعادة تعيين الحقول
  document.querySelectorAll('.game-input').forEach(input => {
    input.value = '';
    input.disabled = false;
  });
  stopBtn.disabled = false;

  // العداد التنازلي
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

// الضغط على زر STOP
stopBtn.addEventListener('click', () => {
  stopBtn.disabled = true;
  const answers = getAnswers();
  socket.emit('stopGame', { roomId: currentRoomId, answers });
});

socket.on('gameStopped', ({ stoppedBy }) => {
  clearInterval(timerInterval);
  document.querySelectorAll('.game-input').forEach(input => input.disabled = true);
  stopBtn.disabled = true;
  stoppedByMsg.textContent = `تم إيقاف الجولة بواسطة: ${stoppedBy}`;
  
  // إرسال الإجابات الحالية مباشرة
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
  const answers = getAnswers();
  socket.emit('submitAnswers', { roomId: currentRoomId, answers });
}

// استقبال النتائج
socket.on('roundResults', ({ answers, roundScores, players }) => {
  gameScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  resultsTableBody.innerHTML = players.map(p => {
    const pAns = answers[p.id] || {};
    return `
      <tr>
        <td class="p-2 font-bold">${p.name}</td>
        <td class="p-2 text-slate-300">${pAns.human || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.animal || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.plant || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.object || '-'}</td>
        <td class="p-2 text-slate-300">${pAns.country || '-'}</td>
        <td class="p-2 text-emerald-400 font-bold">+${roundScores[p.id] || 0}</td>
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

nextRoundBtn.addEventListener('click', () => {
  socket.emit('startGame', { roomId: currentRoomId });
});
