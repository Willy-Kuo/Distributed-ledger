import sys

from client_cli import print_json, request_json


def main() -> None:
    reward_to = sys.argv[1] if len(sys.argv) == 2 else "auditor"
    print_json(request_json("POST", "/chain/check", {"reward_to": reward_to}))


if __name__ == "__main__":
    main()
