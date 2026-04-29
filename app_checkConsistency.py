import json
import urllib.request

from client_cli import print_json, request_json


def main() -> None:
    data = request_json("GET", "/status/consistency")
    print_json(data)

    if data.get("consistent"):
        print("\nConsensus reached: all node ledgers are consistent.")
        return

    print("\nLedger divergence detected. Starting majority repair...")
    nodes = data.get("nodes", [])
    hash_counts = {}
    for node in nodes:
        last_hash = node.get("last_block_hash")
        if last_hash:
            hash_counts[last_hash] = hash_counts.get(last_hash, 0) + 1

    if not hash_counts:
        print("No node hashes available; repair skipped.")
        return

    majority_hash = max(hash_counts, key=hash_counts.get)
    source_node = next((node["node_id"] for node in nodes if node.get("last_block_hash") == majority_hash), None)
    if not source_node:
        print("Could not choose a repair source node.")
        return

    print(f"Using {source_node} as repair source.")
    with urllib.request.urlopen(f"http://{source_node}:8000/chain") as response:
        snapshot = json.loads(response.read().decode("utf-8"))

    for node in nodes:
        if node.get("last_block_hash") == majority_hash:
            continue
        bad_node = node["node_id"]
        print(f"Repairing {bad_node}...")
        request = urllib.request.Request(
            f"http://{bad_node}:8000/sync",
            data=json.dumps(snapshot).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request):
            print(f"{bad_node} repaired.")


if __name__ == "__main__":
    main()
