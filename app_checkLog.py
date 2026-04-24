import sys

from client_cli import print_json, request_json


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python app_checkLog.py <account>")
    print_json(request_json("GET", f"/log/{sys.argv[1]}"))


if __name__ == "__main__":
    main()
