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
  
  const consText = document.getElementById("summary-consistency");
  if (consistency.consistent) {
      consText.textContent = "✅ 一致";
      consText.className = "text-success";
  } else {
      consText.textContent = "⚠️ 發生分歧";
      consText.className = "text-danger";
  }

  const handledBy = status.handled_by || "-";
  currentNode.textContent = handledBy;
  heroNode.textContent = handledBy;
}

// ==========================================
// 1. 帳戶管理：建立新帳戶
// ==========================================
document.getElementById("create-account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  
  await runAction("建立新帳戶", async () => {
    const data = await callApi("/account/create", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        initial_balance: Number(form.get("initial_balance"))
      })
    });

    if (data.private_key_pem) {
        document.getElementById("priv-key-display").style.display = "block";
        document.getElementById("priv-key-text").value = data.private_key_pem;
    }
    return data;
  });
  await refreshSummary();
});

window.copyPrivKey = function() {
    const text = document.getElementById("priv-key-text");
    text.select();
    document.execCommand("copy");
    alert("私鑰已複製到剪貼簿！");
};

// ==========================================
// 2. 帳戶查詢
// ==========================================
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

// ==========================================
// 3. 轉帳與驗鏈 (本地安全簽章)
// ==========================================
document.getElementById("transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const sender = form.get("from");
  const recipient = form.get("to");
  const amount = Number(form.get("amount"));
  const privKeyPem = form.get("privateKeyPem");

  await runAction("送出交易 (本地簽章安全模式)", () => {
    let signatureHex = "";
    
    try {
        const privateKey = forge.pki.privateKeyFromPem(privKeyPem);
        
        // 為了與 Python 後端的 float() 保持一致，整數自動補上 .0
        let amountStr = amount.toString();
        if (Number.isInteger(amount)) {
            amountStr += ".0";
        }

        const md = forge.md.sha256.create();
        md.update(`${sender},${recipient},${amountStr}`, 'utf8');
        
        const signature = privateKey.sign(md);
        signatureHex = forge.util.bytesToHex(signature);
    } catch (err) {
        throw new Error("私鑰格式錯誤或無效！無法產生簽章。");
    }

    return callApi("/transaction", {
      method: "POST",
      body: JSON.stringify({
        from: sender,
        to: recipient,
        amount: amount,
        signature: signatureHex 
      }),
    });
  });
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

// ==========================================
// 4. 節點與分析 (包含自動修復多數決)
// ==========================================
document.getElementById("status-button").addEventListener("click", async () => {
  await runAction("節點狀態查詢", () => callApi("/status"));
  await refreshSummary();
});

document.getElementById("consistency-button").addEventListener("click", async () => {
  await runAction("一致性檢查", () => callApi("/status/consistency"));
  await refreshSummary();
});

document.getElementById("repair-button").addEventListener("click", async () => {
  await runAction("自動修復共識 (多數決)", async () => {
      const consistency = await callApi("/status/consistency");
      if (consistency.consistent) {
         return { message: "✅ 目前網路已達共識，無需修復。" };
      }
      
      const nodes = consistency.nodes;
      const hashCounts = {};
      nodes.forEach(n => {
          const h = n.last_block_hash;
          if (h) hashCounts[h] = (hashCounts[h] || 0) + 1;
      });
      
      const majorityHash = Object.keys(hashCounts).reduce((a, b) => hashCounts[a] > hashCounts[b] ? a : b);
      const sourceNodeInfo = nodes.find(n => n.last_block_hash === majorityHash);
      if (!sourceNodeInfo) throw new Error("無法找到多數決正確節點");

      const portMap = { "node1": 8001, "node2": 8002, "node3": 8003 };
      const sourcePort = portMap[sourceNodeInfo.node_id];

      const snapRes = await fetch(`http://localhost:${sourcePort}/chain`);
      if (!snapRes.ok) throw new Error("無法從正確節點下載快照");
      const snapshotText = await snapRes.text();

      const repairResults = [];
      for (const n of nodes) {
         if (n.last_block_hash !== majorityHash) {
             const badPort = portMap[n.node_id];
             try {
                 const syncRes = await fetch(`http://localhost:${badPort}/sync`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: snapshotText 
                 });
                 repairResults.push({ node: n.node_id, status: syncRes.ok ? "✅ 修復成功" : "❌ 修復失敗" });
             } catch (e) {
                 repairResults.push({ node: n.node_id, status: `❌ 連線失敗: ${e.message}` });
             }
         }
      }
      
      await refreshSummary();
      return { 
          message: "🔧 修復程序完成", 
          majority_hash: majorityHash,
          source_node: sourceNodeInfo.node_id,
          results: repairResults 
      };
  });
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