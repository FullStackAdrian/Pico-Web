import time
import usb_hid
import wifi
import socketpool
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode
from adafruit_hid.keyboard_layout_us import KeyboardLayoutUS

# CONFIG AP 
AP_SSID = "PicoW-Writer"
AP_PASSWORD = "12345678"

print("Iniciando Access Point...")
wifi.radio.start_ap(AP_SSID, AP_PASSWORD)
print("AP iniciado. SSID:", AP_SSID, "IP:", wifi.radio.ipv4_address_ap)

# keyboard init
kbd = Keyboard(usb_hid.devices)
layout = KeyboardLayoutBase(kbd)

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

# remap accented characters to non-accented ASCII
accent_map = {
    "á": "a",
    "Á": "A",
    "é": "e",
    "É": "E",
    "í": "i",
    "Í": "I",
    "ó": "o",
    "Ó": "O",
    "ú": "u",
    "Ú": "U",
    "ñ": "n",
    "Ñ": "N",
    "ü": "u",
    "Ü": "U",
}

# manual mapping for special characters not handled by layout.write
special_map = {
    "-": (Keycode.MINUS, False),
    "|": (Keycode.BACKSLASH, True),  # '|' = SHIFT + BACKSLASH en layout US
    "&": (Keycode.SEVEN, True),  # '&' = SHIFT + '7'
    "/": (Keycode.FORWARD_SLASH, False),
    "\\": (Keycode.BACKSLASH, False),
    "_": (Keycode.MINUS, True),  # '_' = SHIFT + '-'
    "=": (Keycode.EQUALS, False),
    "+": (Keycode.EQUALS, True),
    ";": (Keycode.SEMICOLON, False),
    ":": (Keycode.SEMICOLON, True),
    ",": (Keycode.COMMA, False),
    "<": (Keycode.COMMA, True),
    ".": (Keycode.PERIOD, False),
    ">": (Keycode.PERIOD, True),
    "?": (Keycode.FORWARD_SLASH, True),
    "'": (Keycode.QUOTE, False),
    '"': (Keycode.QUOTE, True),
    "[": (Keycode.LEFT_BRACKET, False),
    "{": (Keycode.LEFT_BRACKET, True),
    "]": (Keycode.RIGHT_BRACKET, False),
    "}": (Keycode.RIGHT_BRACKET, True),
    "(": (Keycode.NINE, True),
    ")": (Keycode.ZERO, True),
    "!": (Keycode.ONE, True),
    "@": (Keycode.TWO, True),
    "#": (Keycode.THREE, True),
    "$": (Keycode.FOUR, True),
    "%": (Keycode.FIVE, True),
    "^": (Keycode.SIX, True),
    "*": (Keycode.EIGHT, True),
}


# write text preferring special character mapping, normalizing to ASCII
def type_text_ascii_prefer_symbols(text):

    for ch in text:
        if ch == "\n":
            press_enter()
            continue

        # normalize accented characters to ASCII
        if ord(ch) > 127:
            if ch in accent_map:
                ch = accent_map[ch]
            else:
                # not ascii will ignored
                continue

        # write the special mapped character
        if ch in special_map:
            keycode, need_shift = special_map[ch]
            if need_shift:
                kbd.press(Keycode.SHIFT, keycode)
                kbd.release_all()
            else:
                kbd.press(keycode)
                kbd.release_all()
            time.sleep(0.01)
            continue

        # write in US layout
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

        buf = bytearray(2048)
        n = conn.recv_into(buf)
        if not n:
            conn.close()
            continue

        req = bytes(buf[:n]).decode("utf-8", "ignore")
        # primera línea: p.e. "GET /?msg=hola%20mundo HTTP/1.1"
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
            # coger texto después de msg= hasta el siguiente espacio (fin de la URL)
            start = first_line.find("msg=") + 4
            msg_part = first_line[start:]
            # puede contener &otrosparam o un espacio al final -> quedarnos con hasta el espacio
            msg_encoded = msg_part.split(" ")[0].split("&")[0]
            decoded = url_decode(msg_encoded)

            print("Texto decodificado:", decoded)
            type_text_ascii_prefer_symbols(decoded)
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
        # seguir corriendo (no reiniciamos el Pico)
        time.sleep(0.2)
