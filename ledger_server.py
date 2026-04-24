import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SHARE_DIR = Path(os.environ.get("LEDGER_SHARE_DIR", "/share"))
NODE_ID = os.environ.get("NODE_ID", "node1")
NODE_DIR = SHARE_DIR / "nodes" / NODE_ID
BLOCKS_DIR = NODE_DIR / "blocks"
META_FILE = NODE_DIR / "meta.json"
PENDING_FILE = NODE_DIR / "pending_transactions.json"
OPERATIONS_LOG = NODE_DIR / "operations.log"
LOCK_FILE = NODE_DIR / ".ledger.lock"
BLOCK_SIZE = 5
MINING_REWARD = float(os.environ.get("MINING_REWARD", "10"))
CHAIN_CHECK_REWARD = float(os.environ.get("CHAIN_CHECK_REWARD", "10"))
ANGEL_ACCOUNT = os.environ.get("ANGEL_ACCOUNT", "angel")
PEERS = [peer.strip().rstrip("/") for peer in os.environ.get("PEER_URLS", "").split(",") if peer.strip()]
GENESIS_TIMESTAMP = "2026-01-01T00:00:00+00:00"
GENESIS_BALANCES = {
    "alice": 100.0,
    "bob": 100.0,
    "carol": 100.0,
    "dave": 100.0,
    ANGEL_ACCOUNT: 1000.0,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def block_filename(block_id: int) -> str:
    return f"block_{block_id:04d}.json"


def compute_block_hash(block: Dict[str, Any]) -> str:
    payload = {
        "block_id": block["block_id"],
        "index": block["index"],
        "created_at": block["created_at"],
        "previous_hash": block["previous_hash"],
        "transactions": block["transactions"],
    }
    return sha256_text(canonical_json(payload))


def post_json(url: str, payload: Dict[str, Any], timeout: int = 5) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class FileLock:
    def __init__(self, lock_path: Path, timeout: float = 10.0, interval: float = 0.1) -> None:
        self.lock_path = lock_path
        self.timeout = timeout
        self.interval = interval
        self.fd: Optional[int] = None

    def acquire(self) -> None:
        start = time.time()
        while True:
            try:
                self.fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_RDWR)
                os.write(self.fd, str(os.getpid()).encode("utf-8"))
                return
            except FileExistsError:
                if time.time() - start > self.timeout:
                    raise TimeoutError(f"Could not acquire lock: {self.lock_path}")
                time.sleep(self.interval)

    def release(self) -> None:
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        if self.lock_path.exists():
            self.lock_path.unlink()

    def __enter__(self) -> "FileLock":
        self.acquire()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.release()


class LedgerStore:
    def __init__(self) -> None:
        NODE_DIR.mkdir(parents=True, exist_ok=True)
        BLOCKS_DIR.mkdir(parents=True, exist_ok=True)
        self._ensure_initialized()

    def _ensure_initialized(self) -> None:
        if META_FILE.exists() and PENDING_FILE.exists() and any(BLOCKS_DIR.glob("block_*.json")):
            return
        self._initialize_unlocked()

    def _load_json_file(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _save_json_file(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=True)

    def _initialize_unlocked(self) -> None:
        genesis_transactions = []
        for account, amount in GENESIS_BALANCES.items():
            genesis_transactions.append(
                {
                    "tx_id": f"genesis-{account}",
                    "type": "genesis",
                    "from": "SYSTEM",
                    "to": account,
                    "amount": amount,
                    "timestamp": GENESIS_TIMESTAMP,
                    "note": "Initial balance",
                }
            )
        genesis_block = {
            "block_id": 1,
            "index": 1,
            "created_at": GENESIS_TIMESTAMP,
            "previous_hash": "0" * 64,
            "next_block_id": None,
            "transactions": genesis_transactions,
        }
        genesis_block["block_hash"] = compute_block_hash(genesis_block)
        self._save_block_unlocked(genesis_block)
        self._save_meta_unlocked(
            {
                "next_block_id": 2,
                "block_size": BLOCK_SIZE,
                "created_at": GENESIS_TIMESTAMP,
                "last_updated_at": GENESIS_TIMESTAMP,
                "last_sync_at": GENESIS_TIMESTAMP,
                "last_sync_source": "genesis",
            }
        )
        self._save_pending_unlocked([])

    def _load_meta_unlocked(self) -> Dict[str, Any]:
        return self._load_json_file(
            META_FILE,
            {
                "next_block_id": 2,
                "block_size": BLOCK_SIZE,
                "created_at": GENESIS_TIMESTAMP,
                "last_updated_at": GENESIS_TIMESTAMP,
                "last_sync_at": GENESIS_TIMESTAMP,
                "last_sync_source": "genesis",
            },
        )

    def _save_meta_unlocked(self, payload: Dict[str, Any]) -> None:
        self._save_json_file(META_FILE, payload)

    def _touch_meta_unlocked(self, *, updated_at: Optional[str] = None, sync_at: Optional[str] = None, sync_source: Optional[str] = None) -> None:
        meta = self._load_meta_unlocked()
        if updated_at:
            meta["last_updated_at"] = updated_at
        if sync_at:
            meta["last_sync_at"] = sync_at
        if sync_source:
            meta["last_sync_source"] = sync_source
        self._save_meta_unlocked(meta)

    def _load_pending_unlocked(self) -> List[Dict[str, Any]]:
        return self._load_json_file(PENDING_FILE, [])

    def _save_pending_unlocked(self, payload: List[Dict[str, Any]]) -> None:
        self._save_json_file(PENDING_FILE, payload)

    def _append_operation_log_unlocked(self, event_type: str, payload: Dict[str, Any]) -> None:
        entry = {
            "timestamp": utc_now(),
            "node_id": NODE_ID,
            "event": event_type,
            "payload": payload,
        }
        OPERATIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with OPERATIONS_LOG.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=True) + "\n")

    def _block_path(self, block_id: int) -> Path:
        return BLOCKS_DIR / block_filename(block_id)

    def _load_block_unlocked(self, block_id: int) -> Dict[str, Any]:
        return self._load_json_file(self._block_path(block_id), {})

    def _save_block_unlocked(self, block: Dict[str, Any]) -> None:
        self._save_json_file(self._block_path(block["block_id"]), block)

    def _list_block_ids_unlocked(self) -> List[int]:
        block_ids = []
        for path in BLOCKS_DIR.glob("block_*.json"):
            try:
                block_ids.append(int(path.stem.split("_")[1]))
            except (IndexError, ValueError):
                continue
        return sorted(block_ids)

    def _list_blocks_unlocked(self) -> List[Dict[str, Any]]:
        return [self._load_block_unlocked(block_id) for block_id in self._list_block_ids_unlocked()]

    def _walk_chain_unlocked(self) -> List[Dict[str, Any]]:
        blocks = {block["block_id"]: block for block in self._list_blocks_unlocked()}
        if not blocks:
            return []
        chain: List[Dict[str, Any]] = []
        current_id = 1
        visited = set()
        while current_id is not None:
            if current_id in visited or current_id not in blocks:
                break
            block = blocks[current_id]
            chain.append(block)
            visited.add(current_id)
            current_id = block.get("next_block_id")
        return chain

    def _new_transaction(
        self,
        tx_type: str,
        sender: str,
        recipient: str,
        amount: float,
        note: Optional[str] = None,
        tx_id: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        tx = {
            "tx_id": tx_id or str(uuid.uuid4()),
            "type": tx_type,
            "from": sender,
            "to": recipient,
            "amount": round(amount, 2),
            "timestamp": timestamp or utc_now(),
        }
        if note:
            tx["note"] = note
        return tx

    def _calculate_balance_unlocked(self, account: str) -> float:
        balance = 0.0
        for block in self._list_blocks_unlocked():
            for tx in block["transactions"]:
                if tx["to"] == account:
                    balance += tx["amount"]
                if tx["from"] == account:
                    balance -= tx["amount"]
        for tx in self._load_pending_unlocked():
            if tx["to"] == account:
                balance += tx["amount"]
            if tx["from"] == account:
                balance -= tx["amount"]
        return round(balance, 2)

    def _append_pending_unlocked(self, tx: Dict[str, Any]) -> List[Dict[str, Any]]:
        pending = self._load_pending_unlocked()
        pending.append(tx)
        self._save_pending_unlocked(pending)
        return pending

    def _write_new_block_unlocked(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        meta = self._load_meta_unlocked()
        chain = self._walk_chain_unlocked()
        previous_block = chain[-1]
        new_block = {
            "block_id": meta["next_block_id"],
            "index": len(chain) + 1,
            "created_at": utc_now(),
            "previous_hash": previous_block["block_hash"],
            "next_block_id": None,
            "transactions": transactions,
        }
        new_block["block_hash"] = compute_block_hash(new_block)

        previous_block["next_block_id"] = new_block["block_id"]
        self._save_block_unlocked(previous_block)
        self._save_block_unlocked(new_block)
        meta["next_block_id"] = new_block["block_id"] + 1
        meta["last_updated_at"] = new_block["created_at"]
        self._save_meta_unlocked(meta)
        return new_block

    def _flush_pending_to_block_unlocked(self) -> Optional[Dict[str, Any]]:
        pending = self._load_pending_unlocked()
        if len(pending) < BLOCK_SIZE:
            return None
        block_transactions = pending[:BLOCK_SIZE]
        remaining = pending[BLOCK_SIZE:]
        new_block = self._write_new_block_unlocked(block_transactions)
        self._save_pending_unlocked(remaining)
        return new_block

    def _manual_mine_unlocked(self, miner: str) -> Dict[str, Any]:
        pending = self._load_pending_unlocked()
        if not pending:
            raise ValueError("No pending transactions to mine.")
        block_transactions = pending[:BLOCK_SIZE]
        remaining = pending[BLOCK_SIZE:]
        block_transactions.append(
            self._new_transaction("mining_reward", "SYSTEM", miner, MINING_REWARD, note="Manual mining reward")
        )
        new_block = self._write_new_block_unlocked(block_transactions)
        self._save_pending_unlocked(remaining)
        return new_block

    def _snapshot_unlocked(self) -> Dict[str, Any]:
        return {
            "node_id": NODE_ID,
            "meta": self._load_meta_unlocked(),
            "pending_transactions": self._load_pending_unlocked(),
            "blocks": self._list_blocks_unlocked(),
        }

    def snapshot(self) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            return self._snapshot_unlocked()

    def _apply_snapshot_unlocked(self, snapshot: Dict[str, Any]) -> None:
        for path in BLOCKS_DIR.glob("block_*.json"):
            path.unlink()
        for block in snapshot.get("blocks", []):
            self._save_block_unlocked(block)
        meta = snapshot.get("meta", {"next_block_id": 2, "block_size": BLOCK_SIZE, "created_at": GENESIS_TIMESTAMP})
        meta["last_sync_at"] = utc_now()
        meta["last_sync_source"] = snapshot.get("node_id", "peer")
        self._save_meta_unlocked(meta)
        self._save_pending_unlocked(snapshot.get("pending_transactions", []))
        self._append_operation_log_unlocked(
            "sync_in",
            {
                "source_node": snapshot.get("node_id", "peer"),
                "block_count": len(snapshot.get("blocks", [])),
                "pending_count": len(snapshot.get("pending_transactions", [])),
            },
        )

    def apply_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            self._apply_snapshot_unlocked(snapshot)
            return {"status": "synced", "node_id": NODE_ID, "block_count": len(self._list_block_ids_unlocked())}

    def replicate_snapshot(self, snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = []
        for peer in PEERS:
            try:
                response = post_json(f"{peer}/sync", snapshot)
                results.append({"peer": peer, "status": "ok", "response": response})
            except (HTTPError, URLError, TimeoutError, OSError) as exc:
                results.append({"peer": peer, "status": "error", "error": str(exc)})
        self._append_operation_log_unlocked(
            "sync_out",
            {
                "peers": PEERS,
                "results": results,
                "block_count": len(snapshot.get("blocks", [])),
                "pending_count": len(snapshot.get("pending_transactions", [])),
            },
        )
        return results

    def _node_dir_for(self, node_id: str) -> Path:
        return SHARE_DIR / "nodes" / node_id

    def _load_node_snapshot_from_disk(self, node_id: str) -> Optional[Dict[str, Any]]:
        node_dir = self._node_dir_for(node_id)
        meta_path = node_dir / "meta.json"
        pending_path = node_dir / "pending_transactions.json"
        blocks_dir = node_dir / "blocks"
        if not meta_path.exists() or not pending_path.exists() or not blocks_dir.exists():
            return None
        block_ids = []
        for path in blocks_dir.glob("block_*.json"):
            try:
                block_ids.append(int(path.stem.split("_")[1]))
            except (IndexError, ValueError):
                continue
        blocks = [self._load_json_file(blocks_dir / block_filename(block_id), {}) for block_id in sorted(block_ids)]
        return {
            "node_id": node_id,
            "meta": self._load_json_file(meta_path, {}),
            "pending_transactions": self._load_json_file(pending_path, []),
            "blocks": blocks,
        }

    def _find_transaction_in_snapshot(self, snapshot: Dict[str, Any], tx_id: str) -> Optional[Dict[str, Any]]:
        for block in snapshot.get("blocks", []):
            for tx in block.get("transactions", []):
                if tx.get("tx_id") == tx_id:
                    return {
                        "node_id": snapshot["node_id"],
                        "status": "confirmed",
                        "block_id": block["block_id"],
                        "block_file": block_filename(block["block_id"]),
                        "transaction": tx,
                    }
        for tx in snapshot.get("pending_transactions", []):
            if tx.get("tx_id") == tx_id:
                return {
                    "node_id": snapshot["node_id"],
                    "status": "pending",
                    "block_id": None,
                    "block_file": None,
                    "transaction": tx,
                }
        return None

    def _account_balances_from_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, float]:
        balances: Dict[str, float] = {}
        for block in snapshot.get("blocks", []):
            for tx in block.get("transactions", []):
                balances[tx["to"]] = round(balances.get(tx["to"], 0.0) + tx["amount"], 2)
                balances[tx["from"]] = round(balances.get(tx["from"], 0.0) - tx["amount"], 2)
        for tx in snapshot.get("pending_transactions", []):
            balances[tx["to"]] = round(balances.get(tx["to"], 0.0) + tx["amount"], 2)
            balances[tx["from"]] = round(balances.get(tx["from"], 0.0) - tx["amount"], 2)
        return balances

    def _node_status_from_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        blocks = snapshot.get("blocks", [])
        meta = snapshot.get("meta", {})
        return {
            "node_id": snapshot["node_id"],
            "block_count": len(blocks),
            "pending_count": len(snapshot.get("pending_transactions", [])),
            "last_block_id": blocks[-1]["block_id"] if blocks else None,
            "last_block_hash": blocks[-1].get("block_hash") if blocks else None,
            "last_updated_at": meta.get("last_updated_at"),
            "last_sync_at": meta.get("last_sync_at"),
            "last_sync_source": meta.get("last_sync_source"),
        }

    def cluster_status(self) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            statuses = []
            for node_path in sorted((SHARE_DIR / "nodes").glob("*")):
                if not node_path.is_dir():
                    continue
                snapshot = self._load_node_snapshot_from_disk(node_path.name)
                if snapshot:
                    statuses.append(self._node_status_from_snapshot(snapshot))
            return {"handled_by": NODE_ID, "nodes": statuses}

    def cluster_consistency(self) -> Dict[str, Any]:
        status_payload = self.cluster_status()
        hashes = [node["last_block_hash"] for node in status_payload["nodes"] if node["last_block_hash"]]
        unique_hashes = sorted(set(hashes))
        return {
            "handled_by": NODE_ID,
            "consistent": len(unique_hashes) <= 1 and len(status_payload["nodes"]) > 0,
            "reference_hashes": unique_hashes,
            "nodes": status_payload["nodes"],
        }

    def find_transaction(self, tx_id: str) -> Dict[str, Any]:
        matches = []
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            for node_path in sorted((SHARE_DIR / "nodes").glob("*")):
                if not node_path.is_dir():
                    continue
                snapshot = self._load_node_snapshot_from_disk(node_path.name)
                if not snapshot:
                    continue
                match = self._find_transaction_in_snapshot(snapshot, tx_id)
                if match:
                    matches.append(match)
        return {
            "handled_by": NODE_ID,
            "tx_id": tx_id,
            "found": bool(matches),
            "matches": matches,
        }

    def leaderboard(self, limit: int = 10) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            snapshot = self._snapshot_unlocked()
            balances = self._account_balances_from_snapshot(snapshot)
        ranked = [
            {"account": account, "balance": round(balance, 2)}
            for account, balance in sorted(balances.items(), key=lambda item: (-item[1], item[0]))
            if account != "SYSTEM"
        ][: max(1, limit)]
        return {"handled_by": NODE_ID, "node_id": NODE_ID, "leaderboard": ranked}

    def operations_log(self, limit: int = 50) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            entries: List[Dict[str, Any]] = []
            if OPERATIONS_LOG.exists():
                with OPERATIONS_LOG.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
        return {"handled_by": NODE_ID, "node_id": NODE_ID, "entries": entries[-max(1, limit):]}

    def add_transaction(self, sender: str, recipient: str, amount: float, replicate: bool = True) -> Dict[str, Any]:
        if sender == recipient:
            raise ValueError("Sender and recipient must be different.")
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")

        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            if sender not in {"SYSTEM", ANGEL_ACCOUNT}:
                available = self._calculate_balance_unlocked(sender)
                if available < amount:
                    raise ValueError(f"Insufficient balance. {sender} has {available:.2f}.")

            tx = self._new_transaction("transfer", sender, recipient, amount)
            pending = self._append_pending_unlocked(tx)
            auto_block = None
            if len(pending) >= BLOCK_SIZE:
                auto_block = self._flush_pending_to_block_unlocked()
            self._touch_meta_unlocked(updated_at=utc_now(), sync_source=NODE_ID)
            self._append_operation_log_unlocked(
                "transaction",
                {
                    "from": sender,
                    "to": recipient,
                    "amount": round(amount, 2),
                    "tx_id": tx["tx_id"],
                    "auto_created_block": auto_block["block_id"] if auto_block else None,
                },
            )
            snapshot = self._snapshot_unlocked()

        sync_results = self.replicate_snapshot(snapshot) if replicate else []
        return {
            "message": "Transaction accepted.",
            "handled_by": NODE_ID,
            "transaction": tx,
            "pending_count": len(snapshot["pending_transactions"]),
            "auto_created_block": auto_block,
            "created_block_file": block_filename(auto_block["block_id"]) if auto_block else None,
            "sync_results": sync_results,
        }

    def mine_pending(self, miner: str, replicate: bool = True) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            block = self._manual_mine_unlocked(miner)
            self._touch_meta_unlocked(updated_at=utc_now(), sync_source=NODE_ID)
            self._append_operation_log_unlocked(
                "mine",
                {"miner": miner, "block_id": block["block_id"], "created_block_file": block_filename(block["block_id"])},
            )
            snapshot = self._snapshot_unlocked()

        sync_results = self.replicate_snapshot(snapshot) if replicate else []
        return {
            "message": "Mining completed.",
            "handled_by": NODE_ID,
            "block": block,
            "created_block_file": block_filename(block["block_id"]),
            "sync_results": sync_results,
        }

    def account_balance(self, account: str) -> float:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            return self._calculate_balance_unlocked(account)

    def account_log(self, account: str) -> List[Dict[str, Any]]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            entries: List[Dict[str, Any]] = []
            for block in self._walk_chain_unlocked():
                for tx in block["transactions"]:
                    if tx["from"] == account or tx["to"] == account:
                        item = dict(tx)
                        item["block_id"] = block["block_id"]
                        item["block_file"] = block_filename(block["block_id"])
                        item["status"] = "confirmed"
                        item["node_id"] = NODE_ID
                        entries.append(item)
            for tx in self._load_pending_unlocked():
                if tx["from"] == account or tx["to"] == account:
                    item = dict(tx)
                    item["block_id"] = None
                    item["block_file"] = None
                    item["status"] = "pending"
                    item["node_id"] = NODE_ID
                    entries.append(item)
            entries.sort(key=lambda entry: entry["timestamp"])
            return entries

    def chain_snapshot(self) -> Dict[str, Any]:
        snapshot = self.snapshot()
        snapshot["handled_by"] = NODE_ID
        snapshot["data_dir"] = str(NODE_DIR)
        return snapshot

    def check_chain(self, reward_to: Optional[str] = None, replicate: bool = True) -> Dict[str, Any]:
        with FileLock(LOCK_FILE):
            self._ensure_initialized()
            blocks = self._walk_chain_unlocked()
            all_block_ids = self._list_block_ids_unlocked()
            errors: List[str] = []

            if not blocks:
                errors.append("No genesis block found.")
            else:
                visited_ids = [block["block_id"] for block in blocks]
                if sorted(visited_ids) != sorted(all_block_ids):
                    errors.append("Chain traversal does not cover every block file in this node.")

                for index, block in enumerate(blocks):
                    expected_hash = compute_block_hash(block)
                    if block.get("block_hash") != expected_hash:
                        errors.append(f"Block {block['block_id']} hash mismatch.")
                    if index == 0:
                        if block.get("previous_hash") != "0" * 64:
                            errors.append("Genesis block previous_hash is invalid.")
                    else:
                        previous_block = blocks[index - 1]
                        if block.get("previous_hash") != previous_block.get("block_hash"):
                            errors.append(
                                f"Block {block['block_id']} previous_hash does not match block {previous_block['block_id']}."
                            )
                        if previous_block.get("next_block_id") != block.get("block_id"):
                            errors.append(
                                f"Block {previous_block['block_id']} next_block_id does not point to block {block['block_id']}."
                            )
                if blocks and blocks[-1].get("next_block_id") is not None:
                    errors.append(f"Last block {blocks[-1]['block_id']} must not point to a next block.")

            reward_tx = None
            reward_block = None
            if not errors and reward_to:
                reward_tx = self._new_transaction(
                    "chain_check_reward",
                    ANGEL_ACCOUNT,
                    reward_to,
                    CHAIN_CHECK_REWARD,
                    note="Reward for successful chain validation",
                )
                pending = self._append_pending_unlocked(reward_tx)
                if len(pending) >= BLOCK_SIZE:
                    reward_block = self._flush_pending_to_block_unlocked()
                self._touch_meta_unlocked(updated_at=utc_now(), sync_source=NODE_ID)
            self._append_operation_log_unlocked(
                "check_chain",
                {
                    "reward_to": reward_to,
                    "valid": not errors,
                    "error_count": len(errors),
                    "reward_tx_id": reward_tx["tx_id"] if reward_tx else None,
                    "reward_block_id": reward_block["block_id"] if reward_block else None,
                },
            )
            snapshot = self._snapshot_unlocked()

        sync_results = self.replicate_snapshot(snapshot) if replicate and (reward_tx is not None or reward_block is not None) else []
        return {
            "valid": not errors,
            "errors": errors,
            "handled_by": NODE_ID,
            "checked_from_block": blocks[0]["block_id"] if blocks else None,
            "checked_to_block": blocks[-1]["block_id"] if blocks else None,
            "block_count": len(blocks),
            "pending_count": len(snapshot["pending_transactions"]),
            "reward_transaction": reward_tx,
            "reward_created_block": reward_block,
            "reward_block_file": block_filename(reward_block["block_id"]) if reward_block else None,
            "sync_results": sync_results,
        }


STORE = LedgerStore()


class LedgerHandler(BaseHTTPRequestHandler):
    server_version = "LedgerHTTP/3.0"

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, indent=2, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/") if parsed.path.strip("/") else []

        try:
            if parsed.path == "/health":
                self._send_json(HTTPStatus.OK, {"status": "ok", "node_id": NODE_ID, "timestamp": utc_now()})
                return
            if len(parts) == 2 and parts[0] == "balance":
                self._send_json(HTTPStatus.OK, {"account": parts[1], "balance": STORE.account_balance(parts[1]), "node_id": NODE_ID})
                return
            if len(parts) == 2 and parts[0] == "log":
                self._send_json(HTTPStatus.OK, {"account": parts[1], "transactions": STORE.account_log(parts[1]), "node_id": NODE_ID})
                return
            if parsed.path == "/chain":
                self._send_json(HTTPStatus.OK, STORE.chain_snapshot())
                return
            if parsed.path == "/chain/check":
                self._send_json(HTTPStatus.OK, STORE.check_chain())
                return
            if parsed.path == "/status":
                self._send_json(HTTPStatus.OK, STORE.cluster_status())
                return
            if parsed.path == "/status/consistency":
                self._send_json(HTTPStatus.OK, STORE.cluster_consistency())
                return
            if parsed.path.startswith("/tx/") and len(parts) == 2:
                self._send_json(HTTPStatus.OK, STORE.find_transaction(parts[1]))
                return
            if parsed.path == "/leaderboard":
                self._send_json(HTTPStatus.OK, STORE.leaderboard())
                return
            if parsed.path == "/operations":
                self._send_json(HTTPStatus.OK, STORE.operations_log())
                return
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found."})
        except Exception as exc:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc), "node_id": NODE_ID})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        try:
            if parsed.path == "/transaction":
                payload = self._read_json()
                result = STORE.add_transaction(
                    sender=str(payload["from"]).strip(),
                    recipient=str(payload["to"]).strip(),
                    amount=float(payload["amount"]),
                    replicate=bool(payload.get("replicate", True)),
                )
                self._send_json(HTTPStatus.CREATED, result)
                return
            if parsed.path == "/mine":
                payload = self._read_json()
                miner = str(payload.get("miner", "miner1")).strip() or "miner1"
                self._send_json(HTTPStatus.CREATED, STORE.mine_pending(miner, replicate=bool(payload.get("replicate", True))))
                return
            if parsed.path == "/chain/check":
                payload = self._read_json()
                reward_to = str(payload.get("reward_to", "")).strip() or None
                self._send_json(HTTPStatus.OK, STORE.check_chain(reward_to=reward_to, replicate=bool(payload.get("replicate", True))))
                return
            if parsed.path == "/leaderboard":
                payload = self._read_json()
                self._send_json(HTTPStatus.OK, STORE.leaderboard(limit=int(payload.get("limit", 10))))
                return
            if parsed.path == "/operations":
                payload = self._read_json()
                self._send_json(HTTPStatus.OK, STORE.operations_log(limit=int(payload.get("limit", 50))))
                return
            if parsed.path == "/sync":
                payload = self._read_json()
                self._send_json(HTTPStatus.OK, STORE.apply_snapshot(payload))
                return
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found."})
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc), "node_id": NODE_ID})
        except KeyError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": f"Missing field: {exc.args[0]}", "node_id": NODE_ID})
        except json.JSONDecodeError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body.", "node_id": NODE_ID})
        except Exception as exc:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc), "node_id": NODE_ID})

    def log_message(self, format: str, *args: Any) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {NODE_ID} {self.address_string()} {format % args}")


def main() -> None:
    host = os.environ.get("LEDGER_HOST", "0.0.0.0")
    port = int(os.environ.get("LEDGER_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), LedgerHandler)
    print(f"Ledger server {NODE_ID} listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
