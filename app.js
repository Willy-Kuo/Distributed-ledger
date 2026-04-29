const NODE_PORTS = [
  { id: "node1", port: "8001" },
  { id: "node2", port: "8002" },
  { id: "node3", port: "8003" },
];

const DEFAULT_PUBLIC_NODES = {
  node1: "https://continues-expression-excessive-flexible.trycloudflare.com",
  node2: "https://stopping-environmental-hay-attacks.trycloudflare.com",
  node3: "https://oecd-murphy-crew-letters.trycloudflare.com",
};

function getApiHost() {
  const params = new URLSearchParams(window.location.search);
  return params.get("apiHost") || window.location.hostname || "localhost";
}

function getApiProtocol() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("apiProtocol") || "http").replace(/:$/, "");
}

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function shouldUseDefaultPublicNodes() {
  const host = window.location.hostname;
  return host.endsWith("github.io") || host.endsWith("trycloudflare.com");
}

const API_HOST = getApiHost();
const API_PROTOCOL = getApiProtocol();
const URL_PARAMS = new URLSearchParams(window.location.search);
const NODES = NODE_PORTS.map((node) => ({
  ...node,
  origin:
    normalizeOrigin(URL_PARAMS.get(node.id)) ||
    (shouldUseDefaultPublicNodes() ? DEFAULT_PUBLIC_NODES[node.id] : "") ||
    `${API_PROTOCOL}://${API_HOST}:${node.port}`,
}));

const resultOutput = document.getElementById("result-output");
const resultVisual = document.getElementById("result-visual");
const resultStatus = document.getElementById("result-status");
const heroNode = document.getElementById("hero-node");
const txIdInput = document.getElementById("tx-id-input");
const nodeGrid = document.getElementById("node-grid");
const nodeTabs = document.getElementById("node-tabs");
const clusterCaption = document.getElementById("cluster-caption");

let activeNodeId = nodeIdFromLocation() || "node1";

function nodeIdFromLocation() {
  const portMap = { 8001: "node1", 8002: "node2", 8003: "node3" };
  return portMap[window.location.port] || null;
}

function getNode(nodeId = activeNodeId) {
  return NODES.find((node) => node.id === nodeId) || NODES[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHash(value) {
  if (!value) return "-";
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function renderJson(payload) {
  resultOutput.textContent = JSON.stringify(payload, null, 2);
}

function setStatus(text, isError = false) {
  resultStatus.textContent = text;
  resultStatus.style.color = isError ? "#a63f1f" : "";
}

function setVisual(html) {
  resultVisual.innerHTML = html || '<div class="empty-state">沒有可視化資料。</div>';
}

function metric(label, value, tone = "") {
  return `
    <div class="visual-metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatValue(value))}</strong>
    </div>
  `;
}

function badge(text, tone = "") {
  return `<span class="status-badge ${tone}">${escapeHtml(text)}</span>`;
}

function table(rows, columns, emptyText = "沒有資料") {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const raw = typeof column.value === "function" ? column.value(row) : row[column.key];
          return `<td>${escapeHtml(formatValue(raw))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function signedAmountText(amount) {
  return Number.isInteger(amount) ? `${amount}.0` : String(amount);
}

function signTransaction(sender, recipient, amount, privateKeyPem) {
  if (!privateKeyPem.trim()) {
    return null;
  }
  if (!window.forge) {
    throw new Error("RSA 簽章函式庫尚未載入，請檢查網路連線。");
  }
  const privateKey = window.forge.pki.privateKeyFromPem(privateKeyPem);
  const digest = window.forge.md.sha256.create();
  digest.update(`${sender},${recipient},${signedAmountText(amount)}`, "utf8");
  return window.forge.util.bytesToHex(privateKey.sign(digest));
}

function txColumns() {
  return [
    { label: "時間", value: (row) => row.timestamp || row.created_at },
    { label: "類型", key: "type" },
    { label: "付款方", key: "from" },
    { label: "收款方", key: "to" },
    { label: "金額", key: "amount" },
    { label: "狀態", key: "status" },
    { label: "區塊", value: (row) => row.block_id || row.block_file },
  ];
}

function nodeStatusCards(nodes = []) {
  return `
    <div class="visual-card-grid">
      ${nodes
        .map(
          (node) => `
            <article class="visual-card">
              <div class="visual-card-head">
                <h3>${escapeHtml(node.node_id)}</h3>
                ${badge(node.online === false ? "離線" : "可用", node.online === false ? "bad" : "ok")}
              </div>
              <div class="mini-metrics">
                ${metric("區塊數", node.block_count ?? "-")}
                ${metric("Pending", node.pending_count ?? "-")}
                ${metric("最後區塊", node.last_block_id ?? "-")}
              </div>
              <dl class="visual-list">
                <div><dt>同步來源</dt><dd>${escapeHtml(node.last_sync_source || "-")}</dd></div>
                <div><dt>最後 Hash</dt><dd title="${escapeHtml(node.last_block_hash || "")}">${escapeHtml(shortHash(node.last_block_hash))}</dd></div>
              </dl>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderClusterVisual(payload) {
  const nodes = payload.cluster_status?.nodes || payload.nodes || [];
  const health = payload.online_nodes || [];
  const onlineCount = health.length ? health.filter((node) => node.online).length : nodes.length;
  const consistent = payload.consistency?.consistent;
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("操作節點", payload.active_node || payload.handled_by || activeNodeId)}
        ${metric("線上", `${onlineCount}/${NODES.length}`, onlineCount === NODES.length ? "ok" : "warn")}
        ${metric("最高區塊數", Math.max(0, ...nodes.map((node) => node.block_count || 0)))}
        ${metric("一致", consistent === undefined ? "-" : consistent ? "是" : "否", consistent ? "ok" : "bad")}
      </div>
      ${nodeStatusCards(nodes)}
    </div>
  `;
}

function renderConsistencyVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("處理節點", payload.handled_by || activeNodeId)}
        ${metric("一致", payload.consistent ? "是" : "否", payload.consistent ? "ok" : "bad")}
        ${metric("參考 Hash 數", payload.reference_hashes?.length || 0)}
      </div>
      ${nodeStatusCards(payload.nodes || [])}
    </div>
  `;
}

function renderBalanceVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("帳戶", payload.account)}
        ${metric("餘額", payload.balance)}
        ${metric("節點", payload.node_id || payload.handled_by || activeNodeId)}
      </div>
    </div>
  `;
}

function renderAccountCreateVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("帳戶", payload.username)}
        ${metric("初始餘額", payload.initial_balance)}
        ${metric("節點", payload.handled_by || activeNodeId)}
        ${metric("Pending", payload.pending_count ?? "-")}
      </div>
      <div class="success-note">帳戶已建立。請從帳戶面板複製並妥善保存私鑰。</div>
    </div>
  `;
}

function renderTransactionVisual(payload) {
  const tx = payload.transaction || payload.reward_transaction || {};
  const syncRows = payload.sync_results || [];
  const autoBlock = payload.auto_created_block || payload.reward_created_block || payload.auto_block;
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("處理節點", payload.handled_by || activeNodeId)}
        ${metric("Pending", payload.pending_count ?? "-")}
        ${metric("自動區塊", autoBlock ? autoBlock.block_id : "-")}
      </div>
      ${table([tx], [
        { label: "tx_id", key: "tx_id" },
        { label: "付款方", key: "from" },
        { label: "收款方", key: "to" },
        { label: "金額", key: "amount" },
        { label: "類型", key: "type" },
      ])}
      <h3 class="visual-subhead">同步結果</h3>
      ${table(syncRows, [
        { label: "Peer", key: "peer" },
        { label: "狀態", key: "status" },
        { label: "錯誤", key: "error" },
      ], "沒有同步資料")}
    </div>
  `;
}

function renderChainCheckVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("處理節點", payload.handled_by || activeNodeId)}
        ${metric("有效", payload.valid ? "是" : "否", payload.valid ? "ok" : "bad")}
        ${metric("檢查起點", payload.checked_from_block)}
        ${metric("檢查終點", payload.checked_to_block)}
      </div>
      ${
        payload.errors?.length
          ? `<div class="alert-list">${payload.errors.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>`
          : '<div class="success-note">沒有發現鏈錯誤。</div>'
      }
      ${payload.reward_transaction ? renderTransactionVisual({ ...payload, transaction: payload.reward_transaction }) : ""}
    </div>
  `;
}

function renderLeaderboardVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("節點", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("筆數", payload.leaderboard?.length || 0)}
      </div>
      ${table(payload.leaderboard || [], [
        { label: "帳戶", key: "account" },
        { label: "餘額", key: "balance" },
      ], "沒有排行榜資料")}
    </div>
  `;
}

function renderOperationsVisual(payload) {
  const rows = [...(payload.entries || [])].reverse();
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("節點", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("筆數", payload.entries?.length || 0)}
      </div>
      ${table(rows, [
        { label: "時間", key: "timestamp" },
        { label: "節點", key: "node_id" },
        { label: "事件", key: "event" },
        { label: "內容", value: (row) => JSON.stringify(row.payload || {}) },
      ], "沒有操作紀錄")}
    </div>
  `;
}

function renderTxSearchVisual(payload) {
  const rows = payload.matches || [];
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("tx_id", payload.tx_id)}
        ${metric("找到", payload.found ? "是" : "否", payload.found ? "ok" : "bad")}
        ${metric("符合筆數", rows.length)}
      </div>
      ${table(rows, [
        { label: "節點", key: "node_id" },
        { label: "狀態", key: "status" },
        { label: "區塊", value: (row) => row.block_id || row.block_file },
        { label: "付款方", key: "from" },
        { label: "收款方", key: "to" },
        { label: "金額", key: "amount" },
      ], "沒有符合的交易")}
    </div>
  `;
}

function renderChainVisual(payload) {
  const blocks = payload.blocks || [];
  const transactions = blocks.flatMap((block) =>
    (block.transactions || []).map((tx) => ({
      ...tx,
      block_id: block.block_id,
      status: "confirmed",
    })),
  );
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("節點", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("區塊數", blocks.length)}
        ${metric("Pending", payload.pending_transactions?.length || 0)}
        ${metric("資料目錄", payload.data_dir || "-")}
      </div>
      <div class="chain-strip">
        ${blocks
          .map(
            (block) => `
              <article class="block-card">
                <strong>#${escapeHtml(block.block_id)}</strong>
                <span>${escapeHtml((block.transactions || []).length)} 筆交易</span>
                <code title="${escapeHtml(block.block_hash || "")}">${escapeHtml(shortHash(block.block_hash))}</code>
              </article>
            `,
          )
          .join("")}
      </div>
      <h3 class="visual-subhead">已確認交易</h3>
      ${table(transactions, txColumns(), "沒有已確認交易")}
    </div>
  `;
}

function renderLogVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("帳戶", payload.account)}
        ${metric("交易數", payload.transactions?.length || 0)}
        ${metric("節點", payload.node_id || activeNodeId)}
      </div>
      ${table(payload.transactions || [], txColumns(), "此帳戶沒有交易紀錄")}
    </div>
  `;
}

function renderHealthVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("線上", `${(payload.nodes || []).filter((node) => node.online).length}/${NODES.length}`)}
      </div>
      <div class="visual-card-grid">
        ${(payload.nodes || [])
          .map(
            (node) => `
              <article class="visual-card">
                <div class="visual-card-head">
                  <h3>${escapeHtml(node.node_id)}</h3>
                  ${badge(node.online ? "線上" : "離線", node.online ? "ok" : "bad")}
                </div>
                <dl class="visual-list">
                  <div><dt>訊息</dt><dd>${escapeHtml(node.error || node.payload?.status || "ok")}</dd></div>
                </dl>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderVisual(payload) {
  if (!payload || typeof payload !== "object") {
    setVisual("");
    return;
  }
  if (payload.error) {
    setVisual(`<div class="alert-list"><div>${escapeHtml(payload.error)}</div></div>`);
  } else if (payload.cluster_status || (Array.isArray(payload.nodes) && payload.consistency)) {
    setVisual(renderClusterVisual(payload));
  } else if (Array.isArray(payload.nodes) && payload.nodes.some((node) => "online" in node)) {
    setVisual(renderHealthVisual(payload));
  } else if ("consistent" in payload && Array.isArray(payload.nodes)) {
    setVisual(renderConsistencyVisual(payload));
  } else if ("balance" in payload && "account" in payload) {
    setVisual(renderBalanceVisual(payload));
  } else if ("private_key_pem" in payload && "username" in payload) {
    setVisual(renderAccountCreateVisual(payload));
  } else if (Array.isArray(payload.transactions) && "account" in payload) {
    setVisual(renderLogVisual(payload));
  } else if (payload.transaction || payload.reward_transaction) {
    setVisual(renderTransactionVisual(payload));
  } else if ("valid" in payload && Array.isArray(payload.errors)) {
    setVisual(renderChainCheckVisual(payload));
  } else if (Array.isArray(payload.leaderboard)) {
    setVisual(renderLeaderboardVisual(payload));
  } else if (Array.isArray(payload.entries)) {
    setVisual(renderOperationsVisual(payload));
  } else if ("found" in payload && Array.isArray(payload.matches)) {
    setVisual(renderTxSearchVisual(payload));
  } else if (Array.isArray(payload.blocks)) {
    setVisual(renderChainVisual(payload));
  } else {
    setVisual(`<div class="empty-state">這個回應沒有專用視覺化，請查看下方 Raw JSON。</div>`);
  }
}

function renderResult(payload) {
  renderJson(payload);
  renderVisual(payload);
}

async function callNode(nodeId, path, options = {}) {
  const node = getNode(nodeId);
  const response = await fetch(`${node.origin}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `${node.id} HTTP ${response.status}`);
  }
  return data;
}

async function callActive(path, options = {}) {
  return callNode(activeNodeId, path, options);
}

async function runAction(label, task) {
  setStatus(`${label}執行中...`);
  try {
    const payload = await task();
    renderResult(payload);
    const latestTxId = payload?.transaction?.tx_id || payload?.reward_transaction?.tx_id;
    if (latestTxId) {
      txIdInput.value = latestTxId;
    }
    setStatus(`${label}完成`);
    return payload;
  } catch (error) {
    const payload = { error: error.message };
    renderResult(payload);
    setStatus(`${label}失敗`, true);
    throw error;
  }
}

function setActiveNode(nodeId) {
  activeNodeId = nodeId;
  heroNode.textContent = nodeId;
  renderNodeTabs();
}

function renderNodeTabs() {
  nodeTabs.innerHTML = "";
  for (const node of NODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = node.id === activeNodeId ? "node-tab active" : "node-tab";
    button.textContent = node.id;
    button.setAttribute("aria-pressed", String(node.id === activeNodeId));
    button.addEventListener("click", () => setActiveNode(node.id));
    nodeTabs.appendChild(button);
  }
}

function updateQuickLinks() {
  for (const link of document.querySelectorAll("[data-node-link]")) {
    const node = getNode(link.dataset.nodeLink);
    link.href = node.origin;
  }
}

function renderNodeCards(healthResults, statusNodes) {
  const statusByNode = new Map(statusNodes.map((node) => [node.node_id, node]));
  nodeGrid.innerHTML = "";

  for (const health of healthResults) {
    const status = statusByNode.get(health.node_id) || {};
    const card = document.createElement("article");
    card.className = `node-card ${health.online ? "online" : "offline"}`;
    card.innerHTML = `
      <div class="node-card-head">
        <div>
          <h3>${escapeHtml(health.node_id)}</h3>
          <span>${escapeHtml(health.online ? "online" : "offline")}</span>
        </div>
        <button class="mini-button" type="button" data-node="${escapeHtml(health.node_id)}">使用</button>
      </div>
      <dl>
        <div>
          <dt>區塊數</dt>
          <dd>${escapeHtml(status.block_count ?? "-")}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>${escapeHtml(status.pending_count ?? "-")}</dd>
        </div>
        <div>
          <dt>同步來源</dt>
          <dd>${escapeHtml(status.last_sync_source ?? "-")}</dd>
        </div>
        <div>
          <dt>最後 Hash</dt>
          <dd title="${escapeHtml(status.last_block_hash || "")}">${escapeHtml(shortHash(status.last_block_hash))}</dd>
        </div>
      </dl>
    `;
    card.querySelector("button").addEventListener("click", () => setActiveNode(health.node_id));
    nodeGrid.appendChild(card);
  }
}

async function getHealthResults() {
  const checks = await Promise.allSettled(
    NODES.map(async (node) => {
      const payload = await callNode(node.id, "/health");
      return { node_id: node.id, online: true, payload };
    }),
  );

  return checks.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : { node_id: NODES[index].id, online: false, error: result.reason.message },
  );
}

async function refreshSummary() {
  const healthResults = await getHealthResults();
  const onlineCount = healthResults.filter((node) => node.online).length;
  const status = await callActive("/status");
  const consistency = await callActive("/status/consistency");
  const statusNodes = status.nodes || [];

  document.getElementById("summary-online").textContent = `${onlineCount}/3`;
  document.getElementById("summary-node-count").textContent = String(statusNodes.length || 3);
  document.getElementById("summary-block-count").textContent = String(
    Math.max(0, ...statusNodes.map((node) => node.block_count || 0)),
  );
  document.getElementById("summary-consistency").textContent = consistency.consistent ? "一致" : "不一致";
  clusterCaption.textContent = `由 ${status.handled_by || activeNodeId} 回報，更新時間 ${new Date().toLocaleTimeString()}`;

  renderNodeCards(healthResults, statusNodes);
  return {
    active_node: activeNodeId,
    online_nodes: healthResults,
    cluster_status: status,
    consistency,
  };
}

async function refreshAfterMutation(payload) {
  await refreshSummary();
  return payload;
}

document.getElementById("create-account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("建立帳戶", async () => {
    const payload = await callActive("/account/create", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        initial_balance: Number(form.get("initial_balance")),
      }),
    });
    if (payload.private_key_pem) {
      document.getElementById("private-key-panel").hidden = false;
      document.getElementById("private-key-output").value = payload.private_key_pem;
    }
    return refreshAfterMutation(payload);
  });
});

document.getElementById("copy-private-key").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("private-key-output").value);
  setStatus("私鑰已複製");
});

document.getElementById("balance-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("查詢餘額", () => callActive(`/balance/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("log-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("交易紀錄", () => callActive(`/log/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("送出交易", async () => {
    const sender = String(form.get("from"));
    const recipient = String(form.get("to"));
    const amount = Number(form.get("amount"));
    const privateKeyPem = String(form.get("privateKeyPem") || "");
    let signature = null;
    if (sender !== "angel" && sender !== "SYSTEM") {
      signature = signTransaction(sender, recipient, amount, privateKeyPem);
      if (!signature) {
        throw new Error("簽章帳戶轉帳需要貼上私鑰。");
      }
    }
    const payload = await callActive("/transaction", {
      method: "POST",
      body: JSON.stringify({
        from: sender,
        to: recipient,
        amount,
        ...(signature ? { signature } : {}),
      }),
    });
    return refreshAfterMutation(payload);
  });
});

document.getElementById("chain-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const rewardTo = String(form.get("rewardTo") || "").trim();
  await runAction("檢查鏈", async () => {
    const payload = await callActive("/chain/check", {
      method: "POST",
      body: JSON.stringify(rewardTo ? { reward_to: rewardTo } : {}),
    });
    return refreshAfterMutation(payload);
  });
});

document.getElementById("tx-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("查詢交易", () => callActive(`/tx/${encodeURIComponent(form.get("txId"))}`));
});

document.getElementById("status-button").addEventListener("click", async () => {
  await runAction("叢集狀態", refreshSummary);
});

document.getElementById("consistency-button").addEventListener("click", async () => {
  await runAction("一致性檢查", () => callActive("/status/consistency"));
  await refreshSummary();
});

document.getElementById("leaderboard-button").addEventListener("click", async () => {
  await runAction("排行榜", () => callActive("/leaderboard"));
});

document.getElementById("operations-button").addEventListener("click", async () => {
  await runAction("操作紀錄", () => callActive("/operations"));
});

document.getElementById("chain-button").addEventListener("click", async () => {
  await runAction("查看鏈", () => callActive("/chain"));
});

document.getElementById("health-button").addEventListener("click", async () => {
  await runAction("健康檢查", async () => ({ nodes: await getHealthResults() }));
});

document.getElementById("reset-node-button").addEventListener("click", async () => {
  const confirmed = window.confirm(
    `要把 ${activeNodeId} 清回 genesis 以示範多數決修復嗎？這只會重置目前操作節點。`,
  );
  if (!confirmed) {
    return;
  }
  await runAction("清空目前節點", async () => {
    const payload = await callActive("/demo/reset", { method: "POST", body: "{}" });
    return refreshAfterMutation(payload);
  });
});

document.getElementById("repair-button").addEventListener("click", async () => {
  await runAction("多數決修復", async () => {
    const consistency = await callActive("/status/consistency");
    if (consistency.consistent) {
      return { message: "叢集目前已一致，不需要修復。", consistency };
    }

    const hashCounts = {};
    for (const node of consistency.nodes || []) {
      if (node.last_block_hash) {
        hashCounts[node.last_block_hash] = (hashCounts[node.last_block_hash] || 0) + 1;
      }
    }
    const hashes = Object.keys(hashCounts);
    if (!hashes.length) {
      throw new Error("沒有可用的節點 Hash，無法進行多數決修復。");
    }

    const majorityHash = hashes.reduce((left, right) => (hashCounts[left] >= hashCounts[right] ? left : right));
    const sourceNode = (consistency.nodes || []).find((node) => node.last_block_hash === majorityHash);
    if (!sourceNode) {
      throw new Error("無法選出修復來源節點。");
    }

    const snapshot = await callNode(sourceNode.node_id, "/chain");
    const results = [];
    for (const node of consistency.nodes || []) {
      if (node.last_block_hash === majorityHash) {
        continue;
      }
      try {
        const response = await callNode(node.node_id, "/sync", {
          method: "POST",
          body: JSON.stringify(snapshot),
        });
        results.push({ node: node.node_id, status: "已修復", response });
      } catch (error) {
        results.push({ node: node.node_id, status: "修復失敗", error: error.message });
      }
    }
    await refreshSummary();
    return {
      message: "多數決修復完成。",
      source_node: sourceNode.node_id,
      majority_hash: majorityHash,
      results,
    };
  });
});

document.getElementById("refresh-summary").addEventListener("click", async () => {
  await runAction("重新整理", refreshSummary);
});

document.getElementById("copy-result").addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultOutput.textContent);
  setStatus("JSON 已複製");
});

setActiveNode(activeNodeId);
updateQuickLinks();
runAction("初始化", refreshSummary).catch(() => {});
