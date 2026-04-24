import sys

from client_cli import print_json, request_json


def main() -> None:
    if len(sys.argv) == 2:
        print_json(request_json("POST", "/leaderboard", {"limit": int(sys.argv[1])}))
        return
    print_json(request_json("GET", "/leaderboard"))


if __name__ == "__main__":
    main()
