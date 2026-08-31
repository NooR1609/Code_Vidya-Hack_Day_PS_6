/**
 * VisionTraffic AI - Frontend Dashboard Controller & Engine
 * Real-Time Vehicle Detection and Traffic Analytics System
 */

(function () {
  'use strict';

  // --- Configuration & State ---
  const state = {
    mode: 'auto', // 'backend' | 'standalone'
    backendConnected: false,
    isPaused: false,
    playbackSpeed: 1.0,
    audioAlerts: true,
    lastCount: 0,
    counter: 0,
    fps: 30.0,
    vpm: 0,
    vph: 0,
    density: 'Low',
    densityColor: 'emerald',
    latency: 12,
    resolution: { width: 1280, height: 720 },
    
    // Detection Parameters (matching vehicle counting system.py)
    params: {
      count_line_position: 550,
      min_width_react: 80,
      min_hieght_react: 80,
      offset: 6,
      history: 500,
      var_threshold: 16,
      detect_shadows: true
    },

    // Overlay Toggles
    overlays: {
      showBoxes: true,
      showCenters: true,
      showLine: true,
      showMask: false,
      showStats: true
    },

    // Interactive line setting mode
    isPickingLine: false,

    // Events Log
    eventsLog: [],
    filterClass: 'all',
    searchQuery: '',

    // Client-side Vision Simulation for Standalone Mode
    standalone: {
      simulatedVehicles: [],
      nextVehicleId: 1,
      simDetect: [],
      lineFlashUntil: 0
    }
  };

  // --- Audio Synthesis for Vehicle Crossing ---
  let audioCtx = null;
  function playCrossingChime() {
    if (!state.audioAlerts) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08); // E6
      
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.13);
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  // --- DOM Elements ---
  const el = {
    // Header & Status
    statusBadge: document.getElementById('status-badge'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    fpsBadge: document.getElementById('fps-badge'),
    resBadge: document.getElementById('res-badge'),
    latencyBadge: document.getElementById('latency-badge'),
    systemTime: document.getElementById('system-time'),
    modeSwitcher: document.getElementById('mode-switcher'),

    // Counter Cards
    counterVal: document.getElementById('total-counter-val'),
    counterCard: document.getElementById('counter-card'),
    vpmVal: document.getElementById('vpm-val'),
    vphVal: document.getElementById('vph-val'),
    densityBadge: document.getElementById('density-badge'),
    densityText: document.getElementById('density-text'),
    densityBar: document.getElementById('density-bar'),
    sensitivityVal: document.getElementById('sensitivity-val'),
    sensitivityArea: document.getElementById('sensitivity-area'),

    // Video Player
    videoPlayerContainer: document.getElementById('video-player-container'),
    streamImg: document.getElementById('stream-img'),
    videoElement: document.getElementById('standalone-video'),
    canvasOverlay: document.getElementById('canvas-overlay'),
    pipContainer: document.getElementById('pip-container'),
    pipImg: document.getElementById('pip-img'),
    pipCanvas: document.getElementById('pip-canvas'),
    linePickerBanner: document.getElementById('line-picker-banner'),

    // Controls
    btnPlayPause: document.getElementById('btn-play-pause'),
    btnRestart: document.getElementById('btn-restart'),
    selectSpeed: document.getElementById('select-speed'),
    btnAudioToggle: document.getElementById('btn-audio-toggle'),
    btnSnapshot: document.getElementById('btn-snapshot'),
    btnFullscreen: document.getElementById('btn-fullscreen'),

    // Overlays Switches
    toggleBoxes: document.getElementById('toggle-boxes'),
    toggleCenters: document.getElementById('toggle-centers'),
    toggleLine: document.getElementById('toggle-line'),
    toggleMask: document.getElementById('toggle-mask'),

    // Parameters
    sliderLineY: document.getElementById('slider-line-y'),
    inputLineY: document.getElementById('input-line-y'),
    btnPickLine: document.getElementById('btn-pick-line'),
    sliderMinWidth: document.getElementById('slider-min-width'),
    inputMinWidth: document.getElementById('input-min-width'),
    sliderMinHeight: document.getElementById('slider-min-height'),
    inputMinHeight: document.getElementById('input-min-height'),
    sliderOffset: document.getElementById('slider-offset'),
    inputOffset: document.getElementById('input-offset'),
    sliderHistory: document.getElementById('slider-history'),
    sliderVarThreshold: document.getElementById('slider-var-threshold'),
    toggleShadows: document.getElementById('toggle-shadows'),
    presetSelector: document.getElementById('preset-selector'),
    btnResetDefaults: document.getElementById('btn-reset-defaults'),
    btnResetCounter: document.getElementById('btn-reset-counter'),
    syncStatusBadge: document.getElementById('sync-status-badge'),

    // Activity Log & Filters
    activityTableBody: document.getElementById('activity-table-body'),
    logSearchInput: document.getElementById('log-search-input'),
    logCountBadge: document.getElementById('log-count-badge'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnClearLogs: document.getElementById('btn-clear-logs'),

    // Snapshot Modal
    snapshotModal: document.getElementById('snapshot-modal'),
    snapshotImg: document.getElementById('snapshot-img'),
    snapshotMeta: document.getElementById('snapshot-meta'),
    btnDownloadSnapshot: document.getElementById('btn-download-snapshot'),
    btnCloseSnapshot: document.getElementById('btn-close-snapshot')
  };

  // --- Charts Initialization ---
  let trafficTimeChart = null;
  let vehicleClassChart = null;

  const chartDataHistory = {
    labels: [],
    trafficCounts: [],
    flowRates: [],
    classCounts: {
      'Sedan / Car': 0,
      'SUV / Van': 0,
      'Truck / Bus': 0,
      'Compact / Two-Wheeler': 0
    }
  };

  function initCharts() {
    // Initialize labels for past 10 intervals
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 15000);
      chartDataHistory.labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      chartDataHistory.trafficCounts.push(0);
      chartDataHistory.flowRates.push(0);
    }

    // 1. Traffic Over Time Area Chart
    const ctxTime = document.getElementById('chart-traffic-time');
    if (ctxTime) {
      const gradient = ctxTime.getContext('2d').createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      const gradientFlow = ctxTime.getContext('2d').createLinearGradient(0, 0, 0, 200);
      gradientFlow.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      gradientFlow.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

      trafficTimeChart = new Chart(ctxTime, {
        type: 'line',
        data: {
          labels: chartDataHistory.labels,
          datasets: [
            {
              label: 'Cumulative Vehicles',
              data: chartDataHistory.trafficCounts,
              borderColor: '#10b981',
              backgroundColor: gradient,
              borderWidth: 2.5,
              fill: true,
              tension: 0.35,
              pointBackgroundColor: '#10b981',
              pointBorderColor: '#ffffff',
              pointRadius: 3,
              pointHoverRadius: 6,
              yAxisID: 'y'
            },
            {
              label: 'Flow Rate (VPM)',
              data: chartDataHistory.flowRates,
              borderColor: '#06b6d4',
              backgroundColor: gradientFlow,
              borderWidth: 2,
              borderDash: [4, 4],
              fill: false,
              tension: 0.3,
              pointBackgroundColor: '#06b6d4',
              pointRadius: 2,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              labels: {
                color: '#94a3b8',
                font: { family: 'Inter', size: 11 },
                boxWidth: 12,
                boxHeight: 12
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleFont: { family: 'Inter', weight: 'bold' },
              bodyFont: { family: 'JetBrains Mono' },
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              displayColors: true
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0 }
            },
            y: {
              type: 'linear',
              position: 'left',
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
              ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 10 } },
              suggestedMin: 0,
              suggestedMax: 10
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { color: '#06b6d4', font: { family: 'JetBrains Mono', size: 10 } },
              suggestedMin: 0,
              suggestedMax: 20
            }
          }
        }
      });
    }

    // 2. Vehicle Classification Donut Chart
    const ctxClass = document.getElementById('chart-vehicle-class');
    if (ctxClass) {
      vehicleClassChart = new Chart(ctxClass, {
        type: 'doughnut',
        data: {
          labels: ['Sedan / Car', 'SUV / Van', 'Truck / Bus', 'Two-Wheeler'],
          datasets: [{
            data: [0, 0, 0, 0],
            backgroundColor: [
              '#10b981', // Emerald
              '#06b6d4', // Cyan
              '#f59e0b', // Amber
              '#8b5cf6'  // Purple
            ],
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#94a3b8',
                font: { family: 'Inter', size: 11 },
                boxWidth: 10,
                boxHeight: 10,
                padding: 12
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleFont: { family: 'Inter', weight: 'bold' },
              bodyFont: { family: 'JetBrains Mono' },
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1
            }
          },
          cutout: '70%'
        }
      });
    }
  }

  function updateCharts() {
    if (!trafficTimeChart || !vehicleClassChart) return;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Append to time chart
    chartDataHistory.labels.push(timeLabel);
    chartDataHistory.trafficCounts.push(state.counter);
    chartDataHistory.flowRates.push(state.vpm);

    if (chartDataHistory.labels.length > 15) {
      chartDataHistory.labels.shift();
      chartDataHistory.trafficCounts.shift();
      chartDataHistory.flowRates.shift();
    }

    trafficTimeChart.data.labels = chartDataHistory.labels;
    trafficTimeChart.data.datasets[0].data = chartDataHistory.trafficCounts;
    trafficTimeChart.data.datasets[1].data = chartDataHistory.flowRates;
    trafficTimeChart.update('none');

    // Update Donut Chart
    const classData = [
      chartDataHistory.classCounts['Sedan / Car'] || 0,
      chartDataHistory.classCounts['SUV / Van'] || 0,
      chartDataHistory.classCounts['Truck / Bus'] || 0,
      chartDataHistory.classCounts['Compact / Two-Wheeler'] || 0
    ];
    vehicleClassChart.data.datasets[0].data = classData;
    vehicleClassChart.update('none');
  }

  // --- Backend Connection & Telemetry Polling ---
  let backendPollInterval = null;
  let lastPingTime = Date.now();

  async function checkBackendConnection() {
    try {
      const pingStart = performance.now();
      const res = await fetch('/api/stats', { cache: 'no-store' });
      if (res.ok) {
        const pingEnd = performance.now();
        state.latency = Math.round(pingEnd - pingStart);
        const data = await res.json();
        if (!state.backendConnected) {
          state.backendConnected = true;
          setMode('backend');
        }
        applyStatsFromBackend(data);
        return true;
      }
    } catch (e) {
      // Backend not running on this origin
    }
    if (state.backendConnected) {
      state.backendConnected = false;
      setMode('standalone');
    }
    return false;
  }

  function applyStatsFromBackend(stats) {
    if (stats.counter !== undefined) {
      if (stats.counter > state.counter) {
        flashCounter();
        playCrossingChime();
      }
      state.counter = stats.counter;
    }
    if (stats.fps !== undefined) state.fps = stats.fps;
    if (stats.vpm !== undefined) state.vpm = stats.vpm;
    if (stats.vph !== undefined) state.vph = stats.vph;
    if (stats.density !== undefined) state.density = stats.density;
    if (stats.density_color !== undefined) state.densityColor = stats.density_color;
    if (stats.resolution) state.resolution = stats.resolution;

    // Synchronize Recent Events
    if (stats.recent_events && stats.recent_events.length > 0) {
      for (const ev of stats.recent_events) {
        if (!state.eventsLog.some(e => e.id === ev.id && e.timestamp === ev.timestamp)) {
          state.eventsLog.unshift(ev);
          // Update class counts for donut chart
          chartDataHistory.classCounts[ev.class] = (chartDataHistory.classCounts[ev.class] || 0) + 1;
        }
      }
      renderActivityLogTable();
    }

    renderMetricsUI();
  }

  function setMode(newMode) {
    state.mode = newMode;
    if (newMode === 'backend') {
      el.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400';
      el.statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 pulse-beacon';
      el.statusText.textContent = 'Live OpenCV Stream (Connected)';
      el.modeSwitcher.textContent = 'Mode: Python Backend';
      el.modeSwitcher.className = 'glass-btn glass-btn-emerald px-3 py-1 rounded-lg text-xs font-medium cursor-pointer';

      // Show MJPEG stream
      el.streamImg.classList.remove('hidden');
      el.videoElement.classList.add('hidden');
      el.canvasOverlay.classList.add('hidden');
      el.streamImg.src = '/video_feed?' + Date.now();
      
      if (state.overlays.showMask) {
        el.pipContainer.classList.remove('hidden');
        el.pipImg.classList.remove('hidden');
        el.pipCanvas.classList.add('hidden');
        el.pipImg.src = '/mask_feed?' + Date.now();
      }
    } else {
      el.statusBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400';
      el.statusDot.className = 'w-2 h-2 rounded-full bg-amber-400';
      el.statusText.textContent = 'Standalone Browser Vision Engine';
      el.modeSwitcher.textContent = 'Mode: Browser Standalone';
      el.modeSwitcher.className = 'glass-btn px-3 py-1 rounded-lg text-xs font-medium cursor-pointer border-amber-500/40 text-amber-300';

      // Show native video & canvas overlay
      el.streamImg.classList.add('hidden');
      el.videoElement.classList.remove('hidden');
      el.canvasOverlay.classList.remove('hidden');
      
      initStandaloneVisionEngine();
    }
  }

  // --- Standalone In-Browser Vision Simulation Pipeline ---
  let standaloneAnimFrame = null;
  let canvasCtx = null;

  function initStandaloneVisionEngine() {
    const video = el.videoElement;
    const canvas = el.canvasOverlay;
    canvasCtx = canvas.getContext('2d');

    video.src = 'video.mp4';
    video.loop = true;
    video.muted = true;
    video.play().catch(e => console.log('Video autoplay:', e));

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      state.resolution = { width: canvas.width, height: canvas.height };
      renderMetricsUI();
    };

    // Pre-populate simulated vehicles flow matching highway dynamics
    state.standalone.simulatedVehicles = [
      { id: 1, x: 260, y: 150, w: 110, h: 100, vy: 4.8, class: 'SUV / Van', counted: false },
      { id: 2, x: 490, y: 80, w: 90, h: 85, vy: 5.4, class: 'Sedan / Car', counted: false },
      { id: 3, x: 740, y: 220, w: 160, h: 140, vy: 4.2, class: 'Truck / Bus', counted: false },
      { id: 4, x: 380, y: 20, w: 85, h: 80, vy: 5.8, class: 'Sedan / Car', counted: false }
    ];

    if (!standaloneAnimFrame) {
      runStandaloneLoop();
    }
  }

  function runStandaloneLoop() {
    if (state.mode === 'standalone' && !state.isPaused) {
      renderStandaloneFrame();
    }
    standaloneAnimFrame = requestAnimationFrame(runStandaloneLoop);
  }

  let lastFrameTime = performance.now();
  let frameCounter = 0;
  let fpsUpdateTimer = performance.now();

  function renderStandaloneFrame() {
    const canvas = el.canvasOverlay;
    if (!canvasCtx || !canvas.width) return;

    // Calculate FPS
    frameCounter++;
    const now = performance.now();
    if (now - fpsUpdateTimer >= 500) {
      state.fps = Math.round((frameCounter * 1000) / (now - fpsUpdateTimer) * 10) / 10;
      frameCounter = 0;
      fpsUpdateTimer = now;
      renderMetricsUI();
    }

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const lineY = state.params.count_line_position;
    const minW = state.params.min_width_react;
    const minH = state.params.min_hieght_react;
    const off = state.params.offset;

    // 1. Draw Counting Reference Line
    if (state.overlays.showLine) {
      const isFlashing = Date.now() < state.standalone.lineFlashUntil;
      canvasCtx.beginPath();
      canvasCtx.moveTo(25, lineY);
      canvasCtx.lineTo(canvas.width - 25, lineY);
      canvasCtx.lineWidth = isFlashing ? 4 : 2.5;
      canvasCtx.strokeStyle = isFlashing ? '#00e5ff' : '#ff7f00';
      canvasCtx.shadowColor = isFlashing ? '#00e5ff' : 'transparent';
      canvasCtx.shadowBlur = isFlashing ? 12 : 0;
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;

      // Line Label Badge
      canvasCtx.fillStyle = isFlashing ? '#00e5ff' : '#ff7f00';
      canvasCtx.font = '600 13px "JetBrains Mono", monospace';
      canvasCtx.fillText(`COUNT LINE: Y=${lineY} (Buffer ±${off}px)`, 30, Math.max(lineY - 10, 25));
    }

    // 2. Update and Draw Simulated / Detected Vehicles
    const vehicles = state.standalone.simulatedVehicles;

    // Spawn new vehicles periodically
    if (Math.random() < 0.035 && vehicles.length < 7) {
      const lanes = [220, 360, 520, 700, 860];
      const laneX = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() * 40 - 20);
      const vehicleClasses = [
        { class: 'Sedan / Car', w: 85 + Math.floor(Math.random() * 20), h: 82 + Math.floor(Math.random() * 15), vy: 4.8 + Math.random() * 1.5 },
        { class: 'SUV / Van', w: 105 + Math.floor(Math.random() * 25), h: 100 + Math.floor(Math.random() * 20), vy: 4.4 + Math.random() * 1.2 },
        { class: 'Truck / Bus', w: 150 + Math.floor(Math.random() * 30), h: 135 + Math.floor(Math.random() * 25), vy: 3.5 + Math.random() * 0.8 },
        { class: 'Compact / Two-Wheeler', w: 65 + Math.floor(Math.random() * 15), h: 65 + Math.floor(Math.random() * 15), vy: 5.5 + Math.random() * 1.5 }
      ];
      const chosen = vehicleClasses[Math.floor(Math.random() * vehicleClasses.length)];
      vehicles.push({
        id: ++state.standalone.nextVehicleId,
        x: laneX,
        y: 20,
        w: chosen.w,
        h: chosen.h,
        vy: chosen.vy * state.playbackSpeed,
        class: chosen.class,
        counted: false
      });
    }

    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      v.y += v.vy * state.playbackSpeed;

      const cx = Math.floor(v.x + v.w / 2);
      const cy = Math.floor(v.y + v.h / 2);

      // Validate bounding box size thresholds
      const passesFilter = v.w >= minW && v.h >= minH;

      if (passesFilter) {
        // Draw Bounding Box (Green)
        if (state.overlays.showBoxes) {
          canvasCtx.lineWidth = 2;
          canvasCtx.strokeStyle = '#00ff00';
          canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.08)';
          canvasCtx.beginPath();
          canvasCtx.rect(v.x, v.y, v.w, v.h);
          canvasCtx.stroke();
          canvasCtx.fill();

          // Label
          canvasCtx.fillStyle = '#00ff00';
          canvasCtx.font = '500 11px "JetBrains Mono", monospace';
          canvasCtx.fillText(`ID#${v.id} ${v.class} [${v.w}x${v.h}]`, v.x, Math.max(v.y - 6, 15));
        }

        // Draw Centroid (Red)
        if (state.overlays.showCenters) {
          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy, 4, 0, 2 * Math.PI);
          canvasCtx.fillStyle = '#ff0000';
          canvasCtx.fill();

          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy, 8, 0, 2 * Math.PI);
          canvasCtx.strokeStyle = '#ff0000';
          canvasCtx.lineWidth = 1.5;
          canvasCtx.stroke();
        }

        // Check Line Crossing
        if (!v.counted && cy >= (lineY - off) && cy <= (lineY + off)) {
          v.counted = true;
          state.counter++;
          state.standalone.lineFlashUntil = Date.now() + 300;
          flashCounter();
          playCrossingChime();

          const nowTime = new Date().toLocaleTimeString();
          const newEvent = {
            id: state.counter,
            timestamp: nowTime,
            position: { cx, cy },
            dimensions: { w: v.w, h: v.h },
            class: v.class,
            direction: 'Downstream (South)',
            confidence: (0.92 + Math.random() * 0.07).toFixed(2)
          };
          state.eventsLog.unshift(newEvent);
          if (state.eventsLog.length > 200) state.eventsLog.pop();

          // Update donut classification count
          chartDataHistory.classCounts[v.class] = (chartDataHistory.classCounts[v.class] || 0) + 1;

          renderActivityLogTable();
          calculateFlowRate();
          renderMetricsUI();
        }
      }

      // Remove vehicle if it leaves the screen
      if (v.y > canvas.height + 100) {
        vehicles.splice(i, 1);
      }
    }

    // Render PiP Mask Canvas if active
    if (state.overlays.showMask && el.pipCanvas) {
      renderMaskSimulation();
    }
  }

  function renderMaskSimulation() {
    const pCanvas = el.pipCanvas;
    const pCtx = pCanvas.getContext('2d');
    pCanvas.width = 220;
    pCanvas.height = 130;

    pCtx.fillStyle = '#000000';
    pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

    // Draw white silhouettes of detected vehicles
    const scaleX = 220 / (state.resolution.width || 1280);
    const scaleY = 130 / (state.resolution.height || 720);

    pCtx.fillStyle = '#ffffff';
    for (const v of state.standalone.simulatedVehicles) {
      if (v.w >= state.params.min_width_react && v.h >= state.params.min_hieght_react) {
        pCtx.beginPath();
        pCtx.ellipse(
          (v.x + v.w / 2) * scaleX,
          (v.y + v.h / 2) * scaleY,
          (v.w / 2) * scaleX,
          (v.h / 2) * scaleY,
          0, 0, 2 * Math.PI
        );
        pCtx.fill();
      }
    }
  }

  // --- Flow Rate & Density Calculator ---
  const recentCrossingTimestamps = [];
  function calculateFlowRate() {
    const now = Date.now();
    recentCrossingTimestamps.push(now);
    // Keep crossings in last 60 seconds
    const cutoff = now - 60000;
    while (recentCrossingTimestamps.length > 0 && recentCrossingTimestamps[0] < cutoff) {
      recentCrossingTimestamps.shift();
    }

    state.vpm = recentCrossingTimestamps.length;
    state.vph = state.vpm * 60;

    if (state.vpm < 12) {
      state.density = 'Low';
      state.densityColor = 'emerald';
    } else if (state.vpm < 28) {
      state.density = 'Moderate';
      state.densityColor = 'amber';
    } else {
      state.density = 'Heavy Congestion';
      state.densityColor = 'rose';
    }
  }

  // --- UI Renders & Flashes ---
  function flashCounter() {
    if (!el.counterVal) return;
    el.counterVal.classList.remove('flash-trigger');
    void el.counterVal.offsetWidth; // Trigger reflow
    el.counterVal.classList.add('flash-trigger');
  }

  function renderMetricsUI() {
    // Total Count
    if (el.counterVal) el.counterVal.textContent = state.counter.toLocaleString();
    
    // FPS, Resolution, Latency
    if (el.fpsBadge) el.fpsBadge.textContent = `${state.fps} FPS`;
    if (el.resBadge) el.resBadge.textContent = `${state.resolution.width}×${state.resolution.height}`;
    if (el.latencyBadge) el.latencyBadge.textContent = `${state.latency} ms`;

    // Traffic Flow
    if (el.vpmVal) el.vpmVal.textContent = state.vpm;
    if (el.vphVal) el.vphVal.textContent = `~${state.vph} /hr`;

    // Density
    if (el.densityText) el.densityText.textContent = state.density;
    if (el.densityBadge) {
      if (state.densityColor === 'emerald') {
        el.densityBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
      } else if (state.densityColor === 'amber') {
        el.densityBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
      } else {
        el.densityBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40';
      }
    }
    if (el.densityBar) {
      const percentage = Math.min(100, Math.round((state.vpm / 40) * 100));
      el.densityBar.style.width = `${percentage}%`;
      el.densityBar.className = state.densityColor === 'emerald' ? 'h-full bg-emerald-500 rounded-full transition-all duration-300' :
                                state.densityColor === 'amber' ? 'h-full bg-amber-500 rounded-full transition-all duration-300' :
                                'h-full bg-rose-500 rounded-full transition-all duration-300';
    }

    // Sensitivity
    const minArea = state.params.min_width_react * state.params.min_hieght_react;
    if (el.sensitivityVal) el.sensitivityVal.textContent = `${state.params.min_width_react}×${state.params.min_hieght_react}px`;
    if (el.sensitivityArea) el.sensitivityArea.textContent = `(${minArea.toLocaleString()} px² threshold)`;
  }

  // --- Activity Log Table & Filtering ---
  function renderActivityLogTable() {
    if (!el.activityTableBody) return;

    let filtered = state.eventsLog;

    // Filter by class
    if (state.filterClass !== 'all') {
      filtered = filtered.filter(e => e.class.toLowerCase().includes(state.filterClass.toLowerCase()));
    }

    // Search query
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(e => 
        e.id.toString().includes(q) ||
        e.class.toLowerCase().includes(q) ||
        e.timestamp.toLowerCase().includes(q) ||
        `cx:${e.position.cx} cy:${e.position.cy}`.toLowerCase().includes(q)
      );
    }

    if (el.logCountBadge) {
      el.logCountBadge.textContent = `${filtered.length} of ${state.eventsLog.length} events`;
    }

    if (filtered.length === 0) {
      el.activityTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm font-medium">
            <i class="fa-solid fa-car-side text-2xl mb-2 block opacity-40"></i>
            No vehicle crossing events recorded yet
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered.map(ev => {
      let badgeColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      if (ev.class.includes('SUV')) badgeColor = 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      else if (ev.class.includes('Truck')) badgeColor = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      else if (ev.class.includes('Two-Wheeler') || ev.class.includes('Compact')) badgeColor = 'bg-purple-500/15 text-purple-400 border-purple-500/30';

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition-colors">
          <td class="px-3 py-2.5 font-mono text-emerald-400 font-bold">#${String(ev.id).padStart(4, '0')}</td>
          <td class="px-3 py-2.5">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeColor}">
              ${ev.class}
            </span>
          </td>
          <td class="px-3 py-2.5 font-mono text-slate-300">
            cx: <span class="text-cyan-400 font-semibold">${ev.position.cx}</span>, cy: <span class="text-amber-400 font-semibold">${ev.position.cy}</span>
          </td>
          <td class="px-3 py-2.5 font-mono text-slate-400">${ev.dimensions.w} × ${ev.dimensions.h} px</td>
          <td class="px-3 py-2.5 font-mono text-slate-400">${ev.timestamp}</td>
          <td class="px-3 py-2.5 text-right">
            <span class="text-[11px] text-emerald-400 font-mono font-medium">${Math.round((ev.confidence || 0.95) * 100)}%</span>
          </td>
        </tr>
      `;
    }).join('');

    el.activityTableBody.innerHTML = rowsHtml;
  }

  // --- Parameter Controls & Backend Sync ---
  let debounceTimeout = null;

  async function syncParameters(showFeedback = true) {
    if (showFeedback && el.syncStatusBadge) {
      el.syncStatusBadge.textContent = 'Syncing...';
      el.syncStatusBadge.className = 'text-xs text-amber-400 font-mono';
    }

    renderMetricsUI();

    if (state.mode === 'backend') {
      try {
        const payload = {
          count_line_position: state.params.count_line_position,
          min_width_react: state.params.min_width_react,
          min_hieght_react: state.params.min_hieght_react,
          offset: state.params.offset,
          history: state.params.history,
          var_threshold: state.params.var_threshold,
          detect_shadows: state.params.detect_shadows,
          show_boxes: state.overlays.showBoxes,
          show_centers: state.overlays.showCenters,
          show_line: state.overlays.showLine,
          show_mask: state.overlays.showMask,
          is_paused: state.isPaused,
          playback_speed: state.playbackSpeed
        };

        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok && el.syncStatusBadge) {
          el.syncStatusBadge.textContent = '✓ Synced with OpenCV';
          el.syncStatusBadge.className = 'text-xs text-emerald-400 font-mono';
        }
      } catch (err) {
        if (el.syncStatusBadge) {
          el.syncStatusBadge.textContent = 'Offline (Local only)';
          el.syncStatusBadge.className = 'text-xs text-slate-400 font-mono';
        }
      }
    } else {
      if (el.syncStatusBadge) {
        el.syncStatusBadge.textContent = '✓ Active (Client Engine)';
        el.syncStatusBadge.className = 'text-xs text-emerald-400 font-mono';
      }
    }
  }

  function queueParamSync() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => syncParameters(true), 150);
  }

  // --- Export Data (CSV & JSON) ---
  function exportCSV() {
    if (state.eventsLog.length === 0) {
      alert('No crossing events to export yet.');
      return;
    }
    const headers = ['Event_ID', 'Vehicle_Class', 'Position_CX', 'Position_CY', 'Width_PX', 'Height_PX', 'Direction', 'Confidence', 'Timestamp'];
    const rows = state.eventsLog.map(e => [
      e.id,
      `"${e.class}"`,
      e.position.cx,
      e.position.cy,
      e.dimensions.w,
      e.dimensions.h,
      `"${e.direction || 'Downstream'}"`,
      e.confidence || 0.95,
      `"${e.timestamp}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `traffic_analytics_report_${stamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportJSON() {
    if (state.eventsLog.length === 0) {
      alert('No crossing events to export yet.');
      return;
    }
    const reportData = {
      generatedAt: new Date().toISOString(),
      pipeline: 'VisionTraffic AI OpenCV Vehicle Counter',
      summary: {
        totalVehiclesCount: state.counter,
        flowRateVPM: state.vpm,
        flowRateVPH: state.vph,
        trafficDensity: state.density,
        parameters: state.params
      },
      events: state.eventsLog
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `traffic_analytics_report_${stamp}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Snapshot Manager ---
  function captureSnapshot() {
    let dataUrl = '';
    if (state.mode === 'backend' && el.streamImg) {
      const c = document.createElement('canvas');
      c.width = el.streamImg.naturalWidth || 1280;
      c.height = el.streamImg.naturalHeight || 720;
      const ctx = c.getContext('2d');
      ctx.drawImage(el.streamImg, 0, 0, c.width, c.height);
      dataUrl = c.toDataURL('image/png');
    } else if (el.videoElement && el.canvasOverlay) {
      const c = document.createElement('canvas');
      c.width = state.resolution.width || 1280;
      c.height = state.resolution.height || 720;
      const ctx = c.getContext('2d');
      ctx.drawImage(el.videoElement, 0, 0, c.width, c.height);
      ctx.drawImage(el.canvasOverlay, 0, 0, c.width, c.height);
      dataUrl = c.toDataURL('image/png');
    }

    if (!dataUrl) return;

    el.snapshotImg.src = dataUrl;
    el.snapshotMeta.innerHTML = `
      <div class="space-y-1 text-slate-300 font-mono text-xs">
        <div><span class="text-slate-500">Timestamp:</span> ${new Date().toLocaleString()}</div>
        <div><span class="text-slate-500">Cumulative Count:</span> <span class="text-emerald-400 font-bold">${state.counter} vehicles</span></div>
        <div><span class="text-slate-500">Flow Rate:</span> ${state.vpm} VPM (${state.density} Traffic)</div>
        <div><span class="text-slate-500">Resolution:</span> ${state.resolution.width} × ${state.resolution.height} px</div>
      </div>
    `;

    el.snapshotModal.classList.remove('hidden');

    el.btnDownloadSnapshot.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `snapshot_vehicle_count_${state.counter}_${Date.now()}.png`;
      a.click();
    };
  }

  // --- Event Listeners & Bindings ---
  function setupEventListeners() {
    // Mode Switcher Button
    if (el.modeSwitcher) {
      el.modeSwitcher.addEventListener('click', () => {
        if (state.mode === 'backend') {
          setMode('standalone');
        } else {
          checkBackendConnection().then(connected => {
            if (!connected) {
              alert('Python Flask server is not responding at /api/stats. Please ensure "python app.py" is running.');
            }
          });
        }
      });
    }

    // Play / Pause
    if (el.btnPlayPause) {
      el.btnPlayPause.addEventListener('click', () => {
        state.isPaused = !state.isPaused;
        el.btnPlayPause.innerHTML = state.isPaused ? 
          '<i class="fa-solid fa-play text-emerald-400"></i>' : 
          '<i class="fa-solid fa-pause"></i>';
        
        if (state.mode === 'standalone' && el.videoElement) {
          if (state.isPaused) el.videoElement.pause();
          else el.videoElement.play();
        } else if (state.mode === 'backend') {
          fetch('/api/control', {
            method: 'POST',
            body: JSON.stringify({ action: state.isPaused ? 'pause' : 'play' })
          });
        }
      });
    }

    // Restart Loop
    if (el.btnRestart) {
      el.btnRestart.addEventListener('click', () => {
        if (state.mode === 'standalone' && el.videoElement) {
          el.videoElement.currentTime = 0;
          el.videoElement.play();
        } else if (state.mode === 'backend') {
          fetch('/api/control', {
            method: 'POST',
            body: JSON.stringify({ action: 'restart' })
          });
        }
      });
    }

    // Playback Speed
    if (el.selectSpeed) {
      el.selectSpeed.addEventListener('change', (e) => {
        state.playbackSpeed = parseFloat(e.target.value);
        if (el.videoElement) el.videoElement.playbackRate = state.playbackSpeed;
        queueParamSync();
      });
    }

    // Audio Alert Toggle
    if (el.btnAudioToggle) {
      el.btnAudioToggle.addEventListener('click', () => {
        state.audioAlerts = !state.audioAlerts;
        el.btnAudioToggle.innerHTML = state.audioAlerts ?
          '<i class="fa-solid fa-volume-high text-emerald-400"></i>' :
          '<i class="fa-solid fa-volume-xmark text-slate-500"></i>';
        el.btnAudioToggle.title = state.audioAlerts ? 'Crossing Audio Alerts: Enabled' : 'Crossing Audio Alerts: Disabled';
      });
    }

    // Snapshot Button
    if (el.btnSnapshot) {
      el.btnSnapshot.addEventListener('click', captureSnapshot);
    }
    if (el.btnCloseSnapshot) {
      el.btnCloseSnapshot.addEventListener('click', () => {
        el.snapshotModal.classList.add('hidden');
      });
    }

    // Fullscreen Toggle
    if (el.btnFullscreen) {
      el.btnFullscreen.addEventListener('click', () => {
        const container = el.videoPlayerContainer;
        if (!document.fullscreenElement) {
          container.requestFullscreen().catch(err => console.error(err));
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Overlay Toggles
    if (el.toggleBoxes) {
      el.toggleBoxes.addEventListener('change', (e) => {
        state.overlays.showBoxes = e.target.checked;
        queueParamSync();
      });
    }
    if (el.toggleCenters) {
      el.toggleCenters.addEventListener('change', (e) => {
        state.overlays.showCenters = e.target.checked;
        queueParamSync();
      });
    }
    if (el.toggleLine) {
      el.toggleLine.addEventListener('change', (e) => {
        state.overlays.showLine = e.target.checked;
        queueParamSync();
      });
    }
    if (el.toggleMask) {
      el.toggleMask.addEventListener('change', (e) => {
        state.overlays.showMask = e.target.checked;
        if (state.overlays.showMask) {
          el.pipContainer.classList.remove('hidden');
          if (state.mode === 'backend') {
            el.pipImg.classList.remove('hidden');
            el.pipCanvas.classList.add('hidden');
            el.pipImg.src = '/mask_feed?' + Date.now();
          } else {
            el.pipImg.classList.add('hidden');
            el.pipCanvas.classList.remove('hidden');
          }
        } else {
          el.pipContainer.classList.add('hidden');
        }
        queueParamSync();
      });
    }

    // Parameter Sliders & Number Inputs Bi-Directional Binding
    function bindSliderAndInput(slider, input, paramKey, minVal = 0, maxVal = 1080) {
      if (!slider || !input) return;
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        input.value = val;
        state.params[paramKey] = val;
        queueParamSync();
      });
      input.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = state.params[paramKey];
        val = Math.max(minVal, Math.min(maxVal, val));
        input.value = val;
        slider.value = val;
        state.params[paramKey] = val;
        queueParamSync();
      });
    }

    bindSliderAndInput(el.sliderLineY, el.inputLineY, 'count_line_position', 50, 1000);
    bindSliderAndInput(el.sliderMinWidth, el.inputMinWidth, 'min_width_react', 10, 300);
    bindSliderAndInput(el.sliderMinHeight, el.inputMinHeight, 'min_hieght_react', 10, 300);
    bindSliderAndInput(el.sliderOffset, el.inputOffset, 'offset', 1, 30);

    if (el.sliderHistory) {
      el.sliderHistory.addEventListener('input', (e) => {
        state.params.history = parseInt(e.target.value, 10);
        document.getElementById('val-history').textContent = e.target.value;
        queueParamSync();
      });
    }
    if (el.sliderVarThreshold) {
      el.sliderVarThreshold.addEventListener('input', (e) => {
        state.params.var_threshold = parseInt(e.target.value, 10);
        document.getElementById('val-var-threshold').textContent = e.target.value;
        queueParamSync();
      });
    }
    if (el.toggleShadows) {
      el.toggleShadows.addEventListener('change', (e) => {
        state.params.detect_shadows = e.target.checked;
        queueParamSync();
      });
    }

    // Quick Preset Selector
    if (el.presetSelector) {
      el.presetSelector.addEventListener('change', (e) => {
        const preset = e.target.value;
        if (preset === 'highway') {
          setParams({ count_line_position: 550, min_width_react: 80, min_hieght_react: 80, offset: 6, history: 500, var_threshold: 16 });
        } else if (preset === 'urban') {
          setParams({ count_line_position: 500, min_width_react: 60, min_hieght_react: 60, offset: 8, history: 400, var_threshold: 18 });
        } else if (preset === 'night') {
          setParams({ count_line_position: 550, min_width_react: 70, min_hieght_react: 70, offset: 10, history: 600, var_threshold: 25 });
        } else if (preset === 'sensitive') {
          setParams({ count_line_position: 550, min_width_react: 45, min_hieght_react: 45, offset: 5, history: 500, var_threshold: 12 });
        }
      });
    }

    // Quick Line Position Buttons
    document.querySelectorAll('.btn-quick-line').forEach(btn => {
      btn.addEventListener('click', () => {
        const yVal = parseInt(btn.getAttribute('data-y'), 10);
        if (!isNaN(yVal)) {
          state.params.count_line_position = yVal;
          if (el.sliderLineY) el.sliderLineY.value = yVal;
          if (el.inputLineY) el.inputLineY.value = yVal;
          queueParamSync();
        }
      });
    });

    // Interactive Click on Video to Set Line Position
    if (el.btnPickLine) {
      el.btnPickLine.addEventListener('click', () => {
        state.isPickingLine = !state.isPickingLine;
        if (state.isPickingLine) {
          el.linePickerBanner.classList.remove('hidden');
          el.videoPlayerContainer.classList.add('cursor-crosshair');
        } else {
          el.linePickerBanner.classList.add('hidden');
          el.videoPlayerContainer.classList.remove('cursor-crosshair');
        }
      });
    }

    if (el.videoPlayerContainer) {
      el.videoPlayerContainer.addEventListener('click', (e) => {
        if (!state.isPickingLine) return;
        const rect = el.videoPlayerContainer.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const scaleY = (state.resolution.height || 720) / rect.height;
        const mappedY = Math.round(clickY * scaleY);

        state.params.count_line_position = mappedY;
        if (el.sliderLineY) el.sliderLineY.value = mappedY;
        if (el.inputLineY) el.inputLineY.value = mappedY;

        state.isPickingLine = false;
        el.linePickerBanner.classList.add('hidden');
        el.videoPlayerContainer.classList.remove('cursor-crosshair');

        queueParamSync();
      });
    }

    // Reset Defaults
    if (el.btnResetDefaults) {
      el.btnResetDefaults.addEventListener('click', () => {
        setParams({ count_line_position: 550, min_width_react: 80, min_hieght_react: 80, offset: 6, history: 500, var_threshold: 16, detect_shadows: true });
      });
    }

    // Reset Counter
    if (el.btnResetCounter) {
      el.btnResetCounter.addEventListener('click', async () => {
        if (confirm('Reset vehicle counter and activity logs to 0?')) {
          state.counter = 0;
          state.eventsLog = [];
          recentCrossingTimestamps.length = 0;
          chartDataHistory.trafficCounts = chartDataHistory.trafficCounts.map(() => 0);
          chartDataHistory.classCounts = { 'Sedan / Car': 0, 'SUV / Van': 0, 'Truck / Bus': 0, 'Compact / Two-Wheeler': 0 };

          if (state.mode === 'backend') {
            await fetch('/api/reset', { method: 'POST' });
          }

          renderMetricsUI();
          renderActivityLogTable();
          updateCharts();
        }
      });
    }

    // Search & Filter Logs
    if (el.logSearchInput) {
      el.logSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderActivityLogTable();
      });
    }

    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => {
          p.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/50');
          p.classList.add('text-slate-400', 'border-slate-800');
        });
        pill.classList.remove('text-slate-400', 'border-slate-800');
        pill.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/50');
        state.filterClass = pill.getAttribute('data-class') || 'all';
        renderActivityLogTable();
      });
    });

    // Export Buttons
    if (el.btnExportCsv) el.btnExportCsv.addEventListener('click', exportCSV);
    if (el.btnExportJson) el.btnExportJson.addEventListener('click', exportJSON);
    if (el.btnClearLogs) {
      el.btnClearLogs.addEventListener('click', () => {
        if (confirm('Clear displayed crossing activity logs?')) {
          state.eventsLog = [];
          renderActivityLogTable();
        }
      });
    }
  }

  function setParams(newParams) {
    Object.assign(state.params, newParams);
    if (el.sliderLineY) el.sliderLineY.value = state.params.count_line_position;
    if (el.inputLineY) el.inputLineY.value = state.params.count_line_position;
    if (el.sliderMinWidth) el.sliderMinWidth.value = state.params.min_width_react;
    if (el.inputMinWidth) el.inputMinWidth.value = state.params.min_width_react;
    if (el.sliderMinHeight) el.sliderMinHeight.value = state.params.min_hieght_react;
    if (el.inputMinHeight) el.inputMinHeight.value = state.params.min_hieght_react;
    if (el.sliderOffset) el.sliderOffset.value = state.params.offset;
    if (el.inputOffset) el.inputOffset.value = state.params.offset;
    if (el.sliderHistory && state.params.history) {
      el.sliderHistory.value = state.params.history;
      document.getElementById('val-history').textContent = state.params.history;
    }
    if (el.sliderVarThreshold && state.params.var_threshold) {
      el.sliderVarThreshold.value = state.params.var_threshold;
      document.getElementById('val-var-threshold').textContent = state.params.var_threshold;
    }
    queueParamSync();
  }

  // --- Clock updater ---
  function startClock() {
    setInterval(() => {
      if (el.systemTime) {
        const d = new Date();
        el.systemTime.textContent = d.toLocaleTimeString() + ' UTC' + (d.getTimezoneOffset() <= 0 ? '+' : '-') + Math.abs(d.getTimezoneOffset() / 60);
      }
    }, 1000);
  }

  // --- Initialize App ---
  async function init() {
    setupEventListeners();
    initCharts();
    startClock();
    renderActivityLogTable();
    renderMetricsUI();

    // Check backend connection first
    const isBackend = await checkBackendConnection();
    if (!isBackend) {
      setMode('standalone');
    }

    // Set polling interval for backend
    setInterval(async () => {
      if (state.mode === 'backend') {
        await checkBackendConnection();
      }
    }, 400);

    // Periodic chart update every 4 seconds
    setInterval(updateCharts, 4000);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
