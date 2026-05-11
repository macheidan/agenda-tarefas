"""
Remove o fundo amarelo da logo deixando só a fatia de pizza.
Usa flood fill a partir dos 4 cantos para não tocar no queijo amarelo da fatia.
Salva uma cópia transparente em public/logo.png (mantém src/imgs/logo.png original).
"""
from PIL import Image
from collections import deque
import sys

SRC = r"C:\claude_project\Pizzarias\intranet-pizzarias\src\imgs\logo.png"
DST = r"C:\claude_project\Pizzarias\intranet-pizzarias\public\logo.png"
TOL = 35  # tolerância de cor (0-255 por canal)

img = Image.open(SRC).convert("RGBA")
w, h = img.size
print(f"Tamanho: {w}x{h}")

pixels = img.load()
bg = pixels[0, 0][:3]
print(f"Cor de fundo detectada (canto 0,0): RGB{bg}")


def near(c1, c2, tol=TOL):
    return all(abs(c1[i] - c2[i]) <= tol for i in range(3))


visited = [[False] * w for _ in range(h)]
queue = deque()
for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    queue.append((sx, sy))

cleared = 0
while queue:
    x, y = queue.popleft()
    if x < 0 or x >= w or y < 0 or y >= h:
        continue
    if visited[y][x]:
        continue
    r, g, b, a = pixels[x, y]
    if a == 0 or not near((r, g, b), bg):
        continue
    visited[y][x] = True
    pixels[x, y] = (r, g, b, 0)
    cleared += 1
    queue.append((x + 1, y))
    queue.append((x - 1, y))
    queue.append((x, y + 1))
    queue.append((x, y - 1))

print(f"Pixels removidos: {cleared} ({cleared * 100 // (w * h)}% da imagem)")

img.save(DST, "PNG", optimize=True)
print(f"Salvo em: {DST}")
