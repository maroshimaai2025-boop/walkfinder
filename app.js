// ===== 定数 =====
const STEP_LENGTH_M = 0.65; // 歩幅（m）
const WALK_SPEED_KMH = 4.0; // 歩行速度（km/h）
const OVERPASS_MAIN = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.kumi.systems/api/interpreter';
const GEO_TIMEOUT = 10000; // 位置取得タイムアウト（ms）
const OVERPASS_TIMEOUT = 25000; // Overpass APIタイムアウト（ms）
const MIN_SEARCH_RADIUS = 300; // 最小検索半径（m）
const MAX_SEARCH_RADIUS = 10000; // 最大検索半径（m）
const MAX_SPOTS = 30; // 最大取得件数
const STEP_TOLERANCE_RATIO = 0.083; // ±約8.3%（例：6000歩 → ±500歩の幅）

// スライダー設定
const SLIDER_CONFIG = {
  steps: { min: 1000, max: 15000, step: 500, default: 3000 },
  distance: { min: 0.5, max: 10.0, step: 0.5, default: 2.0 },
};

// カテゴリ日本語マッピング
const CATEGORY_MAP = {
  // amenity
  park: '公園',
  cafe: 'カフェ',
  restaurant: 'レストラン',
  place_of_worship: '神社・寺院',
  library: '図書館',
  community_centre: 'コミュニティ施設',
  // leisure
  garden: '庭園',
  playground: '遊び場',
  sports_centre: 'スポーツ施設',
  pitch: 'スポーツ施設',
  // tourism
  viewpoint: '展望スポット',
  attraction: '観光名所',
  museum: '美術館・博物館',
  artwork: 'アート',
  // natural
  peak: '山・丘',
  spring: '湧き水',
  water: '水辺',
  wood: '森林',
};

// ===== DOM要素 =====
const $toggleSteps = document.getElementById('toggleSteps');
const $toggleDistance = document.getElementById('toggleDistance');
const $slider = document.getElementById('slider');
const $sliderValue = document.getElementById('sliderValue');
const $sliderMin = document.getElementById('sliderMin');
const $sliderMax = document.getElementById('sliderMax');
const $searchBtn = document.getElementById('searchBtn');
const $statusSection = document.getElementById('statusSection');
const $spinner = document.getElementById('spinner');
const $statusText = document.getElementById('statusText');
const $retryBtn = document.getElementById('retryBtn');
const $resultsSection = document.getElementById('resultsSection');
const $resultsList = document.getElementById('resultsList');

// ===== アプリ状態 =====
let currentUnit = 'steps'; // 'steps' | 'distance'

// ===== ユーティリティ関数 =====
function stepsToKm(steps) {
  return (steps * STEP_LENGTH_M) / 1000;
}

function kmToSteps(km) {
  return (km * 1000) / STEP_LENGTH_M;
}

function formatNumber(num) {
  return num.toLocaleString('ja-JP');
}

function getTargetKm() {
  const val = parseFloat($slider.value);
  return currentUnit === 'steps' ? stepsToKm(val) : val;
}

function getSearchRadius() {
  const km = getTargetKm();
  // 片道目標距離の上限まで検索する
  const maxKm = km * (1 + STEP_TOLERANCE_RATIO);
  return Math.max(MIN_SEARCH_RADIUS, Math.min(maxKm * 1000, MAX_SEARCH_RADIUS));
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球の半径（m）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCategoryLabel(tags) {
  const checks = [
    tags.amenity,
    tags.leisure,
    tags.tourism,
    tags.natural,
  ];
  for (const val of checks) {
    if (val && CATEGORY_MAP[val]) return CATEGORY_MAP[val];
  }
  // 神社・お寺の特別処理
  if (tags.religion === 'shinto') return '神社';
  if (tags.religion === 'buddhism') return 'お寺';
  return 'スポット';
}

// ===== UI更新 =====
function updateSliderDisplay() {
  const val = parseFloat($slider.value);
  if (currentUnit === 'steps') {
    $sliderValue.textContent = `${formatNumber(val)} 歩`;
  } else {
    $sliderValue.textContent = `${val.toFixed(1)} km`;
  }
}

function switchUnit(unit) {
  const currentVal = parseFloat($slider.value);
  currentUnit = unit;

  if (unit === 'steps') {
    $toggleSteps.classList.add('toggle-btn--active');
    $toggleSteps.setAttribute('aria-pressed', 'true');
    $toggleDistance.classList.remove('toggle-btn--active');
    $toggleDistance.setAttribute('aria-pressed', 'false');

    const config = SLIDER_CONFIG.steps;
    const convertedVal = Math.round(kmToSteps(currentVal) / config.step) * config.step;
    const clampedVal = Math.max(config.min, Math.min(convertedVal, config.max));

    $slider.min = config.min;
    $slider.max = config.max;
    $slider.step = config.step;
    $slider.value = clampedVal;
    $sliderMin.textContent = formatNumber(config.min);
    $sliderMax.textContent = formatNumber(config.max);
  } else {
    $toggleDistance.classList.add('toggle-btn--active');
    $toggleDistance.setAttribute('aria-pressed', 'true');
    $toggleSteps.classList.remove('toggle-btn--active');
    $toggleSteps.setAttribute('aria-pressed', 'false');

    const config = SLIDER_CONFIG.distance;
    const convertedVal = Math.round(stepsToKm(currentVal) / config.step) * config.step;
    const clampedVal = Math.max(config.min, Math.min(convertedVal, config.max));

    $slider.min = config.min;
    $slider.max = config.max;
    $slider.step = config.step;
    $slider.value = clampedVal;
    $sliderMin.textContent = config.min.toFixed(1);
    $sliderMax.textContent = config.max.toFixed(1);
  }

  updateSliderDisplay();
}

function showStatus(text, isError = false) {
  $statusSection.hidden = false;
  $resultsSection.hidden = true;
  $statusText.textContent = text;
  $statusText.className = isError ? 'status__text status__text--error' : 'status__text';
  $spinner.hidden = isError;
  $retryBtn.hidden = !isError;
}

function hideStatus() {
  $statusSection.hidden = true;
}

function setLoading(loading) {
  $searchBtn.disabled = loading;
}

// ===== 位置情報取得 =====
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT,
      maximumAge: 60000,
    });
  });
}

// ===== Overpass API =====
function buildOverpassQuery(lat, lon, radius) {
  const r = Math.round(radius);
  return `[out:json][timeout:25];
(
  node["amenity"~"^(cafe|restaurant|library|community_centre|place_of_worship)$"]["name"](around:${r},${lat},${lon});
  node["leisure"~"^(park|garden|playground|sports_centre|pitch)$"]["name"](around:${r},${lat},${lon});
  node["tourism"~"^(viewpoint|attraction|museum|artwork)$"]["name"](around:${r},${lat},${lon});
  node["natural"~"^(peak|spring|water|wood)$"]["name"](around:${r},${lat},${lon});
  way["leisure"="park"]["name"](around:${r},${lat},${lon});
  way["amenity"="place_of_worship"]["name"](around:${r},${lat},${lon});
  relation["leisure"="park"]["name"](around:${r},${lat},${lon});
);
out center ${MAX_SPOTS};`;
}

async function fetchOverpass(endpoint, query, signal) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchSpots(lat, lon) {
  const radius = getSearchRadius();
  const query = buildOverpassQuery(lat, lon, radius);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT);

  try {
    const data = await fetchOverpass(OVERPASS_MAIN, query, controller.signal);
    clearTimeout(timeoutId);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    // フォールバック（HTTPエラー or タイムアウト）
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), OVERPASS_TIMEOUT);
    try {
      const data = await fetchOverpass(OVERPASS_FALLBACK, query, controller2.signal);
      clearTimeout(timeoutId2);
      return data;
    } catch (err2) {
      clearTimeout(timeoutId2);
      throw err2;
    }
  }
}

// ===== 候補選定ロジック =====
function selectCandidates(elements, userLat, userLon) {
  // スポット情報を整形
  const spots = elements
    .map((el) => {
      // way/relation の場合は center を使用
      const lat = el.lat || (el.center && el.center.lat);
      const lon = el.lon || (el.center && el.center.lon);
      if (!lat || !lon) return null;

      const name = el.tags['name:ja'] || el.tags.name;
      if (!name) return null;

      const distance = calcDistance(userLat, userLon, lat, lon);
      return {
        name,
        lat,
        lon,
        distance,
        tags: el.tags,
        category: getCategoryLabel(el.tags),
      };
    })
    .filter(Boolean);

  // 距離でソート
  spots.sort((a, b) => a.distance - b.distance);

  // 片道目標距離に対して±STEP_TOLERANCE_RATIO の範囲でフィルタリング
  const targetKm = getTargetKm(); // 片道目標距離
  const tolerance = targetKm * STEP_TOLERANCE_RATIO;
  const minKm = targetKm - tolerance;
  const maxKm = targetKm + tolerance;

  const inRange = spots.filter((s) => {
    const oneWayKm = s.distance / 1000;
    return oneWayKm >= minKm && oneWayKm <= maxKm;
  });

  // 範囲内に候補がなければ、目標に最も近い上位MAX_SPOTS件を使用
  const pool = inRange.length > 0 ? inRange : spots.slice(0, MAX_SPOTS);

  if (pool.length === 0) return [];
  if (pool.length <= 3) return pool;

  // 3群に分割してそれぞれからランダム1件選出
  const third = Math.ceil(pool.length / 3);
  const near = pool.slice(0, third);
  const mid = pool.slice(third, third * 2);
  const far = pool.slice(third * 2);

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const result = [pick(near)];
  if (mid.length > 0) result.push(pick(mid));
  if (far.length > 0) result.push(pick(far));

  return result;
}

// ===== 候補カード描画 =====
function renderResults(candidates, userLat, userLon) {
  $resultsList.innerHTML = '';

  const labels = ['近距離', '中距離', '遠距離'];
  const badges = ['near', 'mid', 'far'];

  candidates.forEach((spot, i) => {
    const distKm = spot.distance / 1000;
    const steps = Math.round(kmToSteps(distKm));
    const timeMin = Math.round((distKm / WALK_SPEED_KMH) * 60);

    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}&travelmode=walking`;

    const card = document.createElement('a');
    card.href = navUrl;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'spot-card';

    card.innerHTML = `
      <span class="spot-card__distance-badge spot-card__distance-badge--${badges[i] || 'near'}">${labels[i] || ''}</span>
      <div class="spot-card__header">
        <span class="spot-card__name">${escapeHtml(spot.name)}</span>
        <span class="spot-card__category">${escapeHtml(spot.category)}</span>
      </div>
      <div class="spot-card__details">
        <div class="spot-card__detail">
          <span class="spot-card__detail-label">距離</span>
          <span class="spot-card__detail-value">${distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km'}</span>
        </div>
        <div class="spot-card__detail">
          <span class="spot-card__detail-label">予測歩数</span>
          <span class="spot-card__detail-value">${formatNumber(steps)} 歩</span>
        </div>
        <div class="spot-card__detail">
          <span class="spot-card__detail-label">予測所要時間</span>
          <span class="spot-card__detail-value">約 ${timeMin} 分</span>
        </div>
      </div>
      <div class="spot-card__nav-hint">Google マップでナビ &rarr;</div>
    `;

    $resultsList.appendChild(card);
  });

  $resultsSection.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== メイン検索処理 =====
async function handleSearch() {
  hideStatus();
  $resultsSection.hidden = true;
  setLoading(true);

  try {
    // 1. 現在地取得
    showStatus('現在地を取得しています...');
    let position;
    try {
      position = await getCurrentPosition();
    } catch (geoErr) {
      if (geoErr.message === 'UNSUPPORTED') {
        showStatus('このブラウザは位置情報に対応していません。Safari または Chrome をお使いください。', true);
      } else if (geoErr.code === 1) {
        showStatus('位置情報の許可が必要です。ブラウザの設定をご確認ください。', true);
      } else {
        showStatus('現在地の取得に失敗しました。もう一度お試しください。', true);
      }
      setLoading(false);
      return;
    }

    const { latitude: lat, longitude: lon } = position.coords;

    // 2. スポット検索
    showStatus('周辺のスポットを検索しています...');
    let data;
    try {
      data = await searchSpots(lat, lon);
    } catch (apiErr) {
      showStatus('スポットの検索に失敗しました。もう一度お試しください。', true);
      setLoading(false);
      return;
    }

    // 3. 候補選定
    if (!data.elements || data.elements.length === 0) {
      showStatus('周辺にスポットが見つかりませんでした。目標値を変えてお試しください。', true);
      setLoading(false);
      return;
    }

    const candidates = selectCandidates(data.elements, lat, lon);
    if (candidates.length === 0) {
      showStatus('周辺にスポットが見つかりませんでした。目標値を変えてお試しください。', true);
      setLoading(false);
      return;
    }

    // 4. 結果表示
    hideStatus();
    renderResults(candidates, lat, lon);
  } finally {
    setLoading(false);
  }
}

// ===== イベントリスナー =====
$toggleSteps.addEventListener('click', () => switchUnit('steps'));
$toggleDistance.addEventListener('click', () => switchUnit('distance'));
$slider.addEventListener('input', updateSliderDisplay);
$searchBtn.addEventListener('click', handleSearch);
$retryBtn.addEventListener('click', handleSearch);

// 初期表示
updateSliderDisplay();
