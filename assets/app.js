(() => {
  "use strict";

  const portfolio = window.PORTFOLIO_DATA;
  if (!portfolio) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    mode: "capital",
    scenario: "base",
    correlation: 1,
    deRisk: false,
    selected: "SPY",
    compare: false,
    exploded: false,
    isolate: false,
  };

  const modeCopy = {
    capital: {
      kicker: "CAPITAL WEIGHT",
      title: "What the portfolio owns",
      note: "Module size follows capital weight. The assembly shows ownership, not movement.",
    },
    risk: {
      kicker: "RISK CONTRIBUTION",
      title: "What drives portfolio variance",
      note: "Distance from the core follows variance contribution. Capital and risk rarely rank the same.",
    },
    factor: {
      kicker: "FACTOR EXPOSURE",
      title: "Where the assets move together",
      note: "Connector intensity and vertical displacement show shared factor sensitivity rather than capital.",
    },
    liquidity: {
      kicker: "LIQUIDITY PROFILE",
      title: "What can be traded quickly",
      note: "Module finish and distance encode the illustrative liquidity profile at stressed execution.",
    },
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
    selectedWeight: document.querySelector("#selected-weight"),
    selectedRisk: document.querySelector("#selected-risk"),
    selectedFactor: document.querySelector("#selected-factor"),
    selectedLiquidity: document.querySelector("#selected-liquidity"),
    selectedReturn: document.querySelector("#selected-return"),
    selectedStress: document.querySelector("#selected-stress"),
    inspectorNote: document.querySelector("#inspector-note"),
    correlation: document.querySelector("#correlation-stress"),
    correlationValue: document.querySelector("#correlation-value"),
    compare: document.querySelector("#compare-button"),
    derisk: document.querySelector("#derisk-button"),
    explode: document.querySelector("#explode-button"),
    isolate: document.querySelector("#isolate-button"),
    reset: document.querySelector("#reset-button"),
    export: document.querySelector("#export-button"),
    toast: document.querySelector("#toast"),
    kpiReturn: document.querySelector("#kpi-return"),
    kpiVol: document.querySelector("#kpi-vol"),
    kpiVolNote: document.querySelector("#kpi-vol-note"),
    kpiDrawdown: document.querySelector("#kpi-drawdown"),
    kpiStress: document.querySelector("#kpi-stress"),
    kpiStressNote: document.querySelector("#kpi-stress-note"),
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

  function getWeights() {
    const weights = Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.weight]));
    if (!state.deRisk) return weights;
    const equityIds = new Set(["SPY", "VEA", "EEM"]);
    let cashAdded = 0;
    portfolio.assets.forEach((asset) => {
      if (equityIds.has(asset.id)) {
        const reduction = weights[asset.id] * 0.2;
        weights[asset.id] -= reduction;
        cashAdded += reduction;
      }
    });
    weights.BIL += cashAdded;
    return weights;
  }

  function getScenarioImpacts() {
    const scenario = portfolio.scenarios[state.scenario];
    return Object.fromEntries(
      portfolio.assets.map((asset) => [
        asset.id,
        (scenario.impacts[asset.id] || 0) * state.correlation,
      ]),
    );
  }

  function getPortfolioSnapshot() {
    const weights = getWeights();
    const impacts = getScenarioImpacts();
    const stressContributions = Object.fromEntries(
      portfolio.assets.map((asset) => [asset.id, weights[asset.id] * impacts[asset.id]]),
    );
    const scenarioLoss = Object.values(stressContributions).reduce((sum, value) => sum + value, 0);
    const annualReturn = portfolio.baseMetrics.annualReturn - (state.deRisk ? 0.0012 : 0);
    const annualVolatility =
      portfolio.baseMetrics.annualVolatility * (state.deRisk ? 0.955 : 1) * (1 + (state.correlation - 1) * 0.035);
    const maxDrawdown = portfolio.baseMetrics.maxDrawdown * (state.deRisk ? 0.94 : 1);
    return {
      weights,
      impacts,
      stressContributions,
      scenarioLoss,
      annualReturn,
      annualVolatility,
      maxDrawdown,
    };
  }

  function renderSelectors() {
    const weights = getWeights();
    const labelValues = Object.fromEntries(
      portfolio.assets.map((asset) => {
        if (state.mode === "risk") return [asset.id, signedPercent(asset.risk)];
        if (state.mode === "factor") return [asset.id, asset.factor.toFixed(2)];
        if (state.mode === "liquidity") return [asset.id, String(Math.round(asset.liquidity * 100))];
        return [asset.id, percent(weights[asset.id])];
      }),
    );
    els.selector.innerHTML = portfolio.assets
      .map(
        (asset) =>
          `<button type="button" data-asset-id="${asset.id}" aria-pressed="${asset.id === state.selected}"
            style="--asset-color:${asset.color}" class="${asset.id === state.selected ? "is-active" : ""}">
            <i aria-hidden="true"></i><span>${asset.name}</span><strong>${percent(weights[asset.id])}</strong>
          </button>`,
      )
      .join("");

    els.labels.innerHTML = portfolio.assets
      .map(
        (asset) =>
          `<button type="button" tabindex="-1" aria-hidden="true" data-label-id="${asset.id}"
            style="--asset-color:${asset.color}" class="${asset.id === state.selected ? "is-selected" : ""}">
            <strong>${asset.id}</strong><span>${labelValues[asset.id]}</span>
          </button>`,
      )
      .join("");
  }

  function selectedAsset() {
    return portfolio.assets.find((asset) => asset.id === state.selected) || portfolio.assets[0];
  }

  function renderInspector() {
    const asset = selectedAsset();
    const snapshot = getPortfolioSnapshot();
    els.selectedName.textContent = asset.name;
    els.selectedTicker.textContent = `${asset.id} / ${asset.group}`;
    els.selectedSwatch.style.background = asset.color;
    els.selectedWeight.textContent = percent(snapshot.weights[asset.id]);
    els.selectedRisk.textContent = signedPercent(asset.risk);
    els.selectedFactor.textContent = asset.factor.toFixed(2);
    els.selectedLiquidity.textContent = `${Math.round(asset.liquidity * 100)} / 100`;
    els.selectedReturn.textContent = signedPercent(asset.returnContribution);
    els.selectedStress.textContent =
      state.scenario === "base" ? "No active shock" : signedPercent(snapshot.stressContributions[asset.id]);
    els.inspectorNote.textContent =
      asset.id === "SPY"
        ? "The largest capital sleeve can still be a smaller risk source than a more volatile or correlated holding."
        : `${asset.name} contributes ${percent(Math.abs(asset.risk))} of portfolio variance in the frozen estimate.`;
  }

  function renderBars(container, values, options) {
    const entries = portfolio.assets.map((asset) => ({
      asset,
      value: Number(values[asset.id] || 0),
    }));
    const maxValue = Math.max(...entries.map((entry) => Math.abs(entry.value)), 0.01);
    container.innerHTML = entries
      .map(({ asset, value }) => {
        const width = Math.max(2, (Math.abs(value) / maxValue) * 100);
        const color = options.stress && value < 0 ? "var(--danger)" : asset.color;
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
    const snapshot = getPortfolioSnapshot();
    renderBars(els.weightChart, snapshot.weights, { digits: 1 });
    renderBars(els.riskChart, Object.fromEntries(portfolio.assets.map((asset) => [asset.id, Math.max(0, asset.risk)])), {
      digits: 1,
    });
    renderBars(els.stressChart, snapshot.stressContributions, { signed: true, stress: true, digits: 1 });
    renderBars(
      els.returnChart,
      Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.returnContribution])),
      { signed: true, digits: 1 },
    );
    els.stressChartTitle.textContent =
      state.scenario === "base" ? "No active scenario" : portfolio.scenarios[state.scenario].label;
  }

  function renderNumbers() {
    const snapshot = getPortfolioSnapshot();
    const scenario = portfolio.scenarios[state.scenario];
    els.kpiReturn.textContent = percent(snapshot.annualReturn, 2);
    els.kpiVol.textContent = percent(snapshot.annualVolatility, 2);
    els.kpiVolNote.textContent = state.deRisk ? "Interactive de-risk estimate" : "Current weight estimate";
    els.kpiDrawdown.textContent = percent(snapshot.maxDrawdown, 2);
    els.kpiStress.textContent = signedPercent(snapshot.scenarioLoss, 2);
    els.kpiStressNote.textContent = state.scenario === "base" ? "No active shock" : scenario.label;
    els.correlationValue.textContent = `${state.correlation.toFixed(2)}×`;
    els.compare.setAttribute("aria-pressed", String(state.compare));
    els.derisk.textContent = state.deRisk ? "Restore equity sleeves" : "De-risk equity sleeves 20%";
    els.explode.textContent = state.exploded ? "Collapse assembly" : "Explode assembly";
    els.explode.setAttribute("aria-pressed", String(state.exploded));
    els.isolate.textContent = state.isolate ? "Show all assets" : "Isolate selected asset";
    els.isolate.setAttribute("aria-pressed", String(state.isolate));
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
    els.inspectorNote.textContent = copy.note;
  }

  function setSelected(id) {
    if (!portfolio.assets.some((asset) => asset.id === id)) return;
    state.selected = id;
    renderSelectors();
    renderInspector();
    updateThreeScene();
  }

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.viewMode;
      syncUI();
    });
  });

  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scenario = button.dataset.scenario;
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

  els.correlation.addEventListener("input", () => {
    state.correlation = Number(els.correlation.value);
    syncUI();
  });

  els.compare.addEventListener("click", () => {
    state.compare = !state.compare;
    syncUI();
  });

  els.derisk.addEventListener("click", () => {
    state.deRisk = !state.deRisk;
    syncUI();
    showToast(state.deRisk ? "Equity sleeves reduced by 20%; proceeds assigned to Treasury bills." : "Portfolio restored.");
  });

  els.explode.addEventListener("click", () => {
    state.exploded = !state.exploded;
    syncUI();
  });

  els.isolate.addEventListener("click", () => {
    state.isolate = !state.isolate;
    syncUI();
  });

  els.reset.addEventListener("click", () => {
    Object.assign(state, {
      mode: "capital",
      scenario: "base",
      correlation: 1,
      deRisk: false,
      selected: "SPY",
      compare: false,
      exploded: false,
      isolate: false,
    });
    els.correlation.value = "1";
    syncUI();
    showToast("Portfolio view reset.");
  });

  document.querySelectorAll("[data-scroll-to]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.scrollTo}`)?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
    });
  });

  els.export.addEventListener("click", () => {
    const snapshot = getPortfolioSnapshot();
    const payload = {
      portfolio: "L1 multi-asset shadow portfolio",
      asOf: portfolio.asOf,
      mode: state.mode,
      scenario: state.scenario,
      correlationStress: state.correlation,
      deRiskApplied: state.deRisk,
      selectedAsset: state.selected,
      explodedView: state.exploded,
      isolatedAssetView: state.isolate,
      weights: snapshot.weights,
      varianceContribution: Object.fromEntries(portfolio.assets.map((asset) => [asset.id, asset.risk])),
      scenarioContribution: snapshot.stressContributions,
      metrics: {
        annualReturn: snapshot.annualReturn,
        annualVolatility: snapshot.annualVolatility,
        maxDrawdown: snapshot.maxDrawdown,
      },
      boundary: "Research illustration only. Not investment advice.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "portfolio-anatomy-snapshot.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Portfolio snapshot exported.");
  });

  let three = null;

  function canUseWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch {
      return false;
    }
  }

  function createModuleGeometry() {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    geometry.translate(0, 0.25, 0);
    return geometry;
  }

  function initThree() {
    if (!window.THREE || !canUseWebGL()) {
      els.fallback.hidden = false;
      els.canvas.hidden = true;
      return;
    }
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: els.canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.4 : 1.75));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0f1517, 0.055);

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 5.2, 8.8);
      camera.lookAt(0, 0.2, 0);

      const group = new THREE.Group();
      group.rotation.x = -0.28;
      scene.add(group);

      const hemi = new THREE.HemisphereLight(0xcce7e2, 0x111719, 1.6);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(5, 8, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xea6a32, 1.2);
      rim.position.set(-6, 4, -5);
      scene.add(rim);

      const grid = new THREE.GridHelper(13, 24, 0x2e3a3c, 0x222a2c);
      grid.position.y = -0.22;
      group.add(grid);

      const core = new THREE.Group();
      const coreMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.72, 1),
        new THREE.MeshStandardMaterial({
          color: 0x1e292b,
          roughness: 0.33,
          metalness: 0.72,
          flatShading: true,
          emissive: 0x0c1b1a,
        }),
      );
      core.add(coreMesh);
      const coreEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(coreMesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x7ecbc3, transparent: true, opacity: 0.38 }),
      );
      core.add(coreEdges);
      group.add(core);

      const ringPoints = [];
      for (let index = 0; index <= 80; index += 1) {
        const angle = (index / 80) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(Math.cos(angle) * 3.7, -0.15, Math.sin(angle) * 3.7));
      }
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(ringPoints),
        new THREE.LineBasicMaterial({ color: 0x536163, transparent: true, opacity: 0.35 }),
      );
      group.add(ring);

      const modules = portfolio.assets.map((asset, index) => {
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(asset.color),
          roughness: 0.32,
          metalness: 0.58,
          emissive: new THREE.Color(asset.color),
          emissiveIntensity: 0.04,
        });
        const mesh = new THREE.Mesh(createModuleGeometry(), material);
        mesh.userData.assetId = asset.id;
        mesh.userData.index = index;
        group.add(mesh);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: 0xe6e4dc, transparent: true, opacity: 0.22 }),
        );
        mesh.add(edges);

        const ghostMaterial = new THREE.MeshBasicMaterial({
          color: 0xe7e4dc,
          wireframe: true,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        });
        const ghost = new THREE.Mesh(createModuleGeometry(), ghostMaterial);
        ghost.visible = false;
        ghost.userData.assetId = asset.id;
        group.add(ghost);

        const connectorGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.2, 0),
          new THREE.Vector3(0, 0.2, 0),
        ]);
        const connector = new THREE.Line(
          connectorGeometry,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(asset.color),
            transparent: true,
            opacity: 0.24,
          }),
        );
        group.add(connector);

        return {
          asset,
          mesh,
          ghost,
          connector,
          targetPosition: new THREE.Vector3(),
          targetScale: new THREE.Vector3(1, 1, 1),
          targetColor: new THREE.Color(asset.color),
          targetConnectorOpacity: 0.24,
          targetOpacity: 1,
        };
      });

      three = {
        renderer,
        scene,
        camera,
        group,
        core,
        modules,
        raycaster: new THREE.Raycaster(),
        pointer: new THREE.Vector2(),
        rotation: { x: -0.28, y: 0.42 },
        dragging: false,
        moved: false,
        lastPointer: { x: 0, y: 0 },
        visible: true,
        frame: 0,
      };

      function resize() {
        const width = els.stage.clientWidth;
        const height = els.stage.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      }

      const observer = new ResizeObserver(resize);
      observer.observe(els.stage);
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
        three.rotation.y += dx * 0.006;
        three.rotation.x = Math.max(-0.9, Math.min(0.3, three.rotation.x + dy * 0.004));
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
        const hit = three.raycaster.intersectObjects(modules.map((module) => module.mesh), false)[0];
        if (hit?.object.userData.assetId) setSelected(hit.object.userData.assetId);
      });

      const visibilityObserver = new IntersectionObserver((entries) => {
        three.visible = entries[0]?.isIntersecting ?? true;
      });
      visibilityObserver.observe(els.stage);
      updateThreeScene();
    } catch {
      three = null;
      els.canvas.hidden = true;
      els.fallback.hidden = false;
    }
  }

  function updateThreeScene() {
    if (!three) return;
    const snapshot = getPortfolioSnapshot();
    three.modules.forEach((module, index) => {
      const asset = module.asset;
      const angle = (index / three.modules.length) * Math.PI * 2 + Math.PI / 8;
      const weight = snapshot.weights[asset.id];
      const riskMagnitude = Math.max(0, asset.risk);
      const normalizedWeight = weight / 0.21;
      const normalizedRisk = Math.min(1, riskMagnitude / 0.28);
      const normalizedFactor = Math.min(1, Math.abs(asset.factor));
      const scenarioContribution = snapshot.stressContributions[asset.id];
      let radius = 3.1;
      let height = 0;
      let scaleX = 0.65 + normalizedWeight * 1.1;
      let scaleZ = 0.68 + normalizedWeight * 0.45;
      let scaleY = 0.48 + normalizedWeight * 0.5;

      if (state.mode === "risk") {
        radius = 2.15 + normalizedRisk * 3.35;
        scaleX = 0.62 + normalizedRisk * 1.35;
        scaleZ = 0.66 + normalizedRisk * 0.5;
        scaleY = 0.45 + normalizedRisk * 0.55;
        height = normalizedRisk * 0.5;
      } else if (state.mode === "factor") {
        radius = 2.65 + normalizedFactor * 1.5;
        height = asset.factor * 1.5;
        scaleX = 0.72 + normalizedFactor * 0.8;
        scaleZ = 0.65 + normalizedFactor * 0.25;
        scaleY = 0.38 + normalizedFactor * 0.6;
      } else if (state.mode === "liquidity") {
        radius = 2.4 + (1 - asset.liquidity) * 5;
        scaleY = 0.38 + asset.liquidity * 1.1;
        height = (1 - asset.liquidity) * 0.7;
      }

      const shock = state.scenario === "base" ? 0 : Math.max(0, -scenarioContribution);
      radius += shock * 8.5;
      if (state.exploded) radius *= 1.42;
      height += shock * -2.8;
      module.targetPosition.set(Math.cos(angle) * radius, 0.25 + height, Math.sin(angle) * radius);
      module.targetScale.set(scaleX, scaleY, scaleZ);
      module.targetColor.set(
        state.scenario !== "base" && scenarioContribution < -0.015 ? (asset.id === state.selected ? "#f58c58" : "#ad5b42") : asset.color,
      );
      module.targetConnectorOpacity =
        state.mode === "factor" ? 0.15 + normalizedFactor * 0.7 : state.mode === "risk" ? 0.12 + normalizedRisk * 0.45 : 0.2;
      module.targetOpacity = state.isolate && asset.id !== state.selected ? 0.2 : 1;
      module.mesh.material.transparent = module.targetOpacity < 1;

      module.ghost.visible = state.compare;
      if (state.compare) {
        const policyWeight = portfolio.policyWeights[asset.id] || 0;
        const policyRadius = state.mode === "risk" ? radius : 3.1;
        module.ghost.position.set(
          Math.cos(angle) * policyRadius,
          0.25 + height * 0.6,
          Math.sin(angle) * policyRadius,
        );
        const policyScale = 0.65 + policyWeight / 0.21 * 1.1;
        module.ghost.scale.set(policyScale, 0.48 + policyWeight / 0.21 * 0.5, 0.68 + policyWeight / 0.21 * 0.45);
      }
    });
  }

  function animateThree() {
    if (!three) return;
    three.frame = requestAnimationFrame(animateThree);
    if (!three.visible) return;

    const instant = reduceMotion.matches;
    const speed = instant ? 1 : 0.11;
    three.group.rotation.x += (three.rotation.x - three.group.rotation.x) * speed;
    three.group.rotation.y += (three.rotation.y - three.group.rotation.y) * speed;
    three.core.rotation.y += instant ? 0 : 0.0015;

    three.modules.forEach((module) => {
      module.mesh.position.lerp(module.targetPosition, speed);
      module.mesh.scale.lerp(module.targetScale, speed);
      module.mesh.material.color.lerp(module.targetColor, speed);
      module.mesh.material.opacity += (module.targetOpacity - module.mesh.material.opacity) * speed;
      module.mesh.material.emissiveIntensity +=
        ((module.asset.id === state.selected ? 0.24 : 0.035) - module.mesh.material.emissiveIntensity) * speed;
      module.connector.material.opacity +=
        (module.targetConnectorOpacity - module.connector.material.opacity) * speed;

      const connectorPosition = module.connector.geometry.attributes.position;
      connectorPosition.setXYZ(0, 0, 0.2, 0);
      connectorPosition.setXYZ(1, module.mesh.position.x, module.mesh.position.y + 0.2, module.mesh.position.z);
      connectorPosition.needsUpdate = true;

      if (module.ghost.visible) {
        module.ghost.material.opacity = module.asset.id === state.selected ? 0.34 : 0.13;
      }
    });

    const rect = els.canvas.getBoundingClientRect();
    three.modules.forEach((module) => {
      const label = document.querySelector(`[data-label-id="${module.asset.id}"]`);
      if (!label) return;
      const position = module.mesh.position.clone();
      position.y += 0.7;
      position.applyMatrix4(three.group.matrixWorld);
      position.project(three.camera);
      const x = (position.x * 0.5 + 0.5) * rect.width;
      const y = (-position.y * 0.5 + 0.5) * rect.height;
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      label.style.opacity = String(Math.max(0.42, 1 - Math.abs(position.z) * 0.8));
      label.classList.toggle("is-selected", module.asset.id === state.selected);
    });

    three.renderer.render(three.scene, three.camera);
  }

  syncUI();
  initThree();
  if (three) animateThree();
})();
