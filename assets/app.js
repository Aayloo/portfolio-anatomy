(() => {
  "use strict";

  const portfolio = window.PORTFOLIO_DATA;
  const history = window.MARKET_HISTORY;
  if (!portfolio || !history) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const weights = Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.weight]));
  const dates = history.dates;
  const lastIndex = dates.length - 1;

  function dateIndex(month) {
    const index = dates.indexOf(month);
    return index >= 0 ? index : lastIndex;
  }

  const state = {
    mode: "growth",
    range: "all",
    scenario: "all",
    selected: "SPY",
    playIndex: lastIndex,
    playing: false,
  };

  const modeCopy = {
    growth: {
      kicker: "Y / CUMULATIVE WEALTH",
      title: "Indexed growth through time",
      axis: "Y · WEALTH INDEX",
      note: "Every asset starts at 100 in January 2020. X is time, Y is cumulative wealth and Z separates the asset channels.",
    },
    returns: {
      kicker: "Y / MONTHLY RETURN",
      title: "Where the market gained or lost",
      axis: "Y · MONTHLY RETURN",
      note: "Bars rise above the zero plane for positive months and fall below it for negative months.",
    },
    drawdown: {
      kicker: "Y / DRAWDOWN",
      title: "How far each market fell from its peak",
      axis: "Y · DRAWDOWN",
      note: "The zero plane is a new high. Negative depth is distance below the previous peak.",
    },
    volatility: {
      kicker: "Y / REALIZED VOLATILITY",
      title: "When the market became unstable",
      axis: "Y · VOLATILITY",
      note: "Height is trailing 12-month realized volatility, annualized from monthly returns.",
    },
  };

  const scenarioCopy = {
    all: { start: 0, end: lastIndex, label: "Full history" },
    covid: { start: dateIndex("2020-01"), end: dateIndex("2020-12"), label: "2020 pandemic crash" },
    rates: { start: dateIndex("2022-01"), end: dateIndex("2022-12"), label: "2022 rate repricing" },
    recent: { start: Math.max(1, lastIndex - 11), end: lastIndex, label: "Latest 12 months" },
  };

  const els = {
    canvas: document.querySelector("#portfolio-canvas"),
    stage: document.querySelector("#three-stage"),
    fallback: document.querySelector("#webgl-fallback"),
    labels: document.querySelector("#asset-label-layer"),
    selector: document.querySelector("#asset-selector"),
    viewKicker: document.querySelector("#view-kicker"),
    viewTitle: document.querySelector("#view-title"),
    selectedName: document.querySelector("#selected-name"),
    selectedTicker: document.querySelector("#selected-ticker"),
    selectedSwatch: document.querySelector("#selected-swatch"),
    selectedWealth: document.querySelector("#selected-wealth"),
    selectedReturnMonth: document.querySelector("#selected-return-month"),
    selectedDrawdown: document.querySelector("#selected-drawdown"),
    selectedRisk: document.querySelector("#selected-risk"),
    selectedReturn: document.querySelector("#selected-return"),
    inspectorNote: document.querySelector("#inspector-note"),
    play: document.querySelector("#play-button"),
    resetCamera: document.querySelector("#reset-camera-button"),
    export: document.querySelector("#export-button"),
    toast: document.querySelector("#toast"),
    kpiYtd: document.querySelector("#kpi-ytd"),
    kpiVol: document.querySelector("#kpi-vol"),
    kpiVolNote: document.querySelector("#kpi-vol-note"),
    kpiDrawdown: document.querySelector("#kpi-drawdown"),
    kpiWindow: document.querySelector("#kpi-window"),
    kpiWindowNote: document.querySelector("#kpi-window-note"),
    weightChart: document.querySelector("#weight-chart"),
    riskChart: document.querySelector("#risk-chart"),
    stressChart: document.querySelector("#stress-chart"),
    returnChart: document.querySelector("#return-chart"),
    stressChartTitle: document.querySelector("#stress-chart-title"),
  };

  let toastTimer;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  function percent(value, digits = 1) {
    return `${(value * 100).toFixed(digits)}%`;
  }

  function signedPercent(value, digits = 1) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${Math.abs(value * 100).toFixed(digits)}%`;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function rollingVolatility(series, endIndex, window = 12) {
    const start = Math.max(1, endIndex - window + 1);
    const returns = series.returns.slice(start, endIndex + 1);
    if (returns.length < 2) return 0;
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance * 12);
  }

  function currentWindow() {
    return scenarioCopy[state.scenario];
  }

  function currentRangeStart() {
    if (state.range === "all") return 0;
    return Math.max(0, dates.length - Number(state.range));
  }

  function visibleEndIndex() {
    return state.playing ? state.playIndex : lastIndex;
  }

  const portfolioPath = dates.map((_, index) =>
    portfolio.assets.reduce(
      (sum, asset) => sum + weights[asset.id] * history.series[asset.id].wealth[index],
      0,
    ),
  );

  const portfolioDrawdownPath = (() => {
    let peak = 0;
    return portfolioPath.map((value) => {
      peak = Math.max(peak, value);
      return value / peak - 1;
    });
  })();

  function scenarioAssetReturns() {
    const { start, end } = currentWindow();
    const previous = Math.max(0, start - 1);
    return Object.fromEntries(
      portfolio.assets.map((asset) => {
        const series = history.series[asset.id].wealth;
        return [asset.id, series[end] / series[previous] - 1];
      }),
    );
  }

  function scenarioContributions() {
    const returns = scenarioAssetReturns();
    return Object.fromEntries(
      portfolio.assets.map((asset) => [asset.id, returns[asset.id] * weights[asset.id]]),
    );
  }

  function selectedAsset() {
    return portfolio.assets.find((asset) => asset.id === state.selected) || portfolio.assets[0];
  }

  function renderSelectors() {
    const end = visibleEndIndex();
    els.selector.innerHTML = portfolio.assets
      .map((asset) => {
        const series = history.series[asset.id];
        const value =
          state.mode === "returns"
            ? signedPercent(series.returns[end])
            : state.mode === "drawdown"
              ? signedPercent(series.drawdown[end])
              : state.mode === "volatility"
                ? percent(rollingVolatility(series, end))
                : `${series.wealth[end].toFixed(1)}`;
        return `<button type="button" data-asset-id="${asset.id}" aria-pressed="${asset.id === state.selected}"
          style="--asset-color:${asset.color}" class="${asset.id === state.selected ? "is-active" : ""}">
          <i aria-hidden="true"></i><span>${asset.name}</span><strong>${value}</strong>
        </button>`;
      })
      .join("");

    els.labels.innerHTML = portfolio.assets
      .map(
        (asset) =>
          `<button type="button" tabindex="-1" aria-hidden="true" data-label-id="${asset.id}"
            style="--asset-color:${asset.color}" class="${asset.id === state.selected ? "is-selected" : ""}">
            <strong>${asset.id}</strong>
          </button>`,
      )
      .join("");
  }

  function renderInspector() {
    const asset = selectedAsset();
    const series = history.series[asset.id];
    const end = visibleEndIndex();
    els.selectedName.textContent = asset.name;
    els.selectedTicker.textContent = `${asset.id} / ${dates[end]}`;
    els.selectedSwatch.style.background = asset.color;
    els.selectedWealth.textContent = series.wealth[end].toFixed(1);
    els.selectedReturnMonth.textContent = signedPercent(series.returns[end], 2);
    els.selectedDrawdown.textContent = signedPercent(Math.min(...series.drawdown.slice(0, end + 1)), 2);
    els.selectedRisk.textContent = signedPercent(asset.risk);
    els.selectedReturn.textContent = signedPercent(asset.returnContribution);
    els.inspectorNote.textContent = modeCopy[state.mode].note;
  }

  function renderBars(container, values, options = {}) {
    const entries = portfolio.assets.map((asset) => ({
      asset,
      value: Number(values[asset.id] || 0),
    }));
    const maxValue = Math.max(...entries.map((entry) => Math.abs(entry.value)), 0.01);
    container.innerHTML = entries
      .map(({ asset, value }) => {
        const width = Math.max(2, (Math.abs(value) / maxValue) * 100);
        const color = value < 0 && options.signed ? "var(--danger)" : asset.color;
        const display = options.signed ? signedPercent(value, options.digits ?? 1) : percent(value, options.digits ?? 1);
        return `<div class="bar-row">
          <label title="${asset.name}">${asset.id}</label>
          <div class="bar-track"><div class="bar-fill" style="--bar-width:${width}%;--bar-color:${color}"></div></div>
          <strong>${display}</strong>
        </div>`;
      })
      .join("");
  }

  function renderDiagnostics() {
    renderBars(els.weightChart, weights, { digits: 1 });
    renderBars(els.riskChart, Object.fromEntries(portfolio.assets.map((asset) => [asset.id, Math.max(0, asset.risk)])), {
      digits: 1,
    });
    renderBars(els.stressChart, scenarioContributions(), { signed: true, digits: 2 });
    renderBars(
      els.returnChart,
      Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.returnContribution])),
      { signed: true, digits: 2 },
    );
    els.stressChartTitle.textContent = currentWindow().label;
  }

  function renderNumbers() {
    const end = visibleEndIndex();
    const decemberIndex = dateIndex("2025-12");
    const ytd = portfolioPath[end] / portfolioPath[decemberIndex] - 1;
    const recentPath = portfolioPath.slice(Math.max(0, end - 36), end + 1);
    const recentReturns = recentPath.slice(1).map((value, index) => value / recentPath[index] - 1);
    const mean = recentReturns.reduce((sum, value) => sum + value, 0) / Math.max(1, recentReturns.length);
    const annualVolatility = Math.sqrt(
      (recentReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        Math.max(1, recentReturns.length - 1)) *
        12,
    );
    const maxDrawdown = Math.min(...portfolioDrawdownPath.slice(0, end + 1));
    const window = currentWindow();
    const windowReturn = portfolioPath[window.end] / portfolioPath[Math.max(0, window.start - 1)] - 1;
    els.kpiYtd.textContent = signedPercent(ytd, 2);
    els.kpiVol.textContent = percent(annualVolatility, 2);
    els.kpiVolNote.textContent = "Trailing 36 months";
    els.kpiDrawdown.textContent = signedPercent(maxDrawdown, 2);
    els.kpiWindow.textContent = signedPercent(windowReturn, 2);
    els.kpiWindowNote.textContent = window.label;
    els.play.textContent = state.playing ? "Pause market play" : "Play market history";
  }

  function syncUI() {
    const copy = modeCopy[state.mode];
    els.viewKicker.textContent = copy.kicker;
    els.viewTitle.textContent = copy.title;
    document.querySelectorAll("[data-view-mode]").forEach((button) => {
      const active = button.dataset.viewMode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-range]").forEach((button) => {
      const active = button.dataset.range === state.range;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-scenario]").forEach((button) => {
      const active = button.dataset.scenario === state.scenario;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderSelectors();
    renderInspector();
    renderDiagnostics();
    renderNumbers();
    updateThreeScene();
  }

  function setSelected(id) {
    if (!history.series[id]) return;
    state.selected = id;
    syncUI();
  }

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.viewMode;
      syncUI();
    });
  });

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.range = button.dataset.range;
      state.playIndex = lastIndex;
      state.playing = false;
      syncUI();
    });
  });

  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scenario = button.dataset.scenario;
      const selectedWindow = scenarioCopy[state.scenario];
      if (selectedWindow.end < currentRangeStart()) state.range = "all";
      syncUI();
    });
  });

  els.selector.addEventListener("click", (event) => {
    const button = event.target.closest("[data-asset-id]");
    if (button) setSelected(button.dataset.assetId);
  });

  els.labels.addEventListener("click", (event) => {
    const button = event.target.closest("[data-label-id]");
    if (button) setSelected(button.dataset.labelId);
  });

  document.querySelectorAll("[data-scroll-to]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.scrollTo}`)?.scrollIntoView({
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
    });
  });

  els.export.addEventListener("click", () => {
    const end = visibleEndIndex();
    const payload = {
      portfolio: "Multi-asset market terrain",
      asOf: history.asOf,
      mode: state.mode,
      range: state.range,
      scenario: state.scenario,
      selectedAsset: state.selected,
      visibleThrough: dates[end],
      weights,
      selectedSeries: history.series[state.selected],
      riskContribution: Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.risk])),
      source: history.source,
      boundary: "Research illustration only. Not investment advice.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "portfolio-anatomy-market-snapshot.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Market snapshot exported.");
  });

  let three = null;
  let playbackFrame = 0;

  function canUseWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(
        window.WebGLRenderingContext &&
          (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
      );
    } catch {
      return false;
    }
  }

  function textSprite(text, color = "#bac3c1", scale = 0.38) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = "700 24px Segoe UI, Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale * 4, scale, 1);
    return sprite;
  }

  function disposeGroup(group) {
    group.traverse((node) => {
      if (node.isSprite) {
        node.material?.map?.dispose?.();
        node.material?.dispose?.();
        return;
      }
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose?.());
      else node.material?.dispose?.();
    });
    group.clear();
  }

  function initThree() {
    if (!window.THREE || !canUseWebGL()) {
      els.fallback.hidden = false;
      els.canvas.hidden = true;
      return;
    }
    const renderer = new THREE.WebGLRenderer({
      canvas: els.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.4 : 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0f1517, 0.035);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(10.7, 7.2, 10.8);
    camera.lookAt(0, 1.3, 0);

    const group = new THREE.Group();
    group.rotation.y = -0.05;
    scene.add(group);

    scene.add(new THREE.HemisphereLight(0xd6eeea, 0x111719, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(5, 9, 6);
    scene.add(key);
    const accentLight = new THREE.DirectionalLight(0xea6a32, 0.8);
    accentLight.position.set(-5, 3, -7);
    scene.add(accentLight);

    const grid = new THREE.GridHelper(12, 24, 0x364345, 0x222b2d);
    group.add(grid);

    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x8c9897, transparent: true, opacity: 0.48 });
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-5.6, 0, -3.55),
          new THREE.Vector3(5.6, 0, -3.55),
        ]),
        axisMaterial,
      ),
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-5.6, -2.1, -3.55),
          new THREE.Vector3(-5.6, 6.5, -3.55),
        ]),
        axisMaterial,
      ),
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-5.6, 0, -3.55),
          new THREE.Vector3(-5.6, 0, 3.55),
        ]),
        axisMaterial,
      ),
    );

    const labelGroup = new THREE.Group();
    group.add(labelGroup);

    const scenarioPlane = new THREE.Mesh(
      new THREE.BoxGeometry(1, 7.5, 7.4),
      new THREE.MeshBasicMaterial({ color: 0xea6a32, transparent: true, opacity: 0.055, depthWrite: false }),
    );
    group.add(scenarioPlane);

    const playhead = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 7.2, 7.4),
      new THREE.MeshBasicMaterial({ color: 0xea6a32, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    group.add(playhead);

    const assets = portfolio.assets.map((asset, index) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(asset.color),
          transparent: true,
          opacity: asset.id === state.selected ? 1 : 0.55,
        }),
      );
      group.add(line);

      const curtain = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(asset.color),
          transparent: true,
          opacity: asset.id === state.selected ? 0.16 : 0.075,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      group.add(curtain);

      const barMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.085, 1, 0.16),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(asset.color),
          roughness: 0.42,
          metalness: 0.12,
          transparent: true,
          opacity: asset.id === state.selected ? 0.96 : 0.62,
        }),
        dates.length,
      );
      barMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      barMesh.userData.assetId = asset.id;
      group.add(barMesh);

      return { asset, index, line, curtain, barMesh };
    });

    three = {
      renderer,
      scene,
      camera,
      group,
      labelGroup,
      scenarioPlane,
      playhead,
      assets,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      dragging: false,
      moved: false,
      lastPointer: { x: 0, y: 0 },
      rotation: { x: -0.18, y: -0.05 },
      targetCamera: new THREE.Vector3(10.7, 7.2, 10.8),
      visible: true,
    };

    function resize() {
      const width = els.stage.clientWidth;
      const height = els.stage.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    new ResizeObserver(resize).observe(els.stage);
    resize();

    els.canvas.addEventListener("pointerdown", (event) => {
      three.dragging = true;
      three.moved = false;
      three.lastPointer = { x: event.clientX, y: event.clientY };
      els.canvas.setPointerCapture(event.pointerId);
    });
    els.canvas.addEventListener("pointermove", (event) => {
      if (!three.dragging) return;
      const dx = event.clientX - three.lastPointer.x;
      const dy = event.clientY - three.lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) three.moved = true;
      three.rotation.y += dx * 0.005;
      three.rotation.x = clamp(three.rotation.x + dy * 0.003, -0.65, 0.08);
      three.lastPointer = { x: event.clientX, y: event.clientY };
    });
    els.canvas.addEventListener("pointerup", (event) => {
      three.dragging = false;
      els.canvas.releasePointerCapture?.(event.pointerId);
    });
    els.canvas.addEventListener("pointercancel", () => {
      three.dragging = false;
    });
    els.canvas.addEventListener("click", (event) => {
      if (three.moved) return;
      const rect = els.canvas.getBoundingClientRect();
      three.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      three.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      three.raycaster.setFromCamera(three.pointer, camera);
      const hits = three.raycaster.intersectObjects(three.assets.map((item) => item.barMesh), false);
      const assetId = hits[0]?.object?.userData?.assetId;
      if (assetId) setSelected(assetId);
    });

    new IntersectionObserver((entries) => {
      three.visible = entries[0]?.isIntersecting ?? true;
    }).observe(els.stage);
    updateThreeScene();
  }

  function xPosition(index) {
    const start = currentRangeStart();
    const end = Math.max(start + 1, visibleEndIndex());
    return ((index - start) / Math.max(1, end - start)) * 10 - 5;
  }

  function zPosition(index) {
    return (index - (portfolio.assets.length - 1) / 2) * 0.78;
  }

  function metricValue(asset, index) {
    const series = history.series[asset.id];
    if (state.mode === "returns") return clamp(series.returns[index], -0.12, 0.12) * 18;
    if (state.mode === "drawdown") return clamp(series.drawdown[index], -0.45, 0) * 9.5;
    if (state.mode === "volatility") return rollingVolatility(series, index) * 15;
    return ((series.wealth[index] - 100) / 100) * 2.1;
  }

  function yAxisTicks() {
    if (state.mode === "returns") return [-10, -5, 0, 5, 10];
    if (state.mode === "drawdown") return [-40, -30, -20, -10, 0];
    if (state.mode === "volatility") return [0, 8, 16, 24, 32];
    return [-50, 0, 50, 100, 150, 200];
  }

  function yFromPercent(value) {
    if (state.mode === "returns") return value * 0.18;
    if (state.mode === "drawdown") return value * 0.095;
    if (state.mode === "volatility") return value * 0.15;
    return value * 0.021;
  }

  function updateAxisLabels() {
    disposeGroup(three.labelGroup);
    const yTicks = yAxisTicks();
    yTicks.forEach((value) => {
      const sprite = textSprite(
        state.mode === "returns" || state.mode === "drawdown"
          ? `${value > 0 ? "+" : ""}${value}%`
          : `${value}%`,
        value === 0 ? "#f6f4ec" : "#94a09f",
        0.26,
      );
      sprite.position.set(-6.1, yFromPercent(value), -3.58);
      three.labelGroup.add(sprite);
    });

    const visibleStart = currentRangeStart();
    const visibleEnd = visibleEndIndex();
    const years = dates
      .map((date, index) => ({ year: date.slice(0, 4), index }))
      .filter(
        (item, index, array) =>
          item.index >= visibleStart &&
          item.index <= visibleEnd &&
          (index === 0 || array[index - 1].year !== item.year),
      );
    years.forEach(({ year, index }) => {
      const sprite = textSprite(year, "#b8c0bf", 0.27);
      sprite.position.set(xPosition(index), -0.22, -3.7);
      three.labelGroup.add(sprite);
    });

    portfolio.assets.forEach((asset, index) => {
      const sprite = textSprite(asset.id, asset.id === state.selected ? "#ffffff" : "#94a09f", 0.29);
      sprite.position.set(-6.05, 0.12, zPosition(index));
      three.labelGroup.add(sprite);
    });

    const xLabel = textSprite("TIME →", "#ea6a32", 0.33);
    xLabel.position.set(5.6, 0.45, -3.72);
    three.labelGroup.add(xLabel);
    const yLabel = textSprite(modeCopy[state.mode].axis, "#ea6a32", 0.31);
    yLabel.position.set(-6.15, 6.1, -3.72);
    three.labelGroup.add(yLabel);
    const zLabel = textSprite("ASSET →", "#ea6a32", 0.31);
    zLabel.position.set(-6.05, 0.12, 3.4);
    three.labelGroup.add(zLabel);
  }

  function updateThreeScene() {
    if (!three) return;
    const start = currentRangeStart();
    const end = visibleEndIndex();
    const count = Math.max(2, end - start + 1);
    const dummy = new THREE.Object3D();
    const scenario = currentWindow();

    three.assets.forEach((item) => {
      const positions = [];
      const curtainPositions = [];
      const curtainIndices = [];

      for (let index = start; index <= end; index += 1) {
        const x = xPosition(index);
        const z = zPosition(item.index);
        const y = metricValue(item.asset, index);
        positions.push(x, y, z);
        curtainPositions.push(x, y, z, x, 0, z);
      }

      item.line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      item.line.geometry.setDrawRange(0, count);
      item.line.material.opacity = item.asset.id === state.selected ? 1 : 0.46;

      for (let index = 0; index < count - 1; index += 1) {
        const base = index * 2;
        curtainIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      item.curtain.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(curtainPositions, 3),
      );
      item.curtain.geometry.setIndex(curtainIndices);
      item.curtain.material.opacity =
        state.mode === "returns" ? 0 : item.asset.id === state.selected ? 0.17 : 0.07;

      item.barMesh.visible = state.mode === "returns";
      item.barMesh.count = count;
      for (let local = 0; local < count; local += 1) {
        const index = start + local;
        const value = history.series[item.asset.id].returns[index];
        const height = Math.max(0.008, Math.abs(value) * 18);
        dummy.position.set(
          xPosition(index),
          value >= 0 ? height / 2 : -height / 2,
          zPosition(item.index),
        );
        dummy.scale.set(item.asset.id === state.selected ? 1.25 : 0.9, height, 1);
        dummy.updateMatrix();
        item.barMesh.setMatrixAt(local, dummy.matrix);
      }
      item.barMesh.instanceMatrix.needsUpdate = true;
      item.barMesh.material.opacity = item.asset.id === state.selected ? 0.95 : 0.54;
    });

    const scenarioX1 = xPosition(Math.max(start, scenario.start));
    const scenarioX2 = xPosition(Math.min(end, scenario.end));
    const scenarioWidth = Math.max(0.08, Math.abs(scenarioX2 - scenarioX1));
    three.scenarioPlane.position.set((scenarioX1 + scenarioX2) / 2, 2, 0);
    three.scenarioPlane.scale.set(scenarioWidth, 1, 1);
    three.scenarioPlane.visible = state.scenario !== "all";
    three.playhead.visible = state.scenario !== "all";
    three.playhead.position.set(scenarioX2, 2, 0);
    updateAxisLabels();
  }

  function animateThree() {
    if (!three) return;
    requestAnimationFrame(animateThree);
    if (!three.visible) return;
    const speed = reduceMotion.matches ? 1 : 0.09;
    three.group.rotation.x += (three.rotation.x - three.group.rotation.x) * speed;
    three.group.rotation.y += (three.rotation.y - three.group.rotation.y) * speed;
    three.camera.position.lerp(three.targetCamera, speed);
    three.camera.lookAt(0, 1.25, 0);

    const rect = els.canvas.getBoundingClientRect();
    three.assets.forEach((item) => {
      const label = document.querySelector(`[data-label-id="${item.asset.id}"]`);
      if (!label) return;
      const end = visibleEndIndex();
      const position = new THREE.Vector3(
        xPosition(end),
        metricValue(item.asset, end),
        zPosition(item.index),
      );
      position.applyMatrix4(three.group.matrixWorld);
      position.project(three.camera);
      label.style.left = `${(position.x * 0.5 + 0.5) * rect.width}px`;
      label.style.top = `${(-position.y * 0.5 + 0.5) * rect.height}px`;
      label.style.opacity = String(Math.max(0.42, 1 - Math.max(0, position.z) * 0.4));
      label.classList.toggle("is-selected", item.asset.id === state.selected);
    });

    three.renderer.render(three.scene, three.camera);
  }

  function stopPlayback() {
    cancelAnimationFrame(playbackFrame);
    state.playing = false;
    els.play.textContent = "Play market history";
  }

  function playHistory() {
    if (state.playing) {
      stopPlayback();
      state.playIndex = lastIndex;
      syncUI();
      return;
    }
    const start = currentRangeStart();
    const duration = reduceMotion.matches ? 0 : 5200;
    const started = performance.now();
    state.playing = true;
    state.playIndex = start;
    els.play.textContent = "Pause market play";

    function tick(now) {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      state.playIndex = Math.round(start + (lastIndex - start) * progress);
      syncUI();
      if (progress < 1) {
        playbackFrame = requestAnimationFrame(tick);
      } else {
        state.playing = false;
        state.playIndex = lastIndex;
        els.play.textContent = "Play market history";
        syncUI();
      }
    }
    playbackFrame = requestAnimationFrame(tick);
  }

  els.play.addEventListener("click", playHistory);
  els.resetCamera.addEventListener("click", () => {
    if (!three) return;
    three.rotation = { x: -0.18, y: -0.05 };
    three.targetCamera.set(10.7, 7.2, 10.8);
    showToast("Camera reset.");
  });

  syncUI();
  initThree();
  if (three) animateThree();
})();
