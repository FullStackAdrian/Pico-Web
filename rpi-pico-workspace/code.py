import time
import usb_hid
import wifi
import socketpool
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode
from keyboard_layout_win_es import KeyboardLayout as LayoutES 

# CONFIG AP 
AP_SSID = "PicoW-Writer"
AP_PASSWORD = "12345678"

wifi.radio.start_ap(AP_SSID, AP_PASSWORD)
print("AP iniciado. SSID:", AP_SSID, "IP:", wifi.radio.ipv4_address_ap)

# keyboard init
kbd = Keyboard(usb_hid.devices)
layout = LayoutES(kbd)

def press_enter():
    """Envia ENTER (útil también para '\n')."""
    kbd.press(Keycode.ENTER)
    kbd.release_all()
    time.sleep(0.03)

# url decode to bytearray and then to str
def url_decode(s):

    ba = bytearray()
    i = 0
    L = len(s)
    while i < L:
        c = s[i]
        if c == "%":
            if i + 2 < L:
                try:
                    ba.append(int(s[i + 1 : i + 3], 16))
                    i += 3
                except Exception:
                    # si no son hex, dejar '%' literal
                    ba.append(ord("%"))
                    i += 1
            else:
                ba.append(ord("%"))
                i += 1
        elif c == "+":
            ba.append(ord(" "))
            i += 1
        else:
            ba.append(ord(c))
            i += 1
    try:
        return ba.decode("utf-8")
    except Exception:
        return ba.decode("latin-1")

def type_text_with_layout(text):
    for ch in text:
        if ch == "\n":
            press_enter()
        else:
            layout.write(ch)
            time.sleep(0.005)

## http server
pool = socketpool.SocketPool(wifi.radio)
server_socket = pool.socket(pool.AF_INET, pool.SOCK_STREAM)
server_socket.bind(("0.0.0.0", 80))
server_socket.listen(1)

print("Servidor listo, esperando peticiones...")

while True:
    try:
        conn, addr = server_socket.accept()
        print("Conexión desde:", addr)

        buf = bytearray(8192)  # buffer de 8KB
        n = conn.recv_into(buf)
        if not n:
            conn.close()
            continue

        req = bytes(buf[:n]).decode("utf-8", "ignore")
        first_line = req.split("\n")[0]
        if first_line.startswith("OPTIONS"):
            response = (
                "HTTP/1.1 204 No Content\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type\r\n"
                "\r\n"
            )
            conn.send(response.encode("utf-8"))
            conn.close()
            continue

        if "GET" in first_line and "msg=" in first_line:
            start = first_line.find("msg=") + 4
            msg_part = first_line[start:]
            msg_encoded = msg_part.split(" ")[0].split("&")[0]
            decoded = url_decode(msg_encoded)

            print("Texto decodificado:", decoded)
            type_text_with_layout(decoded) 
            press_enter()

            response = (
                "HTTP/1.1 204 No Content\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type\r\n"
                "\r\n"
            )
            conn.send(response.encode("utf-8"))
        else:
            response = (
                "HTTP/1.1 400 Bad Request\r\n"
                "Content-Type: text/plain\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "\r\n"
                "No msg"
            )
            conn.send(response.encode("utf-8"))

        conn.close()

    except Exception as e:
        print("Error principal:", e)
        time.sleep(0.2)