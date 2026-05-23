const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');
let W, H;
let audioContext = null;
let audioSource = null;
let analyzer = null;
let dataArray = null;
let bufferLength = 0;

// Nodes audio
let lowPassFilter = null;
let isLofiActive = false;
let isRainActive = false;
let isPlaying = false;

// Partikel
let particles = [];
const MAX_PARTICLES = 200;
let animationId = null;

// Noise generator
let rainNoiseNode = null;
let rainGainNode = null;
let rainFilter = null;

// Elemen UI
const fileInput = document.getElementById('fileInput');
const playBtn = document.getElementById('playBtn');
const rainBtn = document.getElementById('rainBtn');
const lofiBtn = document.getElementById('lofiBtn');
const songTitle = document.getElementById('songTitle');
const audioElement = new Audio();
audioElement.loop = false;

function resizeCanvas() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initAudioContext() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Analyzer
  analyzer = audioContext.createAnalyser();
  analyzer.fftSize = 512;
  bufferLength = analyzer.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  
  // Low-pass filter untuk Lo-Fi
  lowPassFilter = audioContext.createBiquadFilter();
  lowPassFilter.type = 'lowpass';
  lowPassFilter.frequency.value = 1200;
  lowPassFilter.Q.value = 1;
  audioSource = audioContext.createMediaElementSource(audioElement);
  audioSource.connect(analyzer);
  analyzer.connect(audioContext.destination);
}

class Particle {
  constructor(x, y, mode = 'default') {
    this.baseX = x;
    this.baseY = y;
    this.x = x;
    this.y = y;
    this.size = Math.random() * 3 + 1.5;
    this.speedY = Math.random() * 1.5 + 0.5;
    this.opacity = Math.random() * 0.7 + 0.3;
    this.hue = Math.random() * 60 + 280;
    this.mode = mode;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = Math.random() * 0.02 + 0.005;
  }
  
  update(frequencyValue, index, totalParticles) {
    if (this.mode === 'rain') {
      this.y += this.speedY * 2.5;
      this.y += (frequencyValue / 255) * 1.5;
      this.x += Math.sin(this.wobble) * 0.3;
      this.wobble += this.wobbleSpeed;
      
      if (this.y > H + 10) {
        this.y = -10;
        this.x = Math.random() * W;
      }
    } else {
      const targetY = this.baseY - (frequencyValue / 255) * 180;
      const targetX = this.baseX + Math.sin(this.wobble) * 25;
      this.y += (targetY - this.y) * 0.08;
      this.x += (targetX - this.x) * 0.08;
      this.wobble += this.wobbleSpeed;
      this.opacity = 0.25 + (frequencyValue / 255) * 0.75;
    }
  }
  
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
    if (this.mode === 'rain') {
      gradient.addColorStop(0, 'rgba(130, 200, 255, 0.9)');
      gradient.addColorStop(1, 'rgba(70, 150, 220, 0)');
    } else {
      gradient.addColorStop(0, `hsla(${this.hue}, 90%, 65%, 1)`);
      gradient.addColorStop(1, `hsla(${this.hue}, 80%, 40%, 0)`);
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function createParticles(mode = 'default') {
  particles = [];
  if (mode === 'rain') {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = new Particle(
        Math.random() * W,
        Math.random() * H,
        'rain'
      );
      particles.push(p);
    }
  } else {
    const cols = 16;
    const rows = Math.ceil(MAX_PARTICLES / cols);
    const spacingX = W / (cols + 1);
    const spacingY = H / (rows + 1);
    let count = 0;
    for (let row = 1; row <= rows && count < MAX_PARTICLES; row++) {
      for (let col = 1; col <= cols && count < MAX_PARTICLES; col++) {
        const x = spacingX * col + (Math.random() - 0.5) * 40;
        const y = spacingY * row + (Math.random() - 0.5) * 40;
        particles.push(new Particle(x, y, 'default'));
        count++;
      }
    }
  }
}

createParticles('default');

function startRainSound() {
  if (!audioContext) initAudioContext();
  if (rainNoiseNode) return;
  
  rainNoiseNode = audioContext.createScriptProcessor(4096, 1, 1);
  rainGainNode = audioContext.createGain();
  rainGainNode.gain.value = 0.2;
  
  rainNoiseNode.onaudioprocess = function(e) {
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) {
      output[i] = Math.random() * 2 - 1;
      if (i > 0) {
        output[i] = (output[i] + output[i - 1]) / 2;
      }
    }
  };
  
  rainFilter = audioContext.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 800;
  rainFilter.Q.value = 0.5;
  
  rainNoiseNode.connect(rainFilter);
  rainFilter.connect(rainGainNode);
  rainGainNode.connect(audioContext.destination);
}

function stopRainSound() {
  if (rainNoiseNode) {
    rainNoiseNode.disconnect();
    if (rainFilter) rainFilter.disconnect();
    if (rainGainNode) rainGainNode.disconnect();
    rainNoiseNode = null;
    rainGainNode = null;
    rainFilter = null;
  }
}

function togglePlay() {
  if (!audioContext) initAudioContext();
  if (!audioElement.src || audioElement.src === window.location.href) {
    alert('Upload Your Music, Bro');
    return;
  }
  
  if (isPlaying) {
    audioElement.pause();
    playBtn.textContent = '▶️ Play';
  } else {
    audioContext.resume();
    audioElement.play();
    playBtn.textContent = '⏸️ Pause';
  }
  isPlaying = !isPlaying;
}

function toggleRain() {
  if (!audioContext) initAudioContext();
  isRainActive = !isRainActive;
  
  if (isRainActive) {
    rainBtn.classList.add('active');
    startRainSound();
    createParticles('rain');
  } else {
    rainBtn.classList.remove('active');
    stopRainSound();
    createParticles('default');
  }
}

function toggleLofi() {
  if (!audioContext) initAudioContext();
  isLofiActive = !isLofiActive;
  
  if (isLofiActive) {
    lofiBtn.classList.add('lofi-active');
    lofiBtn.textContent = 'Lo-Fi: ON';
    audioSource.disconnect();
    audioSource.connect(lowPassFilter);
    lowPassFilter.connect(analyzer);
    audioElement.playbackRate = 0.85;
  } else {
    lofiBtn.classList.remove('lofi-active');
    lofiBtn.textContent = 'Lo-Fi';
    audioSource.disconnect();
    lowPassFilter.disconnect();
    audioSource.connect(analyzer);
    audioElement.playbackRate = 1.0;
  }
}

fileInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const url = URL.createObjectURL(file);
  audioElement.src = url;
  audioElement.load();
  
  const name = file.name.replace(/\.[^/.]+$/, '');
  songTitle.textContent = '🎵 ' + (name.length > 35 ? name.slice(0, 35) + '...' : name);
  
  if (isPlaying) {
    audioElement.pause();
    isPlaying = false;
    playBtn.textContent = '▶️ Play';
  }
  
  initAudioContext();
  
  setTimeout(() => {
    togglePlay();
  }, 300);
});

function animate() {
  animationId = requestAnimationFrame(animate);
  ctx.clearRect(0, 0, W, H);
  
  if (analyzer && dataArray && isPlaying) {
    analyzer.getByteFrequencyData(dataArray);
  } else {
    if (dataArray) dataArray.fill(0);
  }
  
  particles.forEach((p, i) => {
    const freqIndex = i % bufferLength;
    const freqValue = dataArray ? dataArray[freqIndex] : 0;
    p.update(freqValue, i, particles.length);
    p.draw(ctx);
  });
  
  const vignetteGradient = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  vignetteGradient.addColorStop(0, 'rgba(10,10,15,0)');
  vignetteGradient.addColorStop(1, 'rgba(10,10,15,0.45)');
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, W, H);
}

document.addEventListener('keydown', function (e) {

  if (document.activeElement.tagName === 'INPUT') return; 

  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'r':
      toggleRain();
      break;
    case 'l':
      toggleLofi();
      break;
    case 'u':
      fileInput.click();
      break;
  }
});

animate();

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  stopRainSound();
  if (audioContext) audioContext.close();
});
