import json
import urllib.request
from client_cli import print_json, request_json

def main() -> None:
    print("正在取得叢集一致性狀態...\n")
    data = request_json("GET", "/status/consistency")
    print_json(data)
    
    if data.get("consistent"):
        print("\n✅ 共識達成：所有節點帳本皆完整且一致。")
        return
        
    print("\n⚠️ 警告：偵測到帳本分歧！啟動「多數決自動修復機制」...")
    nodes = data.get("nodes", [])
    
    # 統計哪個 Hash 是多數
    hash_counts = {}
    for node in nodes:
        h = node.get("last_block_hash")
        if h:
            hash_counts[h] = hash_counts.get(h, 0) + 1
            
    if not hash_counts:
        print("所有節點皆無資料。")
        return
        
    # 找出多數決 Hash 與其代表節點
    majority_hash = max(hash_counts, key=hash_counts.get)
    source_node = next((n["node_id"] for n in nodes if n.get("last_block_hash") == majority_hash), None)
    
    if not source_node:
        print("無法決定正確的來源節點。")
        return
        
    print(f"\n[1] 找到多數決正確節點: {source_node}，正在下載最新帳本快照...")
    req = urllib.request.Request(f"http://{source_node}:8000/chain", method="GET")
    with urllib.request.urlopen(req) as response:
        snapshot = json.loads(response.read().decode("utf-8"))
        
    # 找出錯誤節點並強制修復
    for node in nodes:
        if node.get("last_block_hash") != majority_hash:
            bad_node = node["node_id"]
            print(f"[2] 偵測到 {bad_node} 的帳本異常或落後！強制同步覆寫...")
            req = urllib.request.Request(f"http://{bad_node}:8000/sync", 
                                         data=json.dumps(snapshot).encode("utf-8"),
                                         headers={"Content-Type": "application/json"},
                                         method="POST")
            with urllib.request.urlopen(req):
                print(f"🔧 {bad_node} 修復完成！已恢復與主網共識。")

if __name__ == "__main__":
    main()