from client_cli import print_json, request_json


def main() -> None:
    print_json(request_json("GET", "/status/consistency"))


if __name__ == "__main__":
    main()
