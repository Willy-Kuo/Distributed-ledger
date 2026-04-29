import sys
import binascii
from pathlib import Path

import rsa

from client_cli import print_json, request_json


def main() -> None:
    if len(sys.argv) not in {4, 5}:
        raise SystemExit("Usage: python app_transaction.py <from> <to> <amount> [private_key_path]")
    sender = sys.argv[1]
    recipient = sys.argv[2]
    amount = float(sys.argv[3])
    private_key_path = Path(sys.argv[4]) if len(sys.argv) == 5 else Path(f"/app/{sender}_priv.pem")

    if sender not in {"SYSTEM", "angel"}:
        if not private_key_path.exists():
            raise SystemExit(
                f"Private key not found: {private_key_path}. Save the account private key and pass its path."
            )
        private_key = rsa.PrivateKey.load_pkcs1(private_key_path.read_bytes())
        amount_text = f"{amount}"
        signature = rsa.sign(f"{sender},{recipient},{amount_text}".encode("utf-8"), private_key, "SHA-256")
        signature_hex = binascii.hexlify(signature).decode("utf-8")
    else:
        signature_hex = None

    payload = {"from": sender, "to": recipient, "amount": amount}
    if signature_hex:
        payload["signature"] = signature_hex
    print_json(
        request_json(
            "POST",
            "/transaction",
            payload,
        )
    )


if __name__ == "__main__":
    main()
