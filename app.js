// ====== 定数・ユーティリティ ======
const SHIP_MASTER_STORAGE_KEY = "inui_ship_master_v1";

// 4海域の定義（ざっくりの緯度経度、必要に応じて後で調整）
const REGIONS = [
  {
    id: "west-pacific",
    name: "West-Pacific",
    // 東経120〜180、緯度 -60〜60 のイメージ
    bounds: { west: 120, east: 180, south: -60, north: 60 },
    center: [20, 150],
    zoom: 3
  },
  {
    id: "east-pacific",
    name: "East-Pacific",
    // 西経180〜-60（= -180〜-60）
    bounds: { west: -180, east: -60, south: -60, north: 60 },
    center: [20, -140],
    zoom: 3
  },
  {
    id: "atlantic",
    name: "Atlantic",
    // 西経 -60〜20
    bounds: { west: -60, east: 20, south: -60, north: 60 },
    center: [20, -20],
    zoom: 3
  },
  {
    id: "indian",
    name: "Indian",
    // 東経20〜120
    bounds: { west: 20, east: 120, south: -60, north: 30 },
    center: [0, 80],
    zoom: 3
  }
];

function loadShipMaster() {
  const json = localStorage.getItem(SHIP_MASTER_STORAGE_KEY);
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("マスタJSONパースエラー:", e);
    return [];
  }
}

function saveShipMaster(master) {
  localStorage.setItem(SHIP_MASTER_STORAGE_KEY, JSON.stringify(master));
}

function getNextShipId(master) {
  if (master.length === 0) return 1;
  const maxId = Math.max(...master.map((s) => s.id));
  return maxId + 1;
}

// 喫水から状態判定
function judgeCondition(currentDraft, fullDraft) {
  if (!currentDraft || !fullDraft) return "UNKNOWN";
  const ratio = currentDraft / fullDraft;
  if (ratio >= 0.7) return "LADEN";
  if (ratio <= 0.3) return "BALLAST";
  return "PARTLY";
}

function conditionToLabel(cond) {
  switch (cond) {
    case "LADEN":
      return "LADEN（積載）";
    case "BALLAST":
      return "BALLAST（バラスト）";
    case "PARTLY":
      return "PARTLY LADEN（部分積載）";
    default:
      return "不明";
  }
}

function conditionToBadgeClass(cond) {
  switch (cond) {
    case "LADEN":
      return "badge-laden";
    case "BALLAST":
      return "badge-ballast";
    case "PARTLY":
      return "badge-partly";
    default:
      return "badge-unknown";
  }
}

function getRegionForLatLng(lat, lng) {
  // lng を -180〜180 に正規化
  let lon = lng;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return REGIONS.find((r) => {
    return (
      lat >= r.bounds.south &&
      lat <= r.bounds.north &&
      lon >= r.bounds.west &&
      lon <= r.bounds.east
    );
  }) || null;
}

// ====== AISデータ取得（現状はダミー、あとでAISHubに差し替え） ======
let latestShipsFromAis = []; // 地図・リスト用の最新AIS＋マスタ結合結果

async function fetchAisData() {
  const master = loadShipMaster().filter((s) => s.active);

  // TODO: ここを AISHub API へ差し替える
  // 仮のダミーデータ：masterに位置などを適当に割り当て
  const now = new Date().toISOString();
  const dummy = master.map((m, index) => {
    const region = REGIONS[index % REGIONS.length];
    const baseLat = region.center[0] + (Math.random() - 0.5) * 20;
    const baseLng = region.center[1] + (Math.random() - 0.5) * 20;

    const fullDraft = m.fullDraft ? Number(m.fullDraft) : null;
    const currentDraft = fullDraft
      ? fullDraft * (0.3 + Math.random() * 0.7)
      : null;
    const condition = judgeCondition(currentDraft, fullDraft);

    return {
      id: m.id,
      name: m.name,
      manager: m.manager || "",
      mmsi: m.mmsi,
      imo: m.imo || "",
      flag: m.flag || "",
      fullDraft,
      currentDraft,
      condition,
      lat: baseLat,
      lng: baseLng,
      sog: Number((10 + Math.random() * 4).toFixed(1)),
      cog: Math.floor(Math.random() * 360),
      destination: "TBN",
      eta: "",
      lastUpdate: now
    };
  });

  latestShipsFromAis = dummy;
  renderShipListView();
  updateRegionCards();
  refreshMapMarkers();
}

// ====== ナビゲーション制御 ======
function initNavigation() {
  const buttons = document.querySelectorAll(".nav-button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewId = btn.getAttribute("data-view");
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchView(viewId);
    });
  });
}

function switchView(viewId) {
  const views = document.querySelectorAll(".view");
  views.forEach((v) => {
    v.classList.remove("active");
    if (v.id === viewId) {
      v.classList.add("active");
    }
  });

  if (viewId === "map-view") {
    // 地図表示が開かれたときにLeafletのリサイズを促す
    setTimeout(() => {
      if (mapInstance) {
        mapInstance.invalidateSize();
      }
    }, 100);
  }
}

// ====== リストビュー描画 ======
function renderShipListView() {
  const tbody = document.getElementById("ship-list-tbody");
  tbody.innerHTML = "";

  if (!latestShipsFromAis || latestShipsFromAis.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "表示対象の船がありません。マスタを確認してください。";
    tbody.appendChild(tr);
    tr.appendChild(td);
    return;
  }

  latestShipsFromAis.forEach((ship) => {
    const tr = document.createElement("tr");

    const condLabel = conditionToLabel(ship.condition);
    const ratioText =
      ship.currentDraft && ship.fullDraft
        ? ((ship.currentDraft / ship.fullDraft) * 100).toFixed(0) + "%"
        : "―";

    const destText = ship.destination || "―";
    const etaText = ship.eta || "―";

    tr.innerHTML = `
      <td>${ship.name}</td>
      <td>${ship.manager || ""}</td>
      <td>
        <span class="badge ${conditionToBadgeClass(ship.condition)}">
          ${condLabel}
        </span>
      </td>
      <td>${ratioText}</td>
      <td>${destText}</td>
      <td>${etaText}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ====== 海域サマリー & 地図 ======
let mapInstance = null;
let mapMarkersLayer = null;
let selectedRegionId = null;

function initRegionCards() {
  const grid = document.getElementById("region-grid");
  grid.innerHTML = "";

  REGIONS.forEach((region) => {
    const card = document.createElement("div");
    card.className = "region-card";
    card.setAttribute("data-region-id", region.id);
    card.innerHTML = `
      <div>
        <h3>${region.name}</h3>
        <div class="region-count" id="region-count-${region.id}">
          船舶数: 0
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      onRegionSelected(region.id);
    });
    grid.appendChild(card);
  });
}

function updateRegionCards() {
  REGIONS.forEach((region) => {
    const countElem = document.getElementById(`region-count-${region.id}`);
    if (!countElem) return;

    const count = latestShipsFromAis.filter((ship) => {
      if (ship.lat == null || ship.lng == null) return false;
      const regionObj = getRegionForLatLng(ship.lat, ship.lng);
      return regionObj && regionObj.id === region.id;
    }).length;

    countElem.textContent = `船舶数: ${count}`;
  });
}

function initMap() {
  const mapDiv = document.getElementById("map");
  mapInstance = L.map(mapDiv, {
    center: [10, 130],
    zoom: 2
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  mapMarkersLayer = L.layerGroup().addTo(mapInstance);
}

function onRegionSelected(regionId) {
  selectedRegionId = regionId;
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return;

  const mad = document.getElementById("map-and-details");
  mad.style.display = "flex";

  mapInstance.setView(region.center, region.zoom);
  mapInstance.invalidateSize();

  refreshMapMarkers();
}

function refreshMapMarkers() {
  if (!mapInstance || !mapMarkersLayer) return;
  mapMarkersLayer.clearLayers();

  if (!selectedRegionId) return;

  const region = REGIONS.find((r) => r.id === selectedRegionId);
  if (!region) return;

  const shipsInRegion = latestShipsFromAis.filter((ship) => {
    if (ship.lat == null || ship.lng == null) return false;
    const reg = getRegionForLatLng(ship.lat, ship.lng);
    return reg && reg.id === selectedRegionId;
  });

  shipsInRegion.forEach((ship) => {
    const marker = L.circleMarker([ship.lat, ship.lng], {
      radius: 6,
      weight: 1,
      fillOpacity: 0.9
    });
    marker.on("click", () => {
      showShipDetailsInMapPanel(ship);
    });
    marker.addTo(mapMarkersLayer);
  });

  // 1隻だけの場合などは自動で詳細を出してもよいが、今はクリック時だけにしておく
}

function showShipDetailsInMapPanel(ship) {
  const container = document.getElementById("map-ship-details-body");

  const currentDraftText = ship.currentDraft
    ? ship.currentDraft.toFixed(1) + " m"
    : "―";
  const fullDraftText = ship.fullDraft
    ? ship.fullDraft.toFixed(1) + " m"
    : "―";
  const ratioText =
    ship.currentDraft && ship.fullDraft
      ? ((ship.currentDraft / ship.fullDraft) * 100).toFixed(0) + "%"
      : "―";

  const condLabel = conditionToLabel(ship.condition);

  container.innerHTML = `
    <div><strong>船名:</strong> ${ship.name}</div>
    <div><strong>管理会社:</strong> ${ship.manager || "―"}</div>
    <div><strong>MMSI:</strong> ${ship.mmsi}</div>
    <div><strong>IMO:</strong> ${ship.imo || "―"}</div>
    <div><strong>状態:</strong> ${condLabel}</div>
    <div><strong>現在喫水:</strong> ${currentDraftText}</div>
    <div><strong>満載喫水:</strong> ${fullDraftText}</div>
    <div><strong>喫水比率:</strong> ${ratioText}</div>
    <div><strong>位置:</strong> ${ship.lat.toFixed(4)}, ${ship.lng.toFixed(4)}</div>
    <div><strong>SOG:</strong> ${ship.sog} kn</div>
    <div><strong>COG:</strong> ${ship.cog}°</div>
    <div><strong>Destination:</strong> ${ship.destination || "―"}</div>
    <div><strong>ETA:</strong> ${ship.eta || "―"}</div>
    <div><strong>AIS最終更新:</strong> ${ship.lastUpdate}</div>
  `;
}

// ====== マスタ管理ビュー ======
function renderMasterList() {
  const container = document.getElementById("master-list-body");
  const master = loadShipMaster();
  container.innerHTML = "";

  if (master.length === 0) {
    container.textContent = "登録された船舶がありません。右側フォームから追加してください。";
    return;
  }

  master.forEach((s) => {
    const div = document.createElement("div");
    div.className = "master-row";
    div.innerHTML = `
      <div><strong>${s.name}</strong> ${s.active ? "" : "（非表示）"}</div>
      <div style="font-size:11px; color:#4b5563;">
        MMSI: ${s.mmsi} / IMO: ${s.imo || "―"} / Flag: ${s.flag || "―"}
      </div>
      <div style="font-size:11px; color:#4b5563;">
        管理会社: ${s.manager || "―"} / 満載喫水: ${s.fullDraft || "―"} m
      </div>
      <div class="master-row-actions" style="margin-top:2px;">
        <button type="button" data-id="${s.id}" class="edit-ship-btn">編集</button>
        <button type="button" data-id="${s.id}" class="delete-ship-btn">削除</button>
      </div>
    `;
    container.appendChild(div);
  });

  // イベント紐付け
  container.querySelectorAll(".edit-ship-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      editShipMaster(id);
    });
  });

  container.querySelectorAll(".delete-ship-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      deleteShipMaster(id);
    });
  });
}

function editShipMaster(id) {
  const master = loadShipMaster();
  const ship = master.find((s) => s.id === id);
  if (!ship) return;

  document.getElementById("ship-id").value = ship.id;
  document.getElementById("ship-name").value = ship.name;
  document.getElementById("ship-mmsi").value = ship.mmsi;
  document.getElementById("ship-imo").value = ship.imo || "";
  document.getElementById("ship-flag").value = ship.flag || "";
  document.getElementById("ship-manager").value = ship.manager || "";
  document.getElementById("ship-full-draft").value =
    ship.fullDraft != null ? ship.fullDraft : "";
  document.getElementById("ship-active").checked = !!ship.active;
}

function deleteShipMaster(id) {
  if (!confirm("この船舶マスタを削除しますか？")) return;
  const master = loadShipMaster();
  const updated = master.filter((s) => s.id !== id);
  saveShipMaster(updated);
  renderMasterList();
  // AISデータ再取得
  fetchAisData();
}

function clearShipForm() {
  document.getElementById("ship-id").value = "";
  document.getElementById("ship-name").value = "";
  document.getElementById("ship-mmsi").value = "";
  document.getElementById("ship-imo").value = "";
  document.getElementById("ship-flag").value = "";
  document.getElementById("ship-manager").value = "";
  document.getElementById("ship-full-draft").value = "";
  document.getElementById("ship-active").checked = true;
}

function initShipMasterForm() {
  const form = document.getElementById("ship-master-form");
  const resetBtn = document.getElementById("ship-form-reset");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const idValue = document.getElementById("ship-id").value;
    const name = document.getElementById("ship-name").value.trim();
    const mmsi = document.getElementById("ship-mmsi").value.trim();
    const imo = document.getElementById("ship-imo").value.trim();
    const flag = document.getElementById("ship-flag").value.trim();
    const manager = document.getElementById("ship-manager").value.trim();
    const fullDraftStr = document.getElementById("ship-full-draft").value.trim();
    const active = document.getElementById("ship-active").checked;

    if (!name || !mmsi) {
      alert("表示名とMMSIは必須です。");
      return;
    }

    let fullDraft = null;
    if (fullDraftStr) {
      fullDraft = Number(fullDraftStr);
    }

    let master = loadShipMaster();

    if (idValue) {
      const id = Number(idValue);
      master = master.map((s) =>
        s.id === id
          ? {
              ...s,
              name,
              mmsi,
              imo,
              flag,
              manager,
              fullDraft,
              active
            }
          : s
      );
    } else {
      const newId = getNextShipId(master);
      const newShip = {
        id: newId,
        name,
        mmsi,
        imo,
        flag,
        manager,
        fullDraft,
        active
      };
      master = [...master, newShip];
    }

    saveShipMaster(master);
    clearShipForm();
    renderMasterList();
    fetchAisData();
  });

  resetBtn.addEventListener("click", () => {
    clearShipForm();
  });
}

// ====== 初期化 ======
window.addEventListener("load", () => {
  initNavigation();
  initRegionCards();
  initMap();
  initShipMasterForm();
  renderMasterList();

  // 初回にマスタが空ならサンプル1〜2隻入れてもよい
  if (loadShipMaster().length === 0) {
    const initial = [
      {
        id: 1,
        name: "INUI BULKER NO.1",
        mmsi: "431234567",
        imo: "9876543",
        flag: "Panama",
        manager: "INUI SHIP MANAGEMENT",
        fullDraft: 13.0,
        active: true
      },
      {
        id: 2,
        name: "INUI HANDY NO.2",
        mmsi: "431234568",
        imo: "9876544",
        flag: "Panama",
        manager: "INUI SHIP MANAGEMENT",
        fullDraft: 12.5,
        active: true
      }
    ];
    saveShipMaster(initial);
    renderMasterList();
  }

  // AISデータ取得（ダミー）
  fetchAisData();

  // しばらくの間、一定間隔で再取得（後で間隔調整）
  setInterval(fetchAisData, 5 * 60 * 1000); // 5分
});
