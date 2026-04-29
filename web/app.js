const NODES = [
  { id: "node1", origin: "http://localhost:8001" },
  { id: "node2", origin: "http://localhost:8002" },
  { id: "node3", origin: "http://localhost:8003" },
];

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
  if (typeof value === "boolean") return value ? "yes" : "no";
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
  resultVisual.innerHTML = html || '<div class="empty-state">No visual data available.</div>';
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

function table(rows, columns, emptyText = "No rows") {
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

function txColumns() {
  return [
    { label: "Time", value: (row) => row.timestamp || row.created_at },
    { label: "Type", key: "type" },
    { label: "From", key: "from" },
    { label: "To", key: "to" },
    { label: "Amount", key: "amount" },
    { label: "Status", key: "status" },
    { label: "Block", value: (row) => row.block_id || row.block_file },
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
                ${badge(node.online === false ? "offline" : "available", node.online === false ? "bad" : "ok")}
              </div>
              <div class="mini-metrics">
                ${metric("Blocks", node.block_count ?? "-")}
                ${metric("Pending", node.pending_count ?? "-")}
                ${metric("Last block", node.last_block_id ?? "-")}
              </div>
              <dl class="visual-list">
                <div><dt>Sync source</dt><dd>${escapeHtml(node.last_sync_source || "-")}</dd></div>
                <div><dt>Last hash</dt><dd title="${escapeHtml(node.last_block_hash || "")}">${escapeHtml(shortHash(node.last_block_hash))}</dd></div>
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
        ${metric("Active node", payload.active_node || payload.handled_by || activeNodeId)}
        ${metric("Online", `${onlineCount}/${NODES.length}`, onlineCount === NODES.length ? "ok" : "warn")}
        ${metric("Max blocks", Math.max(0, ...nodes.map((node) => node.block_count || 0)))}
        ${metric("Consistent", consistent === undefined ? "-" : consistent ? "yes" : "no", consistent ? "ok" : "bad")}
      </div>
      ${nodeStatusCards(nodes)}
    </div>
  `;
}

function renderConsistencyVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Handled by", payload.handled_by || activeNodeId)}
        ${metric("Consistent", payload.consistent ? "yes" : "no", payload.consistent ? "ok" : "bad")}
        ${metric("Reference hashes", payload.reference_hashes?.length || 0)}
      </div>
      ${nodeStatusCards(payload.nodes || [])}
    </div>
  `;
}

function renderBalanceVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Account", payload.account)}
        ${metric("Balance", payload.balance)}
        ${metric("Node", payload.node_id || payload.handled_by || activeNodeId)}
      </div>
    </div>
  `;
}

function renderTransactionVisual(payload) {
  const tx = payload.transaction || payload.reward_transaction || {};
  const syncRows = payload.sync_results || [];
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Handled by", payload.handled_by || activeNodeId)}
        ${metric("Pending", payload.pending_count ?? "-")}
        ${metric("Auto block", payload.auto_block ? payload.auto_block.block_id : "-")}
      </div>
      ${table([tx], [
        { label: "tx_id", key: "tx_id" },
        { label: "From", key: "from" },
        { label: "To", key: "to" },
        { label: "Amount", key: "amount" },
        { label: "Type", key: "type" },
      ])}
      <h3 class="visual-subhead">Replication</h3>
      ${table(syncRows, [
        { label: "Peer", key: "peer" },
        { label: "Status", key: "status" },
        { label: "Error", key: "error" },
      ], "No replication rows")}
    </div>
  `;
}

function renderChainCheckVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Handled by", payload.handled_by || activeNodeId)}
        ${metric("Valid", payload.valid ? "yes" : "no", payload.valid ? "ok" : "bad")}
        ${metric("Checked from", payload.checked_from_block)}
        ${metric("Checked to", payload.checked_to_block)}
      </div>
      ${
        payload.errors?.length
          ? `<div class="alert-list">${payload.errors.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>`
          : '<div class="success-note">No chain errors found.</div>'
      }
      ${payload.reward_transaction ? renderTransactionVisual({ ...payload, transaction: payload.reward_transaction }) : ""}
    </div>
  `;
}

function renderLeaderboardVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Node", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("Rows", payload.leaderboard?.length || 0)}
      </div>
      ${table(payload.leaderboard || [], [
        { label: "Account", key: "account" },
        { label: "Balance", key: "balance" },
      ], "No leaderboard rows")}
    </div>
  `;
}

function renderOperationsVisual(payload) {
  const rows = [...(payload.entries || [])].reverse();
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Node", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("Entries", payload.entries?.length || 0)}
      </div>
      ${table(rows, [
        { label: "Time", key: "timestamp" },
        { label: "Node", key: "node_id" },
        { label: "Event", key: "event" },
        { label: "Payload", value: (row) => JSON.stringify(row.payload || {}) },
      ], "No operation entries")}
    </div>
  `;
}

function renderTxSearchVisual(payload) {
  const rows = payload.matches || [];
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("tx_id", payload.tx_id)}
        ${metric("Found", payload.found ? "yes" : "no", payload.found ? "ok" : "bad")}
        ${metric("Matches", rows.length)}
      </div>
      ${table(rows, [
        { label: "Node", key: "node_id" },
        { label: "Status", key: "status" },
        { label: "Block", value: (row) => row.block_id || row.block_file },
        { label: "From", key: "from" },
        { label: "To", key: "to" },
        { label: "Amount", key: "amount" },
      ], "No matching transactions")}
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
        ${metric("Node", payload.node_id || payload.handled_by || activeNodeId)}
        ${metric("Blocks", blocks.length)}
        ${metric("Pending", payload.pending_transactions?.length || 0)}
        ${metric("Data dir", payload.data_dir || "-")}
      </div>
      <div class="chain-strip">
        ${blocks
          .map(
            (block) => `
              <article class="block-card">
                <strong>#${escapeHtml(block.block_id)}</strong>
                <span>${escapeHtml((block.transactions || []).length)} tx</span>
                <code title="${escapeHtml(block.block_hash || "")}">${escapeHtml(shortHash(block.block_hash))}</code>
              </article>
            `,
          )
          .join("")}
      </div>
      <h3 class="visual-subhead">Confirmed transactions</h3>
      ${table(transactions, txColumns(), "No confirmed transactions")}
    </div>
  `;
}

function renderLogVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Account", payload.account)}
        ${metric("Transactions", payload.transactions?.length || 0)}
        ${metric("Node", payload.node_id || activeNodeId)}
      </div>
      ${table(payload.transactions || [], txColumns(), "No transactions for this account")}
    </div>
  `;
}

function renderHealthVisual(payload) {
  return `
    <div class="visual-section">
      <div class="visual-metrics">
        ${metric("Online", `${(payload.nodes || []).filter((node) => node.online).length}/${NODES.length}`)}
      </div>
      <div class="visual-card-grid">
        ${(payload.nodes || [])
          .map(
            (node) => `
              <article class="visual-card">
                <div class="visual-card-head">
                  <h3>${escapeHtml(node.node_id)}</h3>
                  ${badge(node.online ? "online" : "offline", node.online ? "ok" : "bad")}
                </div>
                <dl class="visual-list">
                  <div><dt>Message</dt><dd>${escapeHtml(node.error || node.payload?.status || "ok")}</dd></div>
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
    setVisual(`<div class="empty-state">No specialized visualizer for this response. Use Raw JSON below.</div>`);
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
  setStatus(`${label} running...`);
  try {
    const payload = await task();
    renderResult(payload);
    const latestTxId = payload?.transaction?.tx_id || payload?.reward_transaction?.tx_id;
    if (latestTxId) {
      txIdInput.value = latestTxId;
    }
    setStatus(`${label} complete`);
    return payload;
  } catch (error) {
    const payload = { error: error.message };
    renderResult(payload);
    setStatus(`${label} failed`, true);
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
        <button class="mini-button" type="button" data-node="${escapeHtml(health.node_id)}">Use</button>
      </div>
      <dl>
        <div>
          <dt>Blocks</dt>
          <dd>${escapeHtml(status.block_count ?? "-")}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>${escapeHtml(status.pending_count ?? "-")}</dd>
        </div>
        <div>
          <dt>Sync source</dt>
          <dd>${escapeHtml(status.last_sync_source ?? "-")}</dd>
        </div>
        <div>
          <dt>Last hash</dt>
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
  document.getElementById("summary-consistency").textContent = consistency.consistent ? "yes" : "no";
  clusterCaption.textContent = `Reported by ${status.handled_by || activeNodeId}, updated ${new Date().toLocaleTimeString()}`;

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

document.getElementById("balance-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("Check balance", () => callActive(`/balance/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("log-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("Account log", () => callActive(`/log/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("Submit transaction", async () => {
    const payload = await callActive("/transaction", {
      method: "POST",
      body: JSON.stringify({
        from: form.get("from"),
        to: form.get("to"),
        amount: Number(form.get("amount")),
      }),
    });
    return refreshAfterMutation(payload);
  });
});

document.getElementById("chain-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const rewardTo = String(form.get("rewardTo") || "").trim();
  await runAction("Check chain", async () => {
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
  await runAction("Find transaction", () => callActive(`/tx/${encodeURIComponent(form.get("txId"))}`));
});

document.getElementById("status-button").addEventListener("click", async () => {
  await runAction("Cluster status", refreshSummary);
});

document.getElementById("consistency-button").addEventListener("click", async () => {
  await runAction("Consistency", () => callActive("/status/consistency"));
  await refreshSummary();
});

document.getElementById("leaderboard-button").addEventListener("click", async () => {
  await runAction("Leaderboard", () => callActive("/leaderboard"));
});

document.getElementById("operations-button").addEventListener("click", async () => {
  await runAction("Operations", () => callActive("/operations"));
});

document.getElementById("chain-button").addEventListener("click", async () => {
  await runAction("View chain", () => callActive("/chain"));
});

document.getElementById("health-button").addEventListener("click", async () => {
  await runAction("Health check", async () => ({ nodes: await getHealthResults() }));
});

document.getElementById("refresh-summary").addEventListener("click", async () => {
  await runAction("Refresh", refreshSummary);
});

document.getElementById("copy-result").addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultOutput.textContent);
  setStatus("JSON copied");
});

setActiveNode(activeNodeId);
runAction("Initialize", refreshSummary).catch(() => {});
