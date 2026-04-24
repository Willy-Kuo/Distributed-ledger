# Container 期中專題: Docker 分散式帳本

本專題使用 Docker 容器技術實作簡易分散式帳本系統，支援查帳、轉帳、驗鏈與多節點同步。系統包含 `node1`、`node2`、`node3` 三個節點，每個節點各自保存自己的帳本副本；當任一節點收到新交易或新的驗鏈獎勵時，會把最新帳本同步到其他節點。

## 系統功能

- 圖形化 Web GUI
- 查詢帳戶餘額 `check money`
- 查詢交易紀錄 `check log`
- 進行轉帳 `transaction`
- 驗證帳本鏈完整性 `check chain`
- 節點狀態查詢 `status`
- 節點一致性檢查 `consistency`
- 交易查詢 `query tx by id`
- 帳戶排行榜 `leaderboard`
- 操作紀錄檔查詢 `operations log`

## 系統架構

- `node1`、`node2`、`node3`：帳本節點容器
- `client1`、`client2`、`client3`：操作端容器，分別連到不同節點
- `./share`：共用根目錄
- `/share/nodes/node1`、`/share/nodes/node2`、`/share/nodes/node3`：各節點自己的帳本資料夾

## 每個節點的帳本資料

每個節點都有自己的帳本檔案，例如：

- `/share/nodes/node1/blocks/block_0001.json`
- `/share/nodes/node1/meta.json`
- `/share/nodes/node1/pending_transactions.json`
- `/share/nodes/node2/blocks/block_0001.json`
- `/share/nodes/node3/blocks/block_0001.json`
- `/share/nodes/node1/operations.log`

每個區塊檔都包含：

- `previous_hash`
- `next_block_id`
- `transactions`
- `block_hash`

其中 `block_hash` 是根據區塊內容計算出的 SHA256，新區塊的 `previous_hash` 會記錄前一個區塊的 `block_hash`。

## 同步方式

1. Client 對某一個節點送出交易或驗鏈請求
2. 該節點先更新自己的帳本
3. 該節點把最新帳本快照同步到其他節點
4. 其他節點覆寫自己的帳本副本

因此系統可以展示：

- 每個節點各自有帳本
- 多個節點最後會同步成一致狀態
- 每個節點都有自己的操作紀錄檔

## 題目規格對應

- 每 5 筆交易自動建立新區塊
- 新區塊會正確寫入前一區塊的 SHA256
- `app_transaction.py` 負責轉帳
- 若區塊已滿，系統會自動新增區塊檔案
- `app_checkChain.py` 會從第一個區塊檢查到最後一個區塊
- 驗鏈成功後，系統會新增一筆 `angel -> 指定帳戶 10 元` 的獎勵交易

## 專案檔案

- `ledger_server.py`：節點伺服器與同步邏輯
- `client_cli.py`：通用 CLI
- `app_transaction.py`：轉帳程式
- `app_checkChain.py`：驗鏈程式
- `app_checkMoney.py`：查餘額程式
- `app_checkLog.py`：查交易紀錄程式
- `app_nodeStatus.py`：節點狀態查詢
- `app_checkConsistency.py`：節點一致性檢查
- `app_queryTransaction.py`：依 `tx_id` 查詢交易
- `app_leaderboard.py`：帳戶排行榜
- `app_operationsLog.py`：操作紀錄查詢
- `docker-compose.yml`：三節點 Docker 設定

## 啟動方式

第一次啟動或改完程式後：

```bash
docker compose up -d
docker compose restart
```

## 圖形化介面

啟動後可直接用瀏覽器開啟：

- `http://localhost:8001` 對應 `node1`
- `http://localhost:8002` 對應 `node2`
- `http://localhost:8003` 對應 `node3`

GUI 可直接操作：

- 查詢餘額
- 查詢交易紀錄
- 送出轉帳
- 驗鏈與獎勵
- 節點狀態查詢
- 一致性檢查
- `tx_id` 查詢
- 帳戶排行榜
- 操作紀錄查詢
- 查看完整區塊鏈

## 基本操作

查詢 `node1` 上的餘額：

```bash
docker compose exec client1 python /app/app_checkMoney.py alice
```

查詢 `node2` 上的交易紀錄：

```bash
docker compose exec client2 python /app/app_checkLog.py alice
```

由 `node1` 處理轉帳：

```bash
docker compose exec client1 python /app/app_transaction.py alice bob 15
```

由 `node2` 進行驗鏈並發放獎勵：

```bash
docker compose exec client2 python /app/app_checkChain.py auditor
```

查看某個節點完整區塊鏈：

```bash
docker compose exec client3 python /app/client_cli.py show-chain
```

查詢所有節點狀態：

```bash
docker compose exec client1 python /app/app_nodeStatus.py
```

檢查三個節點最後區塊 hash 是否一致：

```bash
docker compose exec client1 python /app/app_checkConsistency.py
```

用 `tx_id` 查詢交易在哪個區塊：

```bash
docker compose exec client1 python /app/app_queryTransaction.py <tx_id>
```

查看帳戶排行榜：

```bash
docker compose exec client1 python /app/app_leaderboard.py 5
```

查看操作紀錄：

```bash
docker compose exec client1 python /app/app_operationsLog.py 20
```

## Demo 流程

1. 啟動系統

```bash
docker compose up -d
docker compose restart
```

2. 展示三個節點各自存在

```bash
docker compose ps
```

3. 查詢不同節點上的初始餘額

```bash
docker compose exec client1 python /app/app_checkMoney.py alice
docker compose exec client2 python /app/app_checkMoney.py alice
docker compose exec client3 python /app/app_checkMoney.py alice
```

4. 從不同節點送出 5 筆交易

```bash
docker compose exec client1 python /app/app_transaction.py alice bob 10
docker compose exec client2 python /app/app_transaction.py bob carol 5
docker compose exec client3 python /app/app_transaction.py carol dave 3
docker compose exec client1 python /app/app_transaction.py dave alice 2
docker compose exec client2 python /app/app_transaction.py alice carol 1
```

5. 展示第 5 筆交易後自動建立新區塊，且三個節點都有同步後的帳本

```bash
docker compose exec client1 python /app/client_cli.py show-chain
docker compose exec client2 python /app/client_cli.py show-chain
docker compose exec client3 python /app/client_cli.py show-chain
```

6. 驗證區塊鏈完整性並獲得 angel 獎勵

```bash
docker compose exec client2 python /app/app_checkChain.py auditor
docker compose exec client1 python /app/app_checkMoney.py auditor
docker compose exec client3 python /app/app_checkMoney.py auditor
```

7. 展示進階功能

```bash
docker compose exec client1 python /app/app_nodeStatus.py
docker compose exec client1 python /app/app_checkConsistency.py
docker compose exec client1 python /app/app_leaderboard.py 5
docker compose exec client1 python /app/app_operationsLog.py 20
```

## 報告文字

本專題使用 Docker 容器技術實作簡易分散式帳本系統。系統建立三個帳本節點 `node1`、`node2`、`node3`，每個節點都各自保存一份帳本副本。另有多個 Client 容器分別連線至不同節點，模擬多使用者在不同節點上進行操作的情境。

在資料設計上，每個節點都會把自己的帳本資料存放在 `/share/nodes/<node_id>/` 目錄下，包含區塊檔、待處理交易檔與中繼資料檔。每個區塊都包含前一區塊的 SHA256 雜湊值 `previous_hash`、下一區塊的連結資訊 `next_block_id`、交易內容 `transactions` 與本區塊雜湊值 `block_hash`。當待處理交易累積到 5 筆時，系統會自動建立新的區塊。

在同步流程上，當任一節點收到新的轉帳或驗鏈獎勵交易時，會先更新自己的本地帳本，再把最新帳本快照同步到其他節點，使各節點的帳本副本保持一致。因此本系統同時具備「每個節點各自保存帳本」與「節點間同步帳本」兩個特性。

在驗證功能方面，`app_checkChain.py` 會從第一個區塊開始逐一檢查到最後一個區塊，確認 SHA256 串接與前後區塊關係皆正確。若驗鏈成功，系統會新增一筆由 `angel` 發送給驗證者的 10 元獎勵交易，並同步到其他節點。

此外，系統也提供節點狀態查詢、節點一致性檢查、依交易編號查詢交易位置、帳戶排行榜與操作紀錄查詢等進階功能，讓使用者可以更容易觀察節點同步結果、鏈狀態與系統操作歷程。

## 重置資料

先停止容器：

```bash
docker compose down
```

再刪除 `share/nodes` 內資料後重新啟動：

```bash
docker compose up -d
docker compose restart
```
