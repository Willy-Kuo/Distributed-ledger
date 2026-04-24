const resultOutput = document.getElementById("result-output");
const resultStatus = document.getElementById("result-status");
const currentNode = document.getElementById("current-node");
const heroNode = document.getElementById("hero-node");
const txIdInput = document.getElementById("tx-id-input");

function renderJson(payload) {
  resultOutput.textContent = JSON.stringify(payload, null, 2);
}

function setStatus(text, isError = false) {
  resultStatus.textContent = text;
  resultStatus.style.color = isError ? "#b13f0f" : "";
}

async function callApi(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function runAction(label, task) {
  setStatus(`${label} 執行中...`);
  try {
    const payload = await task();
    renderJson(payload);
    const latestTxId = payload?.transaction?.tx_id || payload?.reward_transaction?.tx_id;
    if (latestTxId) {
      txIdInput.value = latestTxId;
    }
    setStatus(`${label} 完成`);
    return payload;
  } catch (error) {
    renderJson({ error: error.message });
    setStatus(`${label} 失敗`, true);
    throw error;
  }
}

async function refreshSummary() {
  const [status, consistency] = await Promise.all([
    callApi("/status"),
    callApi("/status/consistency"),
  ]);

  const nodes = status.nodes || [];
  document.getElementById("summary-node-count").textContent = String(nodes.length);
  document.getElementById("summary-block-count").textContent = String(
    Math.max(0, ...nodes.map((node) => node.block_count || 0)),
  );
  document.getElementById("summary-pending").textContent = String(
    nodes.reduce((sum, node) => sum + (node.pending_count || 0), 0),
  );
  document.getElementById("summary-consistency").textContent = consistency.consistent ? "一致" : "不一致";

  const handledBy = status.handled_by || "-";
  currentNode.textContent = handledBy;
  heroNode.textContent = handledBy;
}

document.getElementById("balance-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("查詢餘額", () => callApi(`/balance/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("log-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("查詢交易紀錄", () => callApi(`/log/${encodeURIComponent(form.get("account"))}`));
});

document.getElementById("transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("送出交易", () =>
    callApi("/transaction", {
      method: "POST",
      body: JSON.stringify({
        from: form.get("from"),
        to: form.get("to"),
        amount: Number(form.get("amount")),
      }),
    }),
  );
  await refreshSummary();
});

document.getElementById("chain-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const rewardTo = String(form.get("rewardTo") || "").trim();
  await runAction("檢查區塊鏈", () =>
    rewardTo
      ? callApi("/chain/check", {
          method: "POST",
          body: JSON.stringify({ reward_to: rewardTo }),
        })
      : callApi("/chain/check"),
  );
  await refreshSummary();
});

document.getElementById("tx-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await runAction("查詢交易", () => callApi(`/tx/${encodeURIComponent(form.get("txId"))}`));
});

document.getElementById("status-button").addEventListener("click", async () => {
  await runAction("節點狀態查詢", () => callApi("/status"));
  await refreshSummary();
});

document.getElementById("consistency-button").addEventListener("click", async () => {
  await runAction("一致性檢查", () => callApi("/status/consistency"));
  await refreshSummary();
});

document.getElementById("leaderboard-button").addEventListener("click", async () => {
  await runAction("排行榜查詢", () => callApi("/leaderboard"));
});

document.getElementById("operations-button").addEventListener("click", async () => {
  await runAction("操作紀錄查詢", () => callApi("/operations"));
});

document.getElementById("chain-button").addEventListener("click", async () => {
  await runAction("查看完整區塊鏈", () => callApi("/chain"));
});

document.getElementById("refresh-summary").addEventListener("click", async () => {
  await runAction("更新摘要", refreshSummary);
});

document.getElementById("copy-result").addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultOutput.textContent);
  setStatus("JSON 已複製");
});

runAction("初始化摘要", refreshSummary).catch(() => {});
