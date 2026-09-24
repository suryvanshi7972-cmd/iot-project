// =============================================================================
// TSS Group 4 - IoT Dashboard Logic
// Designed and Developed by TSS GROUP NO. 4
// =============================================================================

// State Variables
let currentTempC = 0.0;
let currentHum = 0.0;
let isFahrenheit = false;
let currentPage = 1;
const recordsPerPage = 20;
let totalPages = 1;
let sensorChart = null;
let autoSimInterval = null;
let pollInterval = null;

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Authenticate user
  await verifyAuthentication();

  // 2. Start IST Live Clock
  startKolkataClock();

  // 3. Initialize Chart.js
  initSensorChart();

  // 4. Fetch initial states
  await Promise.all([
    fetchLatestSensor(),
    fetchSensorHistory(1),
    fetchLcdState(),
    fetchLedState()
  ]);

  // 5. Start background 10-second polling for DHT11 & Actuator states
  pollInterval = setInterval(() => {
    fetchLatestSensor();
    fetchLedState();
    fetchLcdState();
  }, 10000);
});

// -----------------------------------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT
// -----------------------------------------------------------------------------
async function verifyAuthentication() {
  const token = localStorage.getItem('tss4_token');
  const userStr = localStorage.getItem('tss4_user');

  if (!token) {
    window.location.href = '/auth.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.user) {
      document.getElementById('nav-user-name').innerText = data.user.name.split(' ')[0];
      document.getElementById('dropdown-user-email').innerText = data.user.email;
    } else {
      localStorage.removeItem('tss4_token');
      localStorage.removeItem('tss4_user');
      window.location.href = '/auth.html';
    }
  } catch (err) {
    console.warn('Auth verification check offline:', err);
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        document.getElementById('nav-user-name').innerText = u.name.split(' ')[0];
        document.getElementById('dropdown-user-email').innerText = u.email;
      } catch (e) {}
    }
  }
}

function toggleUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.classList.toggle('hidden');
}

// Close dropdown on outside click
window.addEventListener('click', (e) => {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  if (userMenuBtn && dropdown && !userMenuBtn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

async function logoutUser() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  localStorage.removeItem('tss4_token');
  localStorage.removeItem('tss4_user');
  showToast('Logged out successfully', 'info');
  setTimeout(() => {
    window.location.href = '/auth.html';
  }, 500);
}

// -----------------------------------------------------------------------------
// IST CLOCK (Asia/Kolkata +5:30)
// -----------------------------------------------------------------------------
function startKolkataClock() {
  const clockEl = document.getElementById('ist-clock');
  const update = () => {
    const options = {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('en-IN', options) + ' IST';
  };
  update();
  setInterval(update, 1000);
}

// -----------------------------------------------------------------------------
// MAIN TAB SWITCHING
// -----------------------------------------------------------------------------
function switchMainTab(targetId) {
  const tabs = ['tab-env', 'tab-lcd', 'tab-led'];
  const navBtns = ['tab-nav-1', 'tab-nav-2', 'tab-nav-3'];

  tabs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === targetId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  navBtns.forEach((btnId, idx) => {
    const btn = document.getElementById(btnId);
    if (tabs[idx] === targetId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Trigger chart resize if switching to environment
  if (targetId === 'tab-env' && sensorChart) {
    sensorChart.resize();
  }
}

// -----------------------------------------------------------------------------
// TAB 1: ENVIRONMENT SENSOR (DHT11) & GAUGES
// -----------------------------------------------------------------------------

// Fetch Latest Sensor Reading
async function fetchLatestSensor() {
  try {
    const res = await fetch('/api/sensor/latest');
    const json = await res.json();

    if (json.success && json.data) {
      const { temperature, humidity, stats } = json.data;
      currentTempC = parseFloat(temperature) || 0.0;
      currentHum = parseFloat(humidity) || 0.0;

      updateTemperatureGauge(currentTempC);
      updateHumidityGauge(currentHum);

      // Update 24h stats
      if (stats) {
        const minT = stats.minTemp !== null ? Number(stats.minTemp).toFixed(1) : '--';
        const maxT = stats.maxTemp !== null ? Number(stats.maxTemp).toFixed(1) : '--';
        const minH = stats.minHum !== null ? Number(stats.minHum).toFixed(0) : '--';
        const maxH = stats.maxHum !== null ? Number(stats.maxHum).toFixed(0) : '--';

        document.getElementById('stat-temp-range').innerText = `${minT}°C / ${maxT}°C`;
        document.getElementById('stat-hum-range').innerText = `${minH}% / ${maxH}%`;
      }

      // Update chart data
      updateSensorChart();
    }
  } catch (err) {
    console.error('Error fetching latest sensor data:', err);
  }
}

// Toggle Temperature Unit (°C vs °F)
function toggleTempUnit() {
  isFahrenheit = !isFahrenheit;
  const toggleBtn = document.getElementById('unit-toggle');
  toggleBtn.innerText = isFahrenheit ? '°F' : '°C';
  updateTemperatureGauge(currentTempC);
}

// Update Temperature Radial Gauge & Seek Bar
function updateTemperatureGauge(tempC) {
  const valueEl = document.getElementById('temp-display-value');
  const unitEl = document.getElementById('temp-display-unit');
  const badgeEl = document.getElementById('temp-comfort-badge');
  const circleEl = document.getElementById('temp-gauge-circle');
  const seekFill = document.getElementById('temp-seek-fill');

  const displayedTemp = isFahrenheit ? (tempC * 9 / 5 + 32) : tempC;
  valueEl.innerText = displayedTemp.toFixed(1);
  unitEl.innerText = isFahrenheit ? '°F' : '°C';

  // SVG Gauge progress calculation:
  // Circle radius = 80, circumference = 2 * PI * 80 ≈ 502.65
  // Arc angle spans 270 degrees (3/4 of circle = 377px)
  const totalCircumference = 502.65;
  const arcLength = totalCircumference * 0.75; // 376.99
  const emptyOffset = totalCircumference * 0.25;

  // Temperature scale from 0°C to 50°C
  const clampedC = Math.max(0, Math.min(50, tempC));
  const progressRatio = clampedC / 50;
  const strokeOffset = totalCircumference - (arcLength * progressRatio);

  circleEl.style.strokeDashoffset = strokeOffset;

  // Color dynamic transition based on temperature
  let strokeColor = '#3B82F6'; // Cool blue
  let comfortText = 'Cool';
  let badgeClass = 'badge badge-info';

  if (tempC < 18) {
    strokeColor = '#3B82F6';
    comfortText = 'Chilly';
    badgeClass = 'badge badge-info';
  } else if (tempC >= 18 && tempC <= 27) {
    strokeColor = '#10B981';
    comfortText = 'Comfortable';
    badgeClass = 'badge badge-success';
  } else if (tempC > 27 && tempC <= 34) {
    strokeColor = '#F59E0B';
    comfortText = 'Warm';
    badgeClass = 'badge badge-warning';
  } else {
    strokeColor = '#EF4444';
    comfortText = 'High Heat';
    badgeClass = 'badge badge-danger';
  }

  circleEl.style.stroke = strokeColor;
  badgeEl.className = `${badgeClass} mt-2 text-[10px]`;
  badgeEl.innerText = comfortText;

  // Update Seek Bar Fill
  const seekPercentage = (clampedC / 50) * 100;
  seekFill.style.width = `${seekPercentage}%`;
}

// Update Humidity Radial Gauge & Seek Bar
function updateHumidityGauge(hum) {
  const valueEl = document.getElementById('hum-display-value');
  const badgeEl = document.getElementById('hum-comfort-badge');
  const circleEl = document.getElementById('hum-gauge-circle');
  const seekFill = document.getElementById('hum-seek-fill');

  valueEl.innerText = hum.toFixed(1);

  const totalCircumference = 502.65;
  const arcLength = totalCircumference * 0.75;
  const clampedHum = Math.max(0, Math.min(100, hum));
  const progressRatio = clampedHum / 100;
  const strokeOffset = totalCircumference - (arcLength * progressRatio);

  circleEl.style.strokeDashoffset = strokeOffset;

  let comfortText = 'Normal';
  let badgeClass = 'badge badge-success';
  let strokeColor = '#059669';

  if (hum < 30) {
    comfortText = 'Dry';
    badgeClass = 'badge badge-warning';
    strokeColor = '#F59E0B';
  } else if (hum >= 30 && hum <= 60) {
    comfortText = 'Optimal';
    badgeClass = 'badge badge-success';
    strokeColor = '#10B981';
  } else {
    comfortText = 'High Humidity';
    badgeClass = 'badge badge-info';
    strokeColor = '#00796B';
  }

  circleEl.style.stroke = strokeColor;
  badgeEl.className = `${badgeClass} mt-2 text-[10px]`;
  badgeEl.innerText = comfortText;

  seekFill.style.width = `${clampedHum}%`;
}

// -----------------------------------------------------------------------------
// SENSOR TREND GRAPH (Chart.js)
// -----------------------------------------------------------------------------
function initSensorChart() {
  const ctx = document.getElementById('sensorChart').getContext('2d');

  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temp (°C)',
          data: [],
          borderColor: '#B8860B',
          backgroundColor: 'rgba(184, 134, 11, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        },
        {
          label: 'Humidity (%)',
          data: [],
          borderColor: '#00796B',
          backgroundColor: 'rgba(0, 121, 107, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 10,
            font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
            color: '#7A7267'
          }
        },
        tooltip: {
          backgroundColor: '#FFFFFF',
          titleColor: '#2B2620',
          bodyColor: '#5A534A',
          borderColor: '#EBE4D8',
          borderWidth: 1,
          padding: 8,
          boxPadding: 4,
          usePointStyle: true
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 9, family: "'JetBrains Mono', monospace" },
            color: '#A39B90',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 5
          }
        },
        y: {
          grid: { color: '#F1ECE3' },
          ticks: {
            font: { size: 9, family: "'JetBrains Mono', monospace" },
            color: '#A39B90'
          }
        }
      }
    }
  });
}

async function updateSensorChart() {
  if (!sensorChart) return;

  try {
    const res = await fetch('/api/sensor/chart?limit=15');
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      const labels = json.data.map(d => d.label);
      const temps = json.data.map(d => d.temperature);
      const hums = json.data.map(d => d.humidity);

      sensorChart.data.labels = labels;
      sensorChart.data.datasets[0].data = temps;
      sensorChart.data.datasets[1].data = hums;
      sensorChart.update('none'); // Update smoothly without jarring animations
    }
  } catch (err) {
    console.error('Error updating chart:', err);
  }
}

// -----------------------------------------------------------------------------
// TAB 1: SECTION 2 - SAVED RECORDS TABLE WITH PAGINATION
// -----------------------------------------------------------------------------
async function fetchSensorHistory(page = 1) {
  currentPage = page;
  const tbody = document.getElementById('records-table-body');

  try {
    const res = await fetch(`/api/sensor/history?page=${page}&limit=${recordsPerPage}`);
    const json = await res.json();

    if (json.success) {
      totalPages = json.totalPages || 1;
      renderRecordsTable(json.data, json.totalRecords, json.page, json.limit);
      renderPagination(json.page, totalPages);
    }
  } catch (err) {
    console.error('Error fetching sensor history:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-6 text-red-500 text-xs">
          Failed to load telemetry history.
        </td>
      </tr>
    `;
  }
}

function renderRecordsTable(records, totalRecords, page, limit) {
  const tbody = document.getElementById('records-table-body');
  const startEl = document.getElementById('pagination-start');
  const endEl = document.getElementById('pagination-end');
  const totalEl = document.getElementById('pagination-total');

  totalEl.innerText = totalRecords;
  startEl.innerText = records.length ? (page - 1) * limit + 1 : 0;
  endEl.innerText = (page - 1) * limit + records.length;

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-[#A39B90] text-xs">
          <i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>
          No sensor records found. Telemetry will appear as the ESP8266 transmits.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr class="transition hover:bg-[#FAF8F5]">
      <td class="font-mono text-xs font-semibold text-[#8C6212]">#${r.rowNumber}</td>
      <td>
        <span class="inline-flex items-center gap-1.5 font-semibold text-[#2B2620]">
          <i class="fa-solid fa-temperature-half text-amber-600 text-xs"></i>
          ${r.temperature.toFixed(1)} °C
        </span>
      </td>
      <td>
        <span class="inline-flex items-center gap-1.5 font-semibold text-[#00796B]">
          <i class="fa-solid fa-droplet text-teal-600 text-xs"></i>
          ${r.humidity.toFixed(1)} %
        </span>
      </td>
      <td class="font-mono text-xs text-[#2B2620]">${r.time}</td>
      <td class="font-mono text-xs text-[#7A7267]">${r.date}</td>
      <td class="text-right">
        <button onclick="deleteRecord(${r.id})" class="text-[#A39B90] hover:text-red-600 p-1.5 rounded transition" title="Delete Record #${r.id}">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderPagination(current, total) {
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');
  const pagesContainer = document.getElementById('pagination-pages');

  prevBtn.disabled = current <= 1;
  nextBtn.disabled = current >= total;

  let pagesHtml = '';
  const maxButtons = 5;
  let startPage = Math.max(1, current - 2);
  let endPage = Math.min(total, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const isActive = p === current;
    pagesHtml += `
      <button onclick="fetchSensorHistory(${p})" class="w-8 h-8 rounded-lg text-xs font-semibold transition ${
        isActive 
          ? 'bg-[#7A530C] text-white shadow-sm' 
          : 'bg-white text-[#7A7267] border border-[#EBE4D8] hover:bg-[#F6F3EC]'
      }">
        ${p}
      </button>
    `;
  }

  pagesContainer.innerHTML = pagesHtml;
}

function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    fetchSensorHistory(newPage);
  }
}

async function deleteRecord(id) {
  if (!confirm(`Are you sure you want to delete record #${id}?`)) return;

  try {
    const res = await fetch(`/api/sensor/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      showToast(`Record #${id} deleted`, 'info');
      fetchSensorHistory(currentPage);
      fetchLatestSensor();
    } else {
      showToast(json.message || 'Failed to delete record', 'error');
    }
  } catch (err) {
    showToast('Error deleting record', 'error');
  }
}

async function confirmClearAll() {
  if (!confirm('Warning: This will delete ALL logged sensor telemetry permanently. Continue?')) return;

  try {
    const res = await fetch('/api/sensor/clear/all', { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      showToast('All sensor records cleared', 'success');
      fetchSensorHistory(1);
      fetchLatestSensor();
    } else {
      showToast('Failed to clear records', 'error');
    }
  } catch (err) {
    showToast('Error communicating with server', 'error');
  }
}

// Export Table to CSV
async function exportToCSV() {
  try {
    const res = await fetch('/api/sensor/history?page=1&limit=1000');
    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      showToast('No records available to export', 'warning');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Record No,Temperature (C),Humidity (%),Time (IST),Date\n';

    json.data.forEach(r => {
      csvContent += `${r.rowNumber},${r.temperature},${r.humidity},"${r.time}","${r.date}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tss_group_4_sensor_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Telemetry exported to CSV', 'success');
  } catch (err) {
    showToast('Failed to export CSV', 'error');
  }
}

// -----------------------------------------------------------------------------
// TAB 2: SMART LCD 16x2 CONTROLLER & LIVE SIMULATOR
// -----------------------------------------------------------------------------
async function fetchLcdState() {
  try {
    const res = await fetch('/api/lcd');
    const json = await res.json();

    if (json.success) {
      const r1 = json.row1 || '';
      const r2 = json.row2 || '';

      const inputR1 = document.getElementById('lcd-row1-input');
      const inputR2 = document.getElementById('lcd-row2-input');

      // Only set if not currently active / focused by user typing
      if (document.activeElement !== inputR1) inputR1.value = r1;
      if (document.activeElement !== inputR2) inputR2.value = r2;

      updateLcdPreview();
      updateLcdCharCount('lcd-row1-input', 'lcd-row1-counter');
      updateLcdCharCount('lcd-row2-input', 'lcd-row2-counter');
    }
  } catch (err) {
    console.error('Error fetching LCD state:', err);
  }
}

function updateLcdCharCount(inputId, counterId) {
  const val = document.getElementById(inputId).value || '';
  document.getElementById(counterId).innerText = `${val.length}/16`;
}

function updateLcdPreview() {
  const r1 = document.getElementById('lcd-row1-input').value.toUpperCase();
  const r2 = document.getElementById('lcd-row2-input').value.toUpperCase();

  // Pad to 16 characters for realistic LCD appearance
  const paddedR1 = (r1 + ' '.repeat(16)).substring(0, 16);
  const paddedR2 = (r2 + ' '.repeat(16)).substring(0, 16);

  document.getElementById('sim-lcd-row1').innerText = paddedR1;
  document.getElementById('sim-lcd-row2').innerText = paddedR2;
}

function setLcdPreset(row1, row2) {
  document.getElementById('lcd-row1-input').value = row1;
  document.getElementById('lcd-row2-input').value = row2;
  updateLcdPreview();
  updateLcdCharCount('lcd-row1-input', 'lcd-row1-counter');
  updateLcdCharCount('lcd-row2-input', 'lcd-row2-counter');
}

function toggleLcdBacklight() {
  const screen = document.getElementById('simulated-lcd-screen');
  screen.classList.toggle('backlight-off');
}

async function handleLcdUpdate(e) {
  e.preventDefault();
  const row1 = document.getElementById('lcd-row1-input').value.toUpperCase().substring(0, 16);
  const row2 = document.getElementById('lcd-row2-input').value.toUpperCase().substring(0, 16);
  const btn = document.getElementById('btn-lcd-update');

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Updating LCD...`;

  try {
    const res = await fetch('/api/lcd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row1, row2 })
    });
    const json = await res.json();

    if (json.success) {
      showToast('LCD screen updated successfully!', 'success');
      updateLcdPreview();
    } else {
      showToast('Failed to update LCD display', 'error');
    }
  } catch (err) {
    showToast('Server communication error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i><span>Update Display</span>`;
  }
}

// -----------------------------------------------------------------------------
// TAB 3: LED AUTOMATION
// -----------------------------------------------------------------------------
async function fetchLedState() {
  try {
    const res = await fetch('/api/led');
    const json = await res.json();

    if (json.success) {
      renderLedUI(json.status);
    }
  } catch (err) {
    console.error('Error fetching LED state:', err);
  }
}

function renderLedUI(isOn) {
  const toggleInput = document.getElementById('led-toggle-input');
  const ledBulb = document.getElementById('led-indicator');
  const badge = document.getElementById('led-status-badge');
  const text = document.getElementById('led-state-text');

  toggleInput.checked = isOn;

  if (isOn) {
    ledBulb.classList.add('led-on');
    badge.className = 'badge badge-success text-xs';
    badge.innerText = 'ONLINE / ON';
    text.innerText = 'LED is currently illuminated (HIGH)';
    text.className = 'text-sm font-semibold text-emerald-700';
  } else {
    ledBulb.classList.remove('led-on');
    badge.className = 'badge badge-warning text-xs';
    badge.innerText = 'STANDBY / OFF';
    text.innerText = 'LED is currently powered OFF (LOW)';
    text.className = 'text-sm font-semibold text-[#7A7267]';
  }
}

async function handleLedToggle(targetState) {
  // Optimistic UI update
  renderLedUI(targetState);

  try {
    const res = await fetch('/api/led', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetState })
    });
    const json = await res.json();

    if (json.success) {
      renderLedUI(json.status);
      showToast(json.message, targetState ? 'success' : 'info');
    } else {
      // Revert if error
      renderLedUI(!targetState);
      showToast('Failed to toggle LED actuator', 'error');
    }
  } catch (err) {
    renderLedUI(!targetState);
    showToast('Failed to contact IoT server', 'error');
  }
}

// -----------------------------------------------------------------------------
// ESP8266 SENSOR SIMULATOR MODAL
// -----------------------------------------------------------------------------
function toggleSimulatorModal() {
  const modal = document.getElementById('simulator-modal');
  modal.classList.toggle('hidden');
}

async function sendSimulatedData() {
  const temp = parseFloat(document.getElementById('sim-temp-input').value);
  const hum = parseFloat(document.getElementById('sim-hum-input').value);

  try {
    const res = await fetch('/api/sensor/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: temp, humidity: hum })
    });
    const json = await res.json();

    if (json.success) {
      showToast(`Simulated telemetry sent: ${temp}°C, ${hum}%`, 'success');
      await fetchLatestSensor();
      await fetchSensorHistory(currentPage);
    }
  } catch (err) {
    showToast('Failed to push simulated reading', 'error');
  }
}

function toggleAutoSimulate(btn) {
  if (autoSimInterval) {
    clearInterval(autoSimInterval);
    autoSimInterval = null;
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Auto Simulate`;
    btn.className = 'btn-secondary py-2.5 text-xs';
    showToast('Auto simulation stopped', 'info');
  } else {
    autoSimInterval = setInterval(() => {
      // Fluctuate randomly around current values
      const currentT = parseFloat(document.getElementById('sim-temp-input').value);
      const currentH = parseFloat(document.getElementById('sim-hum-input').value);

      const deltaT = (Math.random() - 0.5) * 1.5;
      const deltaH = (Math.random() - 0.5) * 3.0;

      const newT = Math.max(15, Math.min(45, +(currentT + deltaT).toFixed(1)));
      const newH = Math.max(20, Math.min(90, +(currentH + deltaH).toFixed(1)));

      document.getElementById('sim-temp-input').value = newT;
      document.getElementById('sim-hum-input').value = newH;
      document.getElementById('sim-temp-val').innerText = newT + ' °C';
      document.getElementById('sim-hum-val').innerText = newH + ' %';

      sendSimulatedData();
    }, 10000);

    btn.innerHTML = `<i class="fa-solid fa-stop text-red-500"></i> Stop Sim`;
    btn.className = 'btn-secondary py-2.5 text-xs border-red-300 text-red-600';
    showToast('Auto simulation running (10s intervals)', 'success');
  }
}

// -----------------------------------------------------------------------------
// FORCE REFRESH ALL
// -----------------------------------------------------------------------------
async function refreshAllData() {
  showToast('Refreshing telemetry...', 'info');
  await Promise.all([
    fetchLatestSensor(),
    fetchSensorHistory(currentPage),
    fetchLcdState(),
    fetchLedState()
  ]);
  showToast('Data refreshed', 'success');
}

// -----------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-item';

  let iconHtml = '<i class="fa-solid fa-circle-info text-blue-500 text-lg"></i>';
  if (type === 'success') {
    iconHtml = '<i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i>';
  } else if (type === 'warning') {
    iconHtml = '<i class="fa-solid fa-triangle-exclamation text-amber-500 text-lg"></i>';
  } else if (type === 'error') {
    iconHtml = '<i class="fa-solid fa-circle-xmark text-red-500 text-lg"></i>';
  }

  toast.innerHTML = `
    ${iconHtml}
    <div class="text-xs font-semibold text-[#2B2620] flex-1">${message}</div>
    <button onclick="this.parentElement.remove()" class="text-[#A39B90] hover:text-[#2B2620]">
      <i class="fa-solid fa-xmark text-xs"></i>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
