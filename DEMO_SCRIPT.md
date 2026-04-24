# Demo 操作步驟與講稿

## Demo 前準備

先啟動或重啟系統：

```bash
docker compose up -d
docker compose restart
```

如果要用乾淨資料重跑：

```bash
docker compose down
```

刪除 `share/nodes` 內舊資料後，再重新執行：

```bash
docker compose up -d
docker compose restart
```

## 操作步驟

### 1. 顯示節點都已啟動

```bash
docker compose ps
```

### 2. 查詢三個節點狀態

```bash
docker compose exec client1 python /app/app_nodeStatus.py
```

可觀察：

- 每個節點的區塊數
- pending 交易數
- 最後同步時間
- 最後區塊 hash

### 3. 查詢初始餘額

```bash
docker compose exec client1 python /app/app_checkMoney.py alice
docker compose exec client2 python /app/app_checkMoney.py bob
docker compose exec client3 python /app/app_checkMoney.py carol
```

### 4. 從不同節點送出交易

```bash
docker compose exec client1 python /app/app_transaction.py alice bob 10
docker compose exec client2 python /app/app_transaction.py bob carol 5
docker compose exec client3 python /app/app_transaction.py carol dave 3
docker compose exec client1 python /app/app_transaction.py dave alice 2
docker compose exec client2 python /app/app_transaction.py alice carol 1
```

說明重點：

- 前 4 筆會先進入 pending
- 第 5 筆送出後，系統自動建立新區塊
- 新區塊會寫入前一區塊的 SHA256

### 5. 展示完整區塊鏈

```bash
docker compose exec client1 python /app/client_cli.py show-chain
```

### 6. 檢查三個節點是否一致

```bash
docker compose exec client1 python /app/app_checkConsistency.py
```

可觀察：

- `node1`、`node2`、`node3` 最後區塊 hash 是否相同

### 7. 查詢交易紀錄

```bash
docker compose exec client1 python /app/app_checkLog.py alice
```

### 8. 用 tx_id 查詢某筆交易位置

先從交易輸出複製 `tx_id`，再查：

```bash
docker compose exec client1 python /app/app_queryTransaction.py <tx_id>
```

### 9. 查看排行榜

```bash
docker compose exec client1 python /app/app_leaderboard.py 5
```

### 10. 執行驗鏈並領取 angel 獎勵

```bash
docker compose exec client2 python /app/app_checkChain.py auditor
docker compose exec client1 python /app/app_checkMoney.py auditor
docker compose exec client1 python /app/app_checkLog.py auditor
```

### 11. 查看操作紀錄

```bash
docker compose exec client1 python /app/app_operationsLog.py 20
```

可觀察：

- 轉帳紀錄
- 節點同步紀錄
- 驗鏈紀錄

## Demo 講稿

各位老師好，這次期中專題是用 Docker 容器實作一個簡易分散式帳本系統。系統有三個節點，分別是 `node1`、`node2`、`node3`，每個節點都各自保存自己的帳本副本；另外有 `client1`、`client2`、`client3`，分別連到不同節點，模擬不同使用者在不同節點上操作。

本系統支援四個基本功能，包含查詢帳戶餘額、查詢交易紀錄、進行轉帳，以及驗證區塊鏈完整性。帳本資料會儲存在 `/share/nodes/node1`、`/share/nodes/node2`、`/share/nodes/node3` 裡面，所以每個節點都有自己的區塊檔、待處理交易檔和操作紀錄檔。

首先我先展示節點狀態查詢。這裡可以看到每個節點目前的區塊數、pending 交易數量、最後同步時間，以及最後一個區塊的 hash。這可以證明每個節點確實都有自己的帳本資料。

接著我展示轉帳功能。我會從不同 client 對不同 node 送出交易，例如 `alice` 轉給 `bob`、`bob` 轉給 `carol`。每次交易都會先寫入節點自己的帳本，然後同步到其他節點。當累積到 5 筆交易時，系統會自動建立新的區塊，並產生新的區塊檔案。新區塊內會正確記錄前一個區塊的 SHA256，也就是 `previous_hash`。

接下來我展示一致性檢查。系統會比較 `node1`、`node2`、`node3` 三個節點最後一個區塊的 hash 是否一致。如果一致，就代表同步後三個節點的帳本副本相同。這部分可以證明系統不只是單節點記帳，而是有節點間同步。

再來我展示交易查詢功能。我可以用某一筆交易的 `tx_id` 直接查詢它目前在哪些節點出現，以及它是還在 pending，還是已經進入某個區塊。這對追蹤交易很方便。

接著我展示帳戶排行榜。排行榜會列出目前帳戶餘額最高的幾個帳戶，可以快速看出目前系統內的資產分布。

最後我展示驗鏈功能。`app_checkChain.py` 會從第一個區塊一路檢查到最後一個區塊，確認每個區塊的 `previous_hash` 是否等於前一個區塊的 `block_hash`，也會檢查 `next_block_id` 是否正確。如果驗證成功，系統會新增一筆 `angel` 發給驗證者 10 元的獎勵交易，並同步到其他節點。之後我再查詢驗證者餘額，就可以看到多了 10 元。

除了基本功能之外，我們也額外加入了操作紀錄檔。每個節點都會把轉帳、同步、驗鏈等操作寫進 `operations.log`，方便 demo 與除錯，也能清楚看出系統執行過程。

總結來說，這個系統完成了題目要求的 Docker 容器化、交易紀錄、區塊串接、SHA256 完整性驗證，以及多節點同步操作，同時也補充了節點狀態、一致性檢查、交易追蹤、排行榜和操作紀錄等進階功能。

## 1 分鐘精簡版講稿

各位老師好，這個專題是用 Docker 實作分散式帳本系統。系統有三個節點 `node1`、`node2`、`node3`，每個節點都各自保存帳本副本，並透過同步機制維持一致。基本功能包含查餘額、查交易紀錄、轉帳與驗鏈。每 5 筆交易會自動建立一個新區塊，新區塊會記錄前一區塊的 SHA256。驗鏈時，系統會從第一個區塊檢查到最後一個區塊，確認鏈結正確，成功後由 `angel` 發送 10 元獎勵給驗證者。我們另外還實作了節點狀態查詢、一致性檢查、交易查詢、帳戶排行榜與操作紀錄功能，讓整個系統更容易觀察與展示。
