import sys

from client_cli import print_json, request_json


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: python app_transaction.py <from> <to> <amount>")
    print_json(
        request_json(
            "POST",
            "/transaction",
            {"from": sys.argv[1], "to": sys.argv[2], "amount": float(sys.argv[3])},
        )
    )


if __name__ == "__main__":
    main()
