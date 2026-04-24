import json
import os
import sys
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SERVER_URL = os.environ.get("LEDGER_URL", "http://node1:8000")


def request_json(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(f"{SERVER_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": body}
        raise SystemExit(f"HTTP {exc.code}: {payload.get('error', body)}") from exc
    except URLError as exc:
        raise SystemExit(f"Cannot reach ledger service: {exc.reason}") from exc


def print_json(data: Dict[str, Any]) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def usage() -> None:
    print(
        "\n".join(
            [
                "Usage:",
                "  python client_cli.py check-money <account>",
                "  python client_cli.py check-log <account>",
                "  python client_cli.py transaction <from> <to> <amount>",
                "  python client_cli.py check-chain [reward_to]",
                "  python client_cli.py mine <miner>",
                "  python client_cli.py show-chain",
                "  python client_cli.py status",
                "  python client_cli.py consistency",
                "  python client_cli.py tx <tx_id>",
                "  python client_cli.py leaderboard [limit]",
                "  python client_cli.py operations [limit]",
            ]
        )
    )
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) < 2:
        usage()

    command = sys.argv[1]
    if command == "check-money" and len(sys.argv) == 3:
        print_json(request_json("GET", f"/balance/{sys.argv[2]}"))
        return
    if command == "check-log" and len(sys.argv) == 3:
        print_json(request_json("GET", f"/log/{sys.argv[2]}"))
        return
    if command == "transaction" and len(sys.argv) == 5:
        print_json(request_json("POST", "/transaction", {"from": sys.argv[2], "to": sys.argv[3], "amount": float(sys.argv[4])}))
        return
    if command == "check-chain" and len(sys.argv) in {2, 3}:
        payload = {"reward_to": sys.argv[2]} if len(sys.argv) == 3 else None
        method = "POST" if payload else "GET"
        print_json(request_json(method, "/chain/check", payload))
        return
    if command == "mine" and len(sys.argv) == 3:
        print_json(request_json("POST", "/mine", {"miner": sys.argv[2]}))
        return
    if command == "show-chain" and len(sys.argv) == 2:
        print_json(request_json("GET", "/chain"))
        return
    if command == "status" and len(sys.argv) == 2:
        print_json(request_json("GET", "/status"))
        return
    if command == "consistency" and len(sys.argv) == 2:
        print_json(request_json("GET", "/status/consistency"))
        return
    if command == "tx" and len(sys.argv) == 3:
        print_json(request_json("GET", f"/tx/{sys.argv[2]}"))
        return
    if command == "leaderboard" and len(sys.argv) in {2, 3}:
        if len(sys.argv) == 3:
            print_json(request_json("POST", "/leaderboard", {"limit": int(sys.argv[2])}))
        else:
            print_json(request_json("GET", "/leaderboard"))
        return
    if command == "operations" and len(sys.argv) in {2, 3}:
        if len(sys.argv) == 3:
            print_json(request_json("POST", "/operations", {"limit": int(sys.argv[2])}))
        else:
            print_json(request_json("GET", "/operations"))
        return
    usage()


if __name__ == "__main__":
    main()
