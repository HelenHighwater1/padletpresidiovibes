/* ============================================================
   The Presidio — Padlet
   The video is the interface.
   ============================================================ */

const LAT = 37.7986;
const LNG = -122.4653;
const TRANSIT_API_KEY = '';
const TIDE_STATION = '9414290';
const REFRESH_INTERVAL = 10 * 60 * 1000;

const LOFI_STREAM_URL = 'https://ice2.somafm.com/groovesalad-128-mp3';
const LOFI_STREAM_FALLBACK = 'https://ice4.somafm.com/groovesalad-128-mp3';

// ---- State ----

let appData = {
  weather: null,
  aqi: null,
  nws: null,
  sun: null,
  tides: null,
  surf: null,
  quake: null,
  shuttle: null
};

let activeHeroRegion = null;
let heroRevertTimeout = null;
const HERO_REVERT_MS = 20 * 1000;

// ---- API Layer ----

async function fetchWeather() {
  try {
    const params = new URLSearchParams({
      latitude: LAT, longitude: LNG,
      current: [
        'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
        'precipitation', 'weather_code', 'cloud_cover',
        'wind_speed_10m', 'wind_gusts_10m', 'visibility', 'is_day'
      ].join(','),
      daily: ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'uv_index_max'].join(','),
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'America/Los_Angeles',
      forecast_days: 7
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchAirQuality() {
  try {
    const params = new URLSearchParams({
      latitude: LAT, longitude: LNG,
      current: 'us_aqi,pm2_5'
    });
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchNWSForecast() {
  try {
    const res = await fetch('https://api.weather.gov/gridpoints/MTR/85,105/forecast', {
      headers: { 'User-Agent': 'PresidioPadlet/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const period = data?.properties?.periods?.[0];
    return period ? { narrative: period.detailedForecast, name: period.name } : null;
  } catch { return null; }
}

async function fetchSunTimes() {
  try {
    const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LNG}&formatted=0`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.status === 'OK' ? data.results : null;
  } catch { return null; }
}

async function fetchTides() {
  try {
    const params = new URLSearchParams({
      station: TIDE_STATION, product: 'predictions', datum: 'MLLW',
      time_zone: 'lst_ldt', units: 'english', interval: 'hilo',
      format: 'json', range: 24, date: 'today'
    });
    const res = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.predictions?.length ? data.predictions : null;
  } catch { return null; }
}

async function fetchSurf() {
  try {
    const params = new URLSearchParams({
      latitude: LAT, longitude: LNG,
      current: 'wave_height,wave_period',
      timezone: 'America/Los_Angeles',
      length_unit: 'imperial'
    });
    const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchEarthquakes() {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;
    let nearest = null, minDist = Infinity;
    for (const f of data.features) {
      const [qLng, qLat] = f.geometry.coordinates;
      const dist = haversine(LAT, LNG, qLat, qLng);
      if (dist < 300 && dist < minDist) { minDist = dist; nearest = f; }
    }
    if (!nearest) return null;
    return {
      mag: nearest.properties.mag,
      place: nearest.properties.place,
      time: nearest.properties.time
    };
  } catch { return null; }
}

async function fetchShuttle() {
  if (!TRANSIT_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.511.org/transit/StopMonitoring?api_key=${TRANSIT_API_KEY}&agency=presidigo&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const visits = data?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit;
    if (!visits?.length) return null;
    return visits.slice(0, 3).map(v => {
      const j = v.MonitoredVehicleJourney;
      return {
        line: j?.PublishedLineName || 'PresidiGo',
        destination: j?.DestinationName || '',
        expected: j?.MonitoredCall?.ExpectedArrivalTime || j?.MonitoredCall?.ExpectedDepartureTime || ''
      };
    });
  } catch { return null; }
}

// ---- Helpers ----

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
    });
  } catch { return ''; }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function aqiLabel(v) {
  if (v <= 50) return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy for Sensitive Groups';
  if (v <= 200) return 'Unhealthy';
  return 'Very Unhealthy';
}

function aqiColor(v) {
  if (v <= 50) return '#6ee7b7';
  if (v <= 100) return '#fcd34d';
  if (v <= 150) return '#fb923c';
  return '#f87171';
}

function weatherDesc(code) {
  const d = {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
    80: 'Showers', 81: 'Mod. Showers', 82: 'Heavy Showers',
    95: 'Thunderstorm', 96: 'T-Storm + Hail', 99: 'Severe T-Storm'
  };
  return d[code] || 'Clear';
}

function weatherConditionShort(code) {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 75) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Storm';
}

function dayName(dateStr, i) {
  if (i === 0) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '💨';
  if (code <= 55) return '🌧';
  if (code <= 65) return '🌧';
  if (code <= 75) return '❄️';
  if (code <= 82) return '🌦';
  return '⛈';
}

// ---- Hero (default + region transform) ----

function getHeroContent(region) {
  const w = appData.weather;
  const a = appData.aqi;
  const nws = appData.nws;
  const s = appData.sun;
  const tides = appData.tides;

  if (region === null || region === undefined) {
    if (!w?.current) return { headline: '—', subtitle: 'Loading conditions…' };
    const temp = Math.round(w.current.temperature_2m);
    const c = w.current;
    const aqiVal = a?.current?.us_aqi ?? 0;
    const checks = {
      warm: c.apparent_temperature >= 58,
      calm: c.wind_speed_10m < 15,
      dry: c.precipitation === 0,
      clear: c.cloud_cover < 75,
      airSafe: aqiVal < 100,
      visible: c.visibility > 3000
    };
    const isLawnDay = Object.values(checks).every(Boolean);
    const sentiment = isLawnDay
      ? 'Could be a great day to work on the lawn.'
      : 'Seems like a good day for staying cozy inside.';
    return { headline: `${temp}°`, subtitle: sentiment };
  }

  if (region === 'sky') {
    if (!w?.current) return { headline: '—', subtitle: 'No weather data' };
    const c = w.current;
    const uv = w.daily?.uv_index_max?.[0];
    const aqiVal = a?.current?.us_aqi;
    const headline = `${Math.round(c.temperature_2m)}°F · ${weatherDesc(c.weather_code)}`;
    let subtitle = `Feels like ${Math.round(c.apparent_temperature)}° · Wind ${Math.round(c.wind_speed_10m)} mph · Humidity ${c.relative_humidity_2m}%`;
    if (uv != null) subtitle += ` · UV ${Math.round(uv)}`;
    if (aqiVal != null) subtitle += ` · AQI ${aqiVal} ${aqiLabel(aqiVal)}`;
    if (nws?.narrative) subtitle = nws.narrative;
    return { headline, subtitle };
  }

  if (region === 'water') {
    if (!tides?.length) return { headline: 'Tides', subtitle: 'No tide data available' };
    const now = new Date();
    const upcoming = tides.filter(t => new Date(t.t) > now).slice(0, 2);
    if (!upcoming.length) return { headline: 'Crissy Field Tides', subtitle: 'No upcoming tides today' };
    const t = upcoming[0];
    const type = t.type === 'H' ? 'High' : 'Low';
    const time = new Date(t.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
    const headline = `${type} tide ${parseFloat(t.v).toFixed(1)} ft at ${time}`;
    const next = upcoming[1];
    let subtitle = next
      ? `${next.type === 'H' ? 'High' : 'Low'} ${parseFloat(next.v).toFixed(1)} ft at ${new Date(next.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}`
      : 'Crissy Field';
    const surf = appData.surf;
    const waveH = surf?.current?.wave_height;
    const waveP = surf?.current?.wave_period;
    if (waveH != null) {
      subtitle += ` · Waves ${Math.round(waveH)} ft`;
      if (waveP != null) subtitle += ` @ ${Math.round(waveP)}s`;
    }
    return { headline, subtitle };
  }

  if (region === 'bridge') {
    if (!s) return { headline: 'Sun & Light', subtitle: 'Unavailable' };
    const now = new Date();
    const rise = new Date(s.sunrise);
    const beforeSunrise = now < rise;

    if (beforeSunrise) {
      const headline = `Sunrise at ${formatTime(s.sunrise)}`;
      const subtitle = `Sunset at ${formatTime(s.sunset)}`;
      return { headline, subtitle };
    }

    const headline = `Sunset at ${formatTime(s.sunset)}`;
    const subtitle = s.golden_hour
      ? `Golden hour at ${formatTime(s.golden_hour)}`
      : `Sunrise was at ${formatTime(s.sunrise)}`;
    return { headline, subtitle };
  }

  return { headline: '—', subtitle: '' };
}

function applyHeroContent(headline, subtitle, region) {
  setText('hero-headline', headline);
  setText('hero-subtitle', subtitle);
  renderHeroWeek(region);
}

function renderHeroWeek(region) {
  const weekEl = document.getElementById('hero-week');
  if (!weekEl) return;

  if (region !== 'sky') {
    weekEl.innerHTML = '';
    return;
  }

  const w = appData.weather;
  if (!w?.daily?.time?.length) {
    weekEl.innerHTML = '';
    return;
  }

  let html = '';
  const days = w.daily.time;
  for (let i = 0; i < days.length && i < 7; i++) {
    const day = dayName(days[i], i);
    const hi = Math.round(w.daily.temperature_2m_max[i]);
    const icon = weatherIcon(w.daily.weather_code[i]);
    html += `<div class="hero-week-day"><span class="hero-week-day-name">${day}</span><span class="hero-week-day-temp">${hi}°</span><span class="hero-week-day-icon" aria-hidden="true">${icon}</span></div>`;
  }
  weekEl.innerHTML = html;
}

function setHeroRegion(region) {
  if (region === activeHeroRegion) region = null;
  activeHeroRegion = region;

  if (heroRevertTimeout) {
    clearTimeout(heroRevertTimeout);
    heroRevertTimeout = null;
  }
  if (region) {
    heroRevertTimeout = setTimeout(() => setHeroRegion(null), HERO_REVERT_MS);
  }

  document.querySelectorAll('.hotspot.active').forEach(h => h.classList.remove('active'));
  if (region) {
    const hotspot = document.querySelector(`.hotspot[data-region="${region}"]`);
    if (hotspot) hotspot.classList.add('active');
  }

  const hero = document.getElementById('hero');
  if (!hero) return;

  hero.classList.add('hero-fade');
  setTimeout(() => {
    const { headline, subtitle } = getHeroContent(region);
    applyHeroContent(headline, subtitle, region);
    if (region) hero.classList.add('hero-region');
    else hero.classList.remove('hero-region');
    hero.classList.remove('hero-fade');
  }, 500);
}

function renderHero() {
  if (activeHeroRegion !== null) {
    const { headline, subtitle } = getHeroContent(activeHeroRegion);
    applyHeroContent(headline, subtitle, activeHeroRegion);
  } else {
    const { headline, subtitle } = getHeroContent(null);
    applyHeroContent(headline, subtitle, null);
  }
}

function initHotspots() {
  document.querySelectorAll('.hotspot[data-region]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setHeroRegion(el.dataset.region);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hotspot') && !e.target.closest('#hotspot-layer') && !e.target.closest('#board-overlay')) {
      if (activeHeroRegion !== null) setHeroRegion(null);
    }
  });
}

// ---- DOM Helpers ----

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

function setInner(selector, html) {
  const el = document.querySelector(selector);
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

// ---- Time-of-Day Overlay ----

function updateTimeOverlay() {
  const overlay = document.getElementById('time-overlay');
  if (!overlay) return;

  const now = new Date();
  const t = now.getHours() + now.getMinutes() / 60;

  let sunriseH = 6.5, sunsetH = 18.5;
  if (appData.sun) {
    try {
      const sr = new Date(appData.sun.sunrise);
      sunriseH = sr.getHours() + sr.getMinutes() / 60;
      const ss = new Date(appData.sun.sunset);
      sunsetH = ss.getHours() + ss.getMinutes() / 60;
    } catch {}
  }

  let bg;
  if (t < sunriseH - 0.5) bg = 'rgba(20, 20, 60, 0.25)';
  else if (t < sunriseH + 1) bg = 'rgba(255, 180, 80, 0.08)';
  else if (t < sunsetH - 2) bg = 'transparent';
  else if (t < sunsetH) bg = 'rgba(255, 160, 50, 0.12)';
  else if (t < sunsetH + 1.5) bg = 'rgba(100, 60, 150, 0.18)';
  else bg = 'rgba(15, 15, 50, 0.25)';

  overlay.style.background = bg;
}

// ---- Clock ----

function updateClock() {
  const now = new Date();
  setText('current-time', now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles'
  }));
}

function updateDate() {
  const now = new Date();
  setText('current-date', now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles'
  }));
}

// ---- Audio ----

function initAudio() {
  const audio = document.getElementById('lofi-audio');
  const toggle = document.getElementById('sound-toggle');
  if (!audio || !toggle) return;

  let isPlaying = false, transitioning = false, streamLoaded = false, usingFallback = false;

  function loadStream() {
    audio.src = usingFallback ? LOFI_STREAM_FALLBACK : LOFI_STREAM_URL;
    audio.load();
    streamLoaded = true;
  }

  audio.addEventListener('error', () => {
    if (isPlaying && !usingFallback) {
      usingFallback = true;
      audio.src = LOFI_STREAM_FALLBACK;
      audio.volume = 0.35;
      audio.play().catch(() => {});
    }
  });

  audio.addEventListener('stalled', () => {
    if (isPlaying) {
      setTimeout(() => { if (audio.paused && isPlaying) audio.play().catch(() => {}); }, 2000);
    }
  });

  toggle.addEventListener('click', async () => {
    if (transitioning) return;
    transitioning = true;

    if (isPlaying) {
      fadeAudio(audio, audio.volume, 0, 400, () => {
        audio.pause();
        document.body.classList.remove('audio-playing');
        isPlaying = false;
        transitioning = false;
      });
    } else {
      if (!streamLoaded) loadStream();
      audio.volume = 0;
      try {
        await audio.play();
        document.body.classList.add('audio-playing');
        isPlaying = true;
        fadeAudio(audio, 0, 0.35, 800, () => { transitioning = false; });
      } catch { transitioning = false; }
    }
  });

  setText('stream-label', 'Groove Salad · SomaFM');
  setTimeout(() => toggle.classList.add('pulse'), 2500);
}

function fadeAudio(audio, from, to, duration, onDone) {
  const steps = 20, stepTime = duration / steps, delta = (to - from) / steps;
  let current = from, step = 0;
  const interval = setInterval(() => {
    step++;
    current += delta;
    audio.volume = Math.max(0, Math.min(1, current));
    if (step >= steps) {
      clearInterval(interval);
      audio.volume = Math.max(0, Math.min(1, to));
      if (onDone) onDone();
    }
  }, stepTime);
}

// ---- Hotspot Layer Positioning ----

function syncHotspotLayer() {
  const video = document.getElementById('bg-video');
  const layer = document.getElementById('hotspot-layer');
  if (!video || !layer || !video.videoWidth) return;

  const vw = window.innerWidth, vh = window.innerHeight;
  const videoRatio = video.videoWidth / video.videoHeight;
  const viewRatio = vw / vh;
  let w, h;
  if (viewRatio > videoRatio) { w = vw; h = vw / videoRatio; }
  else { h = vh; w = vh * videoRatio; }

  layer.style.width = w + 'px';
  layer.style.height = h + 'px';
  layer.style.left = ((vw - w) / 2) + 'px';
  layer.style.top = ((vh - h) / 2) + 'px';
}

function initHotspotLayer() {
  const video = document.getElementById('bg-video');
  if (!video) return;

  const doSync = () => { syncHotspotLayer(); window.addEventListener('resize', syncHotspotLayer); };

  if (video.videoWidth) doSync();
  else video.addEventListener('loadedmetadata', doSync, { once: true });
}

// ---- Entrance ----

function initEntrance() {
  const video = document.getElementById('bg-video');
  const poster = document.getElementById('poster');
  let revealed = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (poster) poster.classList.add('hidden');
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  };

  if (poster) {
    poster.addEventListener('error', () => { poster.style.display = 'none'; }, { once: true });
  }

  if (video) {
    if (video.readyState >= 3) reveal();
    else {
      video.addEventListener('canplay', reveal, { once: true });
      video.addEventListener('error', reveal, { once: true });
    }
    setTimeout(reveal, 3000);
  } else {
    reveal();
  }
}

// ---- Board: "Working From…" (Padlet-style Wall) ----

const SUPABASE_BOARD_BUCKET = 'board-images';
let supabaseClient = null;
if (typeof window !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase) {
  supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// ---- Content Moderation (NSFWJS) ----

let nsfwModel = null;
let nsfwModelPromise = null;
let photoApproved = true;
let photoScanning = false;

function loadNSFWModel() {
  if (nsfwModel) return Promise.resolve(nsfwModel);
  if (nsfwModelPromise) return nsfwModelPromise;
  if (typeof nsfwjs === 'undefined') {
    console.warn('[NSFWJS] nsfwjs library not loaded');
    return Promise.resolve(null);
  }

  console.log('[NSFWJS] Loading model...');
  nsfwModelPromise = nsfwjs.load('./assets/nsfw_model/').then(model => {
    console.log('[NSFWJS] Model loaded successfully');
    nsfwModel = model;
    return model;
  }).catch(err => {
    console.error('[NSFWJS] Model failed to load:', err);
    nsfwModelPromise = null;
    return null;
  });

  return nsfwModelPromise;
}

async function scanImage(imgElement) {
  const model = await loadNSFWModel();
  if (!model) {
    console.warn('[NSFWJS] No model available, skipping scan');
    photoApproved = true;
    updateComposerState();
    return;
  }

  photoScanning = true;
  updateComposerState();

  try {
    const predictions = await model.classify(imgElement);
    const scores = {};
    predictions.forEach(p => { scores[p.className] = p.probability; });

    console.log('[NSFWJS] Image scan results:', scores);

    const porn = scores['Porn'] || 0;
    const hentai = scores['Hentai'] || 0;
    const sexy = scores['Sexy'] || 0;
    const combined = porn + hentai + sexy;

    // Only block when the model is clearly confident (avoids blocking dogs, desks, normal photos)
    const blocked = porn > 0.6
      || hentai > 0.6
      || sexy > 0.7
      || combined > 0.65;

    photoApproved = !blocked;
    console.log('[NSFWJS]', blocked ? 'BLOCKED' : 'APPROVED');
  } catch (err) {
    console.error('[NSFWJS] Scan error:', err);
    photoApproved = true;
  }

  photoScanning = false;
  updateComposerState();
}

// ---- Rate Limiting (localStorage) ----

const DAILY_POST_LIMIT = 10;
const RATE_LIMIT_KEY = 'padlet_board_posts';

function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function getDailyPostCount() {
  try {
    const data = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '{}');
    return data[getTodayKey()] || 0;
  } catch { return 0; }
}

function incrementDailyPostCount() {
  try {
    const data = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '{}');
    const today = getTodayKey();
    data[today] = (data[today] || 0) + 1;
    const keys = Object.keys(data).sort().slice(-3);
    const trimmed = {};
    keys.forEach(k => { trimmed[k] = data[k]; });
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(trimmed));
  } catch {}
}

function isRateLimited() {
  return getDailyPostCount() >= DAILY_POST_LIMIT;
}

// ---- Composer State ----

function updateComposerState() {
  const submitBtn = document.getElementById('composer-submit');
  const statusEl = document.getElementById('composer-status');
  if (!submitBtn || !statusEl) return;

  const rateLimited = isRateLimited();

  if (rateLimited) {
    submitBtn.disabled = true;
    statusEl.textContent = "You\u2019ve shared enough for today \u2014 come back tomorrow";
    statusEl.className = 'composer-status status-blocked';
    return;
  }

  if (photoScanning) {
    submitBtn.disabled = true;
    statusEl.textContent = '';
    statusEl.className = 'composer-status';
    return;
  }

  if (!photoApproved) {
    submitBtn.disabled = true;
    statusEl.textContent = 'This image can\u2019t be posted';
    statusEl.className = 'composer-status status-blocked';
    return;
  }

  submitBtn.disabled = false;
  statusEl.textContent = '';
  statusEl.className = 'composer-status';
}

const MOOD_PALETTE = {
  'caffeinated':       { bg: '#b7410e', color: '#fff' },
  'golden hour':       { bg: '#c9943e', color: '#fff' },
  'cozy':              { bg: '#4e7e8f', color: '#fff' },
  'in transit':        { bg: '#3a6078', color: '#fff' },
  'focused':           { bg: '#3a6e52', color: '#fff' },
  'lazy day':          { bg: '#5a7e7a', color: '#fff' },
  'buzzing':           { bg: '#2e7d7e', color: '#fff' },
  'living the dream':  { bg: '#4a8fa0', color: '#fff' }
};

let boardPosts = [];

const REACTION_EMOJIS = ['\u2764\ufe0f', '\ud83d\udc4d', '\ud83c\udf89', '\ud83e\udd23'];

let boardReactions = {};
let userReactions = {};

function initBoardReactions() {
  boardReactions = {};
  userReactions = {};
}

function rowToPost(row) {
  const created = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const timeMinutes = Math.floor((Date.now() - created) / 60000);
  return {
    id: String(row.id),
    image: row.image_url || '',
    mood: row.mood || 'cozy',
    caption: row.caption || '',
    author: row.author || 'Anonymous',
    avatar: row.avatar_color || '#888',
    time: timeMinutes,
    reactions: row.reactions && typeof row.reactions === 'object' ? row.reactions : {}
  };
}

async function fetchBoardPosts() {
  const wall = document.getElementById('board-wall');
  if (!supabaseClient) {
    if (wall) wall.innerHTML = '<p class="board-error">Configure Supabase in config.js to load posts.</p>';
    boardPosts = [];
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('board_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    boardPosts = (data || []).map(rowToPost);
    boardReactions = {};
    userReactions = {};
    boardPosts.forEach(p => {
      boardReactions[p.id] = { ...p.reactions };
      userReactions[p.id] = null;
    });
    renderBoard();
  } catch (err) {
    console.error('[Board] fetchBoardPosts:', err);
    boardPosts = [];
    if (wall) wall.innerHTML = '<p class="board-error">Couldn\'t load posts.</p>';
  }
}

function dataURLToBlob(dataURL) {
  return fetch(dataURL).then(r => r.blob());
}

async function uploadBoardImage(blobOrFile) {
  if (!supabaseClient) throw new Error('Supabase not configured');
  const file = blobOrFile instanceof File ? blobOrFile : new File([blobOrFile], 'image.jpg', { type: 'image/jpeg' });
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabaseClient.storage.from(SUPABASE_BOARD_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: urlData } = supabaseClient.storage.from(SUPABASE_BOARD_BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

async function insertBoardPost(payload) {
  if (!supabaseClient) throw new Error('Supabase not configured');
  const { data, error } = await supabaseClient.from('board_posts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updatePostReactions(postId, reactions) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('board_posts').update({ reactions }).eq('id', postId);
  } catch (err) {
    console.error('[Board] updatePostReactions:', err);
  }
}

function boardTimeLabel(minutes) {
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  return `${h}h ago`;
}

function renderPostCard(post, index) {
  const m = MOOD_PALETTE[post.mood] || { bg: '#888', color: '#fff' };
  const reactions = boardReactions[post.id] || {};
  const userR = userReactions[post.id];
  const initials = post.author.split(' ').map(n => n[0]).join('');

  let reactionsHtml = '';
  for (const emoji of REACTION_EMOJIS) {
    const count = reactions[emoji];
    if (!count) continue;
    const isUser = userR === emoji;
    reactionsHtml += `<button class="post-reaction${isUser ? ' reacted' : ''}" data-post="${post.id}" data-emoji="${emoji}"><span>${emoji}</span><span class="post-reaction-count">${count}</span></button>`;
  }
  reactionsHtml += `<button class="post-reaction-add" data-post="${post.id}" title="React">+</button>`;

  const imageHtml = post.image
    ? `<img class="post-card-image" src="${post.image}" alt="${post.caption}" loading="lazy">`
    : '';

  return `<div class="post-card" style="animation-delay:${index * 0.07}s">
    ${imageHtml}
    <div class="post-card-body">
      <span class="post-mood" style="background:${m.bg};color:${m.color}">${post.mood}</span>
      <div class="post-caption">${post.caption}</div>
      <div class="post-meta">
        <span class="post-avatar" style="background:${post.avatar}">${initials}</span>
        <span class="post-author">${post.author}</span>
        <span class="post-time">${boardTimeLabel(post.time)}</span>
      </div>
      <div class="post-reactions">${reactionsHtml}</div>
    </div>
  </div>`;
}

function renderBoard() {
  const wall = document.getElementById('board-wall');
  if (!wall) return;
  wall.innerHTML = boardPosts.map((p, i) => renderPostCard(p, i)).join('');
}

function handleReactionClick(postId, emoji) {
  const prev = userReactions[postId];

  if (prev === emoji) {
    boardReactions[postId][emoji] = Math.max(0, (boardReactions[postId][emoji] || 1) - 1);
    if (boardReactions[postId][emoji] === 0) delete boardReactions[postId][emoji];
    userReactions[postId] = null;
  } else {
    if (prev) {
      boardReactions[postId][prev] = Math.max(0, (boardReactions[postId][prev] || 1) - 1);
      if (boardReactions[postId][prev] === 0) delete boardReactions[postId][prev];
    }
    boardReactions[postId][emoji] = (boardReactions[postId][emoji] || 0) + 1;
    userReactions[postId] = emoji;
  }

  renderBoard();
  updatePostReactions(postId, boardReactions[postId]);
}

function handleReactionAdd(postId) {
  const randomEmoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
  handleReactionClick(postId, randomEmoji);
}

async function openBoard() {
  const overlay = document.getElementById('board-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  loadNSFWModel();
  await fetchBoardPosts();
}

function closeBoard() {
  const overlay = document.getElementById('board-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  closeComposer();
}

let composerPhotoDataURL = null;
let composerRawImage = null;

const cropState = {
  scale: 1, panX: 0, panY: 0,
  containScale: 1, coverScale: 1,
  dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0,
  imgW: 0, imgH: 0
};

function getCropContainer() {
  const el = document.getElementById('composer-photo-placeholder');
  if (!el) return null;
  return el.getBoundingClientRect();
}

function clampPan() {
  const rect = getCropContainer();
  if (!rect || !cropState.imgW) return;
  const displayW = cropState.imgW * cropState.scale;
  const displayH = cropState.imgH * cropState.scale;

  if (displayW > rect.width) {
    cropState.panX = Math.min(0, Math.max(rect.width - displayW, cropState.panX));
  } else {
    cropState.panX = (rect.width - displayW) / 2;
  }

  if (displayH > rect.height) {
    cropState.panY = Math.min(0, Math.max(rect.height - displayH, cropState.panY));
  } else {
    cropState.panY = (rect.height - displayH) / 2;
  }
}

function applyCropTransform() {
  const preview = document.getElementById('composer-photo-preview');
  if (!preview) return;
  const displayW = cropState.imgW * cropState.scale;
  const displayH = cropState.imgH * cropState.scale;
  preview.style.width = displayW + 'px';
  preview.style.height = displayH + 'px';
  preview.style.transform = `translate(${cropState.panX}px, ${cropState.panY}px)`;
}

function initCropForImage(img) {
  const rect = getCropContainer();
  if (!rect) return;
  cropState.imgW = img.naturalWidth;
  cropState.imgH = img.naturalHeight;
  cropState.containScale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  cropState.coverScale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  cropState.scale = cropState.coverScale;
  cropState.panX = 0;
  cropState.panY = 0;
  clampPan();

  const slider = document.getElementById('composer-zoom');
  if (slider) {
    slider.min = '0';
    slider.max = '100';
    slider.value = String(scaleToSlider(cropState.coverScale));
  }
}

function scaleToSlider(scale) {
  const minS = cropState.containScale;
  const maxS = cropState.coverScale * 3;
  if (maxS <= minS) return 50;
  return Math.round(((scale - minS) / (maxS - minS)) * 100);
}

function sliderToScale(val) {
  const minS = cropState.containScale;
  const maxS = cropState.coverScale * 3;
  return minS + (val / 100) * (maxS - minS);
}

function cropToCanvas() {
  if (!composerRawImage) return composerPhotoDataURL;
  const rect = getCropContainer();
  if (!rect) return composerPhotoDataURL;

  const srcX = -cropState.panX / cropState.scale;
  const srcY = -cropState.panY / cropState.scale;
  const srcW = rect.width / cropState.scale;
  const srcH = rect.height / cropState.scale;

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(800, Math.round(rect.width * 2));
  canvas.height = Math.round(canvas.width * (rect.height / rect.width));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a2530';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(composerRawImage, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function openComposer() {
  const composer = document.getElementById('board-composer');
  const btn = document.getElementById('board-compose-btn');
  if (composer) { composer.classList.add('open'); composer.setAttribute('aria-hidden', 'false'); }
  if (btn) btn.style.display = 'none';
  photoApproved = true;
  photoScanning = false;
  updateComposerState();
}

function closeComposer() {
  const composer = document.getElementById('board-composer');
  const btn = document.getElementById('board-compose-btn');
  if (composer) { composer.classList.remove('open'); composer.setAttribute('aria-hidden', 'true'); }
  if (btn) btn.style.display = '';
}

function resetComposer() {
  composerPhotoDataURL = null;
  composerRawImage = null;
  cropState.scale = 1;
  cropState.panX = 0;
  cropState.panY = 0;
  cropState.containScale = 1;
  cropState.coverScale = 1;
  cropState.imgW = 0;
  cropState.imgH = 0;

  const preview = document.getElementById('composer-photo-preview');
  const placeholder = document.getElementById('composer-photo-placeholder');
  const fileInput = document.getElementById('composer-file');
  const nameInput = document.getElementById('composer-name');
  const captionInput = document.querySelector('.composer-caption');
  const cropControls = document.getElementById('composer-crop-controls');
  const zoomSlider = document.getElementById('composer-zoom');

  if (preview) { preview.src = ''; preview.hidden = true; preview.style.transform = ''; preview.style.width = ''; preview.style.height = ''; }
  if (placeholder) placeholder.classList.remove('has-photo');
  if (fileInput) fileInput.value = '';
  if (nameInput) nameInput.value = '';
  if (captionInput) captionInput.value = '';
  if (cropControls) cropControls.hidden = true;
  if (zoomSlider) zoomSlider.value = '100';

  document.querySelectorAll('.composer-mood-pill').forEach(p => {
    p.classList.remove('selected');
    p.style.background = '';
  });

  photoApproved = true;
  photoScanning = false;
  const statusEl = document.getElementById('composer-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'composer-status'; }
  const submitBtn = document.getElementById('composer-submit');
  if (submitBtn) submitBtn.disabled = false;
}

async function submitPost() {
  if (isRateLimited() || !photoApproved || photoScanning) return;

  const captionInput = document.querySelector('.composer-caption');
  const caption = captionInput?.value?.trim() || '';
  const selectedMood = document.querySelector('.composer-mood-pill.selected')?.dataset.mood || null;

  if (!caption && !composerPhotoDataURL) return;

  if (!supabaseClient) {
    const statusEl = document.getElementById('composer-status');
    if (statusEl) { statusEl.textContent = 'Configure Supabase in config.js to post.'; statusEl.className = 'composer-status status-blocked'; }
    return;
  }

  const submitBtn = document.getElementById('composer-submit');
  const statusEl = document.getElementById('composer-status');
  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Posting…'; statusEl.className = 'composer-status'; }

  const moodKeys = Object.keys(MOOD_PALETTE);
  const mood = selectedMood || moodKeys[Math.floor(Math.random() * moodKeys.length)];
  const pal = MOOD_PALETTE[mood];
  const croppedImage = composerRawImage ? cropToCanvas() : composerPhotoDataURL;

  try {
    let imageUrl = null;
    if (croppedImage && croppedImage.startsWith('data:')) {
      const blob = await dataURLToBlob(croppedImage);
      imageUrl = await uploadBoardImage(blob);
    }
    const authorInput = document.getElementById('composer-name');
    const authorName = authorInput?.value?.trim() || 'Anonymous';
    await insertBoardPost({
      image_url: imageUrl,
      mood,
      caption: caption || 'No caption',
      author: authorName,
      avatar_color: pal.bg,
      reactions: {}
    });
    incrementDailyPostCount();
    await fetchBoardPosts();
    resetComposer();
    closeComposer();
    const wall = document.getElementById('board-wall');
    if (wall) wall.scrollTop = 0;
  } catch (err) {
    console.error('[Board] submitPost:', err);
    if (statusEl) { statusEl.textContent = 'Post failed. Try again.'; statusEl.className = 'composer-status status-blocked'; }
    if (submitBtn) submitBtn.disabled = false;
  }
}

function renderComposerMoods() {
  const container = document.getElementById('composer-moods');
  if (!container) return;
  container.innerHTML = Object.entries(MOOD_PALETTE).map(([mood, pal]) =>
    `<button class="composer-mood-pill" data-mood="${mood}" style="--mood-bg:${pal.bg}">${mood}</button>`
  ).join('');
}

function initBoard() {
  initBoardReactions();
  renderComposerMoods();

  const buildingHotspot = document.querySelector('.hotspot-building[data-action="board"]');
  if (buildingHotspot) {
    buildingHotspot.addEventListener('click', (e) => {
      e.stopPropagation();
      openBoard();
    });
  }

  const overlay = document.getElementById('board-overlay');
  if (overlay) {
    overlay.querySelector('.board-close')?.addEventListener('click', closeBoard);
    overlay.querySelector('.board-backdrop')?.addEventListener('click', closeBoard);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) closeBoard();
  });

  const wall = document.getElementById('board-wall');
  if (wall) {
    wall.addEventListener('click', (e) => {
      const reactionBtn = e.target.closest('.post-reaction[data-emoji]');
      if (reactionBtn) {
        handleReactionClick(reactionBtn.dataset.post, reactionBtn.dataset.emoji);
        return;
      }
      const addBtn = e.target.closest('.post-reaction-add');
      if (addBtn) {
        handleReactionAdd(addBtn.dataset.post);
      }
    });
  }

  document.getElementById('board-compose-btn')?.addEventListener('click', openComposer);
  document.getElementById('composer-close')?.addEventListener('click', closeComposer);

  const photoPlaceholder = document.getElementById('composer-photo-placeholder');
  const fileInput = document.getElementById('composer-file');
  const preview = document.getElementById('composer-photo-preview');
  const cropControls = document.getElementById('composer-crop-controls');
  const zoomSlider = document.getElementById('composer-zoom');

  if (photoPlaceholder && fileInput) {
    photoPlaceholder.addEventListener('click', (e) => {
      if (!photoPlaceholder.classList.contains('has-photo')) fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        composerPhotoDataURL = e.target.result;
        const img = new Image();
        img.onload = () => {
          composerRawImage = img;
          photoApproved = true;
          photoPlaceholder.classList.add('has-photo');
          if (preview) { preview.src = composerPhotoDataURL; preview.hidden = false; }
          if (cropControls) cropControls.hidden = false;
          requestAnimationFrame(() => {
            initCropForImage(img);
            applyCropTransform();
          });
          scanImage(img);
        };
        img.src = composerPhotoDataURL;
      };
      reader.readAsDataURL(file);
    });
  }

  if (preview) {
    const startDrag = (clientX, clientY) => {
      if (!photoPlaceholder.classList.contains('has-photo')) return;
      cropState.dragging = true;
      cropState.startX = clientX;
      cropState.startY = clientY;
      cropState.startPanX = cropState.panX;
      cropState.startPanY = cropState.panY;
    };
    const moveDrag = (clientX, clientY) => {
      if (!cropState.dragging) return;
      cropState.panX = cropState.startPanX + (clientX - cropState.startX);
      cropState.panY = cropState.startPanY + (clientY - cropState.startY);
      clampPan();
      applyCropTransform();
    };
    const endDrag = () => { cropState.dragging = false; };

    preview.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    preview.addEventListener('touchstart', (e) => { startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchmove', (e) => { if (cropState.dragging) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchend', endDrag);
  }

  if (zoomSlider) {
    zoomSlider.addEventListener('input', () => {
      cropState.scale = sliderToScale(parseInt(zoomSlider.value));
      clampPan();
      applyCropTransform();
    });
  }

  document.getElementById('composer-submit')?.addEventListener('click', submitPost);

  const moodsContainer = document.getElementById('composer-moods');
  if (moodsContainer) {
    moodsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.composer-mood-pill');
      if (!pill) return;
      moodsContainer.querySelectorAll('.composer-mood-pill').forEach(p => {
        p.classList.remove('selected');
        p.style.background = '';
      });
      pill.classList.add('selected');
      pill.style.background = pill.style.getPropertyValue('--mood-bg');
    });
  }
}

// ---- Data Load ----

async function loadAllData() {
  const [weather, aqi, nws, sun, tides, surf, quake, shuttle] = await Promise.all([
    fetchWeather(), fetchAirQuality(), fetchNWSForecast(),
    fetchSunTimes(), fetchTides(), fetchSurf(), fetchEarthquakes(), fetchShuttle()
  ]);

  appData = { weather, aqi, nws, sun, tides, surf, quake, shuttle };

  renderHero();
  updateTimeOverlay();
}

// ---- Init ----

async function init() {
  updateClock();
  updateDate();
  setInterval(updateClock, 1000);

  initHotspotLayer();
  initAudio();
  initEntrance();
  initHotspots();
  initBoard();

  await loadAllData();

  setInterval(async () => {
    await loadAllData();
    updateDate();
  }, REFRESH_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);
