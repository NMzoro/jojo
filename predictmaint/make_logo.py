from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 240
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
red = (228, 25, 55, 255)
font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 118)
text = "NEXTEER"
x, y = 24, 34
for ch in text:
    d.text((x, y), ch, font=font, fill=red)
    x += d.textlength(ch, font=font) + 2
d.arc((18, 62, 980, 242), start=18, end=162, fill=red, width=9)
img.save(r"C:\Users\med\Desktop\jk\predictmaint\frontend\public\assets\nexteer-logo.png")
print("logo genere")
