#!/usr/bin/env python3
"""
Generate Whispro WP app icons matching the in-app logo design.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Android mipmap sizes
LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive icon foreground sizes (108dp at each density)
FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

OUTPUT_DIR = "web-client/android/app/src/main/res"


def draw_wp_logo(size: int, is_foreground: bool = False) -> Image.Image:
    """Draw the WP logo with text."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    center = size // 2
    
    if is_foreground:
        # Adaptive icons: content in inner 66/108 = 61% of size
        radius = int(size * 0.24)
        font_size = int(size * 0.22)
    else:
        # Legacy icons: use full space
        radius = int(size * 0.42)
        font_size = int(size * 0.38)
    
    # Background circle - dark blue
    draw.ellipse(
        [center - radius, center - radius,
         center + radius, center + radius],
        fill=(30, 58, 95, 255)  # #1e3a5f
    )
    
    # Try to load a bold font
    font = None
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/google-noto/NotoSans-Bold.ttf",
    ]
    for fp in font_paths:
        try:
            font = ImageFont.truetype(fp, font_size)
            break
        except:
            continue
    
    if font is None:
        font = ImageFont.load_default()
    
    # Calculate text positions
    w_bbox = draw.textbbox((0, 0), "W", font=font)
    p_bbox = draw.textbbox((0, 0), "P", font=font)
    
    w_width = w_bbox[2] - w_bbox[0]
    p_width = p_bbox[2] - p_bbox[0]
    text_height = w_bbox[3] - w_bbox[1]
    
    spacing = int(size * 0.01)
    total_width = w_width + spacing + p_width
    
    start_x = center - total_width // 2
    text_y = center - text_height // 2 - int(font_size * 0.1)
    
    # Draw W (white)
    draw.text((start_x, text_y), "W", fill=(255, 255, 255, 255), font=font)
    
    # Draw P (blue)
    draw.text((start_x + w_width + spacing, text_y), "P", fill=(96, 165, 250, 255), font=font)
    
    return img


def create_round_icon(img: Image.Image) -> Image.Image:
    """Create a round version of the icon."""
    size = img.size[0]
    
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)
    
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    
    return result


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("Generating launcher icons...")
    for folder, size in LAUNCHER_SIZES.items():
        folder_path = os.path.join(OUTPUT_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        icon = draw_wp_logo(size, is_foreground=False)
        icon.save(os.path.join(folder_path, "ic_launcher.png"))
        
        round_icon = create_round_icon(icon)
        round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"))
        
        print(f"  {folder}: {size}x{size}")
    
    print("\nGenerating adaptive icon foregrounds...")
    for folder, size in FOREGROUND_SIZES.items():
        folder_path = os.path.join(OUTPUT_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        foreground = draw_wp_logo(size, is_foreground=True)
        foreground.save(os.path.join(folder_path, "ic_launcher_foreground.png"))
        
        print(f"  {folder}: {size}x{size}")
    
    print("\n✓ All icons generated!")


if __name__ == "__main__":
    main()
