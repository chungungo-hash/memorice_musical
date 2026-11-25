// ==========================================
// ESTADO GLOBAL DEL JUEGO
// ==========================================
const state = {
  mode: 'solo', // 'solo' | 'team'
  participants: [
    { name: 'Jugador 1', members: [''] },
    { name: 'Jugador 2', members: [''] }
  ],
  tracks: Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    title: '',
    url: null,
    startSec: 0,
    isDemo: false
  })),
  clipDuration: 6,
  cards: [],
  flippedCards: [],
  lockBoard: false,
  currentTurnIndex: 0,
  pairsFound: 0,
  attempts: 0,
  secondsElapsed: 0,
  timerInterval: null
};

// Reproductor único y Web Audio API (para modo demo y efectos)
const audioPlayer = new Audio();
let clipTimeout = null;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// ==========================================
// REFERENCIAS DOM
// ==========================================
const screens = {
  setup: document.getElementById('screen-setup'),
  music: document.getElementById('screen-music'),
  game: document.getElementById('screen-game'),
  results: document.getElementById('screen-results')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ==========================================
// PANTALLA 1: CONFIGURACIÓN DE PARTICIPANTES
// ==========================================
const participantsContainer = document.getElementById('participants-container');
const btnAddParticipant = document.getElementById('btn-add-participant');

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;

    // Reiniciar lista base según modalidad
    if (state.mode === 'solo') {
      state.participants = [
        { name: 'Jugador 1', members: [''] },
        { name: 'Jugador 2', members: [''] }
      ];
    } else {
      state.participants = [
        { name: 'Equipo 1', members: ['Integrante 1', 'Integrante 2'] },
        { name: 'Equipo 2', members: ['Integrante 1', 'Integrante 2'] }
      ];
    }
    renderParticipants();
  });
});

function renderParticipants() {
  participantsContainer.innerHTML = '';
  state.participants.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'participant-item';

    const label = state.mode === 'solo' ? `Participante ${idx + 1}` : `Equipo ${idx + 1}`;
    const removeBtn = state.participants.length > 1
      ? `<button type="button" class="btn danger-text" onclick="removeParticipant(${idx})">✕ Quitar</button>`
      : '';

    if (state.mode === 'solo') {
      div.innerHTML = `
        <div class="participant-header">
          <span>${label}</span>
          ${removeBtn}
        </div>
        <input type="text" value="${p.name}" placeholder="Nombre del jugador"
               oninput="updateParticipantName(${idx}, this.value)" />
      `;
    } else {
      div.innerHTML = `
        <div class="participant-header">
          <span>${label}</span>
          ${removeBtn}
        </div>
        <div class="inputs-grid">
          <input type="text" value="${p.name}" placeholder="Nombre del equipo"
                 oninput="updateParticipantName(${idx}, this.value)" />
          <input type="text" value="${p.members[0]}" placeholder="Integrante 1"
                 oninput="updateMemberName(${idx}, 0, this.value)" />
          <input type="text" value="${p.members[1]}" placeholder="Integrante 2"
                 oninput="updateMemberName(${idx}, 1, this.value)" />
        </div>
      `;
    }
    participantsContainer.appendChild(div);
  });

  btnAddParticipant.style.display = state.participants.length >= 4 ? 'none' : 'inline-flex';
}

window.updateParticipantName = (idx, val) => {
  state.participants[idx].name = val;
};

window.updateMemberName = (idx, mIdx, val) => {
  state.participants[idx].members[mIdx] = val;
};

window.removeParticipant = (idx) => {
  state.participants.splice(idx, 1);
  renderParticipants();
};

btnAddParticipant.addEventListener('click', () => {
  if (state.participants.length >= 4) return;
  const num = state.participants.length + 1;
  if (state.mode === 'solo') {
    state.participants.push({ name: `Jugador ${num}`, members: [''] });
  } else {
    state.participants.push({
      name: `Equipo ${num}`,
      members: ['Integrante 1', 'Integrante 2']
    });
  }
  renderParticipants();
});

document.getElementById('btn-to-music').addEventListener('click', () => {
  // Limpiar nombres vacíos con valores por defecto
  state.participants.forEach((p, i) => {
    if (!p.name.trim()) {
      p.name = state.mode === 'solo' ? `Jugador ${i + 1}` : `Equipo ${i + 1}`;
    }
    if (state.mode === 'team') {
      p.members[0] = p.members[0].trim() || 'Integrante 1';
      p.members[1] = p.members[1].trim() || 'Integrante 2';
    }
  });
  renderTracksAdmin();
  showScreen('music');
});

// ==========================================
// PANTALLA 2: PANEL DE ADMINISTRACIÓN DE MÚSICA
// ==========================================
const tracksList = document.getElementById('tracks-list');
const musicError = document.getElementById('music-error');

function renderTracksAdmin() {
  tracksList.innerHTML = '';
  state.tracks.forEach((track, idx) => {
    const isReady = Boolean(track.url || track.isDemo);
    const row = document.createElement('div');
    row.className = `track-row ${isReady ? 'ready' : ''}`;

    row.innerHTML = `
      <div class="track-num">#${idx + 1}</div>
      <div class="track-info">
        <span class="track-name">${track.title || 'Sin canción asignada'}</span>
        <label class="btn small secondary" style="width: fit-content;">
          📁 Elegir MP3
          <input type="file" accept="audio/*" hidden onchange="handleSingleTrackUpload(${idx}, this)" />
        </label>
      </div>
      <div class="track-start-wrap">
        <span>Inicio (s):</span>
        <input type="number" min="0" max="600" value="${track.startSec}"
               onchange="updateTrackStart(${idx}, this.value)" />
      </div>
      <button type="button" class="btn small secondary" ${!isReady ? 'disabled' : ''}
              onclick="previewTrack(${idx})">
        ▶ Probar
      </button>
    `;
    tracksList.appendChild(row);
  });
}

window.handleSingleTrackUpload = (idx, input) => {
  const file = input.files[0];
  if (!file) return;
  if (state.tracks[idx].url) URL.revokeObjectURL(state.tracks[idx].url);

  state.tracks[idx] = {
    id: idx + 1,
    title: file.name.replace(/\.[^/.]+$/, ''),
    url: URL.createObjectURL(file),
    startSec: state.tracks[idx].startSec || 0,
    isDemo: false
  };
  musicError.textContent = '';
  renderTracksAdmin();
};

window.updateTrackStart = (idx, val) => {
  state.tracks[idx].startSec = Math.max(0, parseInt(val, 10) || 0);
};

document.getElementById('bulk-audio-input').addEventListener('change', (e) => {
  const files = Array.from(e.target.files).slice(0, 10);
  files.forEach((file, i) => {
    if (state.tracks[i].url) URL.revokeObjectURL(state.tracks[i].url);
    state.tracks[i] = {
      id: i + 1,
      title: file.name.replace(/\.[^/.]+$/, ''),
      url: URL.createObjectURL(file),
      startSec: 0,
      isDemo: false
    };
  });
  musicError.textContent = '';
  renderTracksAdmin();
});

// Melodías sintetizadas para probar el juego sin tener MP3 a mano
const DEMO_MELODIES = [
  { title: 'Demo 1 - Escala Ascendente', notes: [261.6, 293.7, 329.6, 349.2, 392.0] },
  { title: 'Demo 2 - Arpegio Mayor', notes: [261.6, 329.6, 392.0, 523.3, 392.0] },
  { title: 'Demo 3 - Suspenso', notes: [220.0, 233.1, 220.0, 246.9, 220.0] },
  { title: 'Demo 4 - Fanfarria', notes: [392.0, 392.0, 523.3, 659.3, 784.0] },
  { title: 'Demo 5 - Nostalgia', notes: [440.0, 392.0, 349.2, 329.6, 293.7] },
  { title: 'Demo 6 - Salto Octava', notes: [261.6, 523.3, 293.7, 587.3, 329.6] },
  { title: 'Demo 7 - Blues Riff', notes: [220.0, 261.6, 293.7, 311.1, 329.6] },
  { title: 'Demo 8 - Campanas', notes: [659.3, 523.3, 587.3, 392.0, 523.3] },
  { title: 'Demo 9 - Bajo Profundo', notes: [130.8, 164.8, 196.0, 164.8, 130.8] },
  { title: 'Demo 10 - Galaxia', notes: [523.3, 659.3, 784.0, 1046.5, 784.0] }
];

document.getElementById('btn-load-demo').addEventListener('click', () => {
  state.tracks = DEMO_MELODIES.map((m, i) => ({
    id: i + 1,
    title: m.title,
    url: null,
    startSec: 0,
    isDemo: true,
    notes: m.notes
  }));
  musicError.textContent = '';
  renderTracksAdmin();
});

function playTrackSnippet(track, durationSec, onEndedCallback) {
  stopCurrentAudio();

  if (track.isDemo) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    track.notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.35);
      gain.gain.setValueAtTime(0.18, now + idx * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.35);
      osc.stop(now + (idx + 1) * 0.35);
    });
    clipTimeout = setTimeout(() => {
      if (onEndedCallback) onEndedCallback();
    }, 1800);
    return;
  }

  audioPlayer.src = track.url;
  audioPlayer.currentTime = track.startSec || 0;
  audioPlayer.play().catch(() => {});

  clipTimeout = setTimeout(() => {
    stopCurrentAudio();
    if (onEndedCallback) onEndedCallback();
  }, durationSec * 1000);
}

function stopCurrentAudio() {
  clearTimeout(clipTimeout);
  audioPlayer.pause();
  document.querySelectorAll('.memory-card.playing').forEach(c => c.classList.remove('playing'));
}

window.previewTrack = (idx) => {
  const duration = parseInt(document.getElementById('clip-duration').value, 10) || 6;
  playTrackSnippet(state.tracks[idx], duration);
};

document.getElementById('btn-back-setup').addEventListener('click', () => {
  stopCurrentAudio();
  showScreen('setup');
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  const allReady = state.tracks.every(t => t.url || t.isDemo);
  if (!allReady) {
    musicError.textContent = '⚠️ Debes cargar las 10 canciones (o usar las 10 Melodías Demo) para comenzar.';
    return;
  }
  state.clipDuration = Math.max(2, Math.min(30, parseInt(document.getElementById('clip-duration').value, 10) || 6));
  stopCurrentAudio();
  initGame();
});

// ==========================================
// PANTALLA 3: LÓGICA DEL JUEGO Y TABLERO
// ==========================================
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function playFeedbackSound(isMatch) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const now = ctx.currentTime;

  if (isMatch) {
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.12);
    osc.frequency.setValueAtTime(783.99, now + 0.24);
  } else {
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(185, now + 0.15);
  }

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

function initGame() {
  // Reiniciar puntajes y contadores
  state.participants.forEach(p => { p.score = 0; });
  state.currentTurnIndex = Math.floor(Math.random() * state.participants.length); // Sorteo inicial
  state.pairsFound = 0;
  state.attempts = 0;
  state.secondsElapsed = 0;
  state.flippedCards = [];
  state.lockBoard = false;

  // Duplicar 10 pistas -> 20 cartas y barajar
  const deck = [];
  state.tracks.forEach(track => {
    deck.push({ trackId: track.id, track, matched: false });
    deck.push({ trackId: track.id, track, matched: false });
  });
  state.cards = shuffleArray(deck);

  updateTopStats();
  renderScoreboard();
  renderBoard();
  startTimer();
  showScreen('game');
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.secondsElapsed++;
    document.getElementById('game-timer').textContent = formatTime(state.secondsElapsed);
  }, 1000);
}

function formatTime(totalSec) {
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function updateTopStats() {
  document.getElementById('pairs-found').textContent = `${state.pairsFound} / 10`;
  document.getElementById('attempts-count').textContent = state.attempts;
  document.getElementById('game-timer').textContent = formatTime(state.secondsElapsed);
  document.getElementById('current-turn-name').textContent = state.participants[state.currentTurnIndex].name;
}

function renderScoreboard() {
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';

  state.participants.forEach((p, idx) => {
    const isTurn = idx === state.currentTurnIndex;
    const subtext = state.mode === 'team' ? `${p.members[0]} y ${p.members[1]}` : 'Individual';
    const card = document.createElement('div');
    card.className = `score-card ${isTurn ? 'active-turn' : ''}`;
    card.innerHTML = `
      <div class="score-info">
        <h4>${p.name}</h4>
        <small>${subtext}</small>
      </div>
      <div class="score-points">${p.score}</div>
    `;
    scoreboard.appendChild(card);
  });
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  state.cards.forEach((cardData, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memory-card';
    btn.dataset.index = idx;
    btn.innerHTML = `
      <span class="card-number">${idx + 1}</span>
      <span class="card-icon">🎵</span>
      <span class="card-label">Escuchar</span>
    `;
    btn.addEventListener('click', () => handleCardClick(idx, btn));
    board.appendChild(btn);
  });
}

function handleCardClick(index, cardElement) {
  if (state.lockBoard) return;
  const cardData = state.cards[index];
  if (cardData.matched) return;

  // Si hace clic en la misma carta ya abierta en este turno, solo vuelve a reproducir su audio
  if (state.flippedCards.length === 1 && state.flippedCards[0].index === index) {
    cardElement.classList.add('playing');
    playTrackSnippet(cardData.track, state.clipDuration, () => {
      cardElement.classList.remove('playing');
    });
    return;
  }

  // Marcar carta seleccionada y reproducir extracto
  cardElement.classList.add('selected', 'playing');
  cardElement.querySelector('.card-icon').textContent = '🔊';
  cardElement.querySelector('.card-label').textContent = 'Sonando...';

  playTrackSnippet(cardData.track, state.clipDuration, () => {
    cardElement.classList.remove('playing');
    if (!cardData.matched && cardElement.classList.contains('selected')) {
      cardElement.querySelector('.card-icon').textContent = '🎧';
      cardElement.querySelector('.card-label').textContent = 'Seleccionada';
    }
  });

  state.flippedCards.push({ index, element: cardElement, data: cardData });

  if (state.flippedCards.length === 2) {
    state.attempts++;
    updateTopStats();
    checkForMatch();
  }
}

function checkForMatch() {
  state.lockBoard = true;
  const [first, second] = state.flippedCards;
  const isMatch = first.data.trackId === second.data.trackId;

  // Dar 1.5s para escuchar el inicio de la segunda carta antes de resolver
  setTimeout(() => {
    stopCurrentAudio();

    if (isMatch) {
      playFeedbackSound(true);
      first.data.matched = true;
      second.data.matched = true;

      [first.element, second.element].forEach(el => {
        el.classList.remove('selected', 'playing');
        el.classList.add('matched');
        el.disabled = true;
        el.querySelector('.card-icon').textContent = '✅';
        el.querySelector('.card-label').textContent = first.data.track.title;
      });

      // Sumar punto y CONSERVAR turno
      state.participants[state.currentTurnIndex].score++;
      state.pairsFound++;
      state.flippedCards = [];
      state.lockBoard = false;

      updateTopStats();
      renderScoreboard();

      if (state.pairsFound === 10) {
        finishGame();
      }
    } else {
      playFeedbackSound(false);
      [first.element, second.element].forEach(el => {
        el.classList.remove('selected', 'playing');
        el.querySelector('.card-icon').textContent = '🎵';
        el.querySelector('.card-label').textContent = 'Escuchar';
      });

      // Pasar turno al siguiente participante
      state.currentTurnIndex = (state.currentTurnIndex + 1) % state.participants.length;
      state.flippedCards = [];
      state.lockBoard = false;

      updateTopStats();
      renderScoreboard();
    }
  }, 1600);
}

document.getElementById('btn-stop-audio').addEventListener('click', stopCurrentAudio);

document.getElementById('btn-abort-game').addEventListener('click', () => {
  clearInterval(state.timerInterval);
  stopCurrentAudio();
  showScreen('setup');
});

// ==========================================
// PANTALLA 4: RESULTADOS Y REVANCHA
// ==========================================
function finishGame() {
  clearInterval(state.timerInterval);
  stopCurrentAudio();

  const sorted = [...state.participants].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const winners = sorted.filter(p => p.score === topScore);

  const winnerSubtitle = document.getElementById('winner-subtitle');
  if (winners.length > 1) {
    winnerSubtitle.textContent = `🤝 ¡Empate entre ${winners.map(w => w.name).join(' y ')} con ${topScore} parejas!`;
  } else {
    winnerSubtitle.textContent = `🎉 ¡Ganador: ${winners[0].name} con ${topScore} parejas!`;
  }

  document.getElementById('final-time').textContent = formatTime(state.secondsElapsed);
  document.getElementById('final-attempts').textContent = state.attempts;

  const rankingList = document.getElementById('ranking-list');
  rankingList.innerHTML = '';
  sorted.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = `ranking-item ${idx === 0 ? 'first' : ''}`;
    const membersText = state.mode === 'team' ? ` (${p.members[0]} y ${p.members[1]})` : '';
    item.innerHTML = `
      <span><strong>#${idx + 1} ${p.name}</strong>${membersText}</span>
      <strong>${p.score} pts</strong>
    `;
    rankingList.appendChild(item);
  });

  showScreen('results');
}

document.getElementById('btn-rematch').addEventListener('click', () => {
  initGame();
});

document.getElementById('btn-new-setup').addEventListener('click', () => {
  showScreen('setup');
});

// Inicializar vista
renderParticipants();