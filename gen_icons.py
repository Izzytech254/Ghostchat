#!/usr/bin/env python3
"""Generate WP logo app icons for Android"""

from PIL import Image, ImageDraw, ImageFont
import os

# Icon sizes for different densities
ICON_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# Foreground sizes for adaptive icons
FOREGROUND_SIZES = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
}

BASE_PATH = '/home/boss/Documents/Projects/Whispro/web-client/android/app/src/main/res'

def create_icon(size, is_foreground=False, is_round=False):
    """Create WP logo icon"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background (only for non-foreground icons)
    if not is_foreground:
        bg_color = (10, 10, 20, 255)  # Dark blue-black
        
        if is_round:
            draw.ellipse([0, 0, size-1, size-1], fill=bg_color)
            margin = int(size * 0.08)
            draw.ellipse([margin, margin, size-margin-1, size-margin-1], 
                        outline=(59, 130, 246, 80), width=max(1, int(size*0.02)))
        else:
            radius = int(size * 0.22)
            draw.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=bg_color)
            draw.rounded_rectangle([1, 1, size-2, size-2], radius=radius-1, 
                                  outline=(59, 130, 246, 60), width=max(1, int(size*0.015)))
    
    # Calculate text size
    if is_foreground:
        safe_zone = size * 0.66
        text_size = int(safe_zone * 0.45)
    else:
        text_size = int(size * 0.38)
    
    # Try fonts
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", text_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", text_size)
        except:
            font = ImageFont.load_default()
    
    # Draw "WP" text
    text = "WP"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]
    
    text_color = (59, 130, 246, 255)  # Blue
    
    # Shadow
    shadow_offset = max(1, int(size * 0.015))
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=(0, 0, 0, 100))
    
    # Main text
    draw.text((x, y), text, font=font, fill=text_color)
    
    return img

if __name__ == '__main__':
    # Generate all icons
    for folder, size in ICON_SIZES.items():
        path = os.path.join(BASE_PATH, folder)
        os.makedirs(path, exist_ok=True)
        
        icon = create_icon(size, is_foreground=False, is_round=False)
        icon.save(os.path.join(path, 'ic_launcher.png'))
        
        round_icon = create_icon(size, is_foreground=False, is_round=True)
        round_icon.save(os.path.join(path, 'ic_launcher_round.png'))
        
        print(f"Created {folder}: {size}x{size}")

    # Generate foreground icons
    for folder, size in FOREGROUND_SIZES.items():
        path = os.path.join(BASE_PATH, folder)
        fg_icon = create_icon(size, is_foreground=True)
        fg_icon.save(os.path.join(path, 'ic_launcher_foreground.png'))
        print(f"Created foreground {folder}: {size}x{size}")

    print("\n✓ All icons generated!")
