import sys
import os
import binascii
import rsa

from client_cli import print_json, request_json

def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: python app_transaction.py <from> <to> <amount>")
    
    sender = sys.argv[1]
    recipient = sys.argv[2]
    amount = float(sys.argv[3])
    
    # 讀取發送者的私鑰檔案
    priv_key_path = f"/app/{sender}_priv.pem"
    if not os.path.exists(priv_key_path):
        raise SystemExit(f"❌ 錯誤：找不到 {sender} 的私鑰！請先執行: python app_keygen.py {sender}")
        
    with open(priv_key_path, "rb") as f:
        priv_key = rsa.PrivateKey.load_pkcs1(f.read())
        
    # 將交易內容進行數位簽章
    message = f"{sender},{recipient},{amount}".encode('utf-8')
    signature = rsa.sign(message, priv_key, 'SHA-256')
    signature_hex = binascii.hexlify(signature).decode('utf-8')

    # 將簽章 (signature) 一起放入 JSON payload 發送給伺服器
    print_json(
        request_json(
            "POST",
            "/transaction",
            {
                "from": sender, 
                "to": recipient, 
                "amount": amount, 
                "signature": signature_hex
            },
        )
    )

if __name__ == "__main__":
    main()