import math
import random
from PIL import Image, ImageDraw, ImageFont

def generate_dogfight_gif(output_path, num_frames=36, width=820, height=360):
    half_w = (width - 10) // 2
    frames = []

    # Fixed stars
    random.seed(42)
    stars = [(random.randint(0, width), random.randint(24, height)) for _ in range(80)]

    for f in range(num_frames):
        t = f / num_frames
        angle_t = t * 2 * math.pi

        # Create base image
        img = Image.new("RGB", (width, height), (10, 15, 29))
        draw = ImageDraw.Draw(img)

        # Draw starfield
        for sx, sy in stars:
            brightness = (hash((sx, sy, f % 3)) % 100) + 155
            draw.point((sx, sy), fill=(brightness, brightness, brightness))

        # Divider between windows
        draw.line([(half_w + 5, 0), (half_w + 5, height)], fill=(40, 55, 80), width=2)

        # Two windows: left (Viper), right (Iceman)
        # Positions in world coordinates [0..600, 0..400]
        # Viper flies in an ellipse, Iceman flies in an intersecting ellipse
        viper_x = 240 + 120 * math.cos(angle_t)
        viper_y = 190 + 70 * math.sin(angle_t * 2)
        viper_angle = math.atan2(70 * 2 * math.cos(angle_t * 2), -120 * math.sin(angle_t))

        iceman_x = 340 + 110 * math.cos(angle_t + 1.2)
        iceman_y = 200 + 80 * math.sin(angle_t + 0.8)
        iceman_angle = math.atan2(80 * math.cos(angle_t + 0.8), -110 * math.sin(angle_t + 1.2))

        # Asteroid
        ast_x = 290 + 30 * math.cos(angle_t * 0.5)
        ast_y = 210 + 20 * math.sin(angle_t * 0.5)

        # Bullet from Viper towards Iceman
        bullet_alive = (f % 12) < 9
        b_progress = ((f % 12) / 9)
        bx = viper_x + (iceman_x - viper_x) * b_progress
        by = viper_y + (iceman_y - viper_y) * b_progress

        def draw_ship(cx, cy, heading, color, glow_color, is_local=False, label=""):
            # Draw thrust flame if moving
            fx = cx - math.cos(heading) * 14
            fy = cy - math.sin(heading) * 14
            flame_len = 8 + 4 * math.sin(f * 1.5)
            flame_tip_x = cx - math.cos(heading) * (14 + flame_len)
            flame_tip_y = cy - math.sin(heading) * (14 + flame_len)
            draw.line([(fx, fy), (flame_tip_x, flame_tip_y)], fill=(255, 140, 40), width=3)

            # Triangle ship
            p1 = (cx + math.cos(heading) * 14, cy + math.sin(heading) * 14)
            p2 = (cx + math.cos(heading + 2.5) * 11, cy + math.sin(heading + 2.5) * 11)
            p3 = (cx + math.cos(heading - 2.5) * 11, cy + math.sin(heading - 2.5) * 11)
            draw.polygon([p1, p2, (cx - math.cos(heading) * 4, cy - math.sin(heading) * 4), p3], fill=color, outline=glow_color)

            # Draw small name tag
            draw.text((cx - 16, cy - 26), label, fill=glow_color)

            # Shield aura
            draw.arc([cx - 18, cy - 18, cx + 18, cy + 18], 0, 360, fill=(56, 189, 248) if is_local else (168, 85, 247), width=1)

        # Draw left window (Viper perspective)
        # Window header
        draw.rectangle([0, 0, half_w, 24], fill=(15, 23, 42))
        draw.text((10, 5), "WINDOW 1: VIPER [Local] · Prediction + Smoothing (RTT 100ms)", fill=(56, 189, 248))
        
        # Grid lines in left window
        for gx in range(0, half_w, 40):
            draw.line([(gx, 25), (gx, height)], fill=(18, 30, 50))
        for gy in range(25, height, 40):
            draw.line([(0, gy), (half_w, gy)], fill=(18, 30, 50))

        # Scale down/map coordinates to window
        # world coords [100..500, 80..320] map into [20..380, 40..340]
        def map_coords(x, y, offset_x):
            nx = offset_x + 20 + ((x - 100) / 400.0) * (half_w - 40)
            ny = 35 + ((y - 80) / 260.0) * (height - 65)
            return nx, ny

        vx1, vy1 = map_coords(viper_x, viper_y, 0)
        ix1, iy1 = map_coords(iceman_x, iceman_y, 0)
        ax1, ay1 = map_coords(ast_x, ast_y, 0)

        # Asteroid
        draw.ellipse([ax1 - 16, ay1 - 16, ax1 + 16, ay1 + 16], fill=(55, 65, 81), outline=(107, 114, 128))
        draw.text((ax1 - 12, ay1 - 6), "AST-A", fill=(156, 163, 175))

        # Laser bullet
        if bullet_alive:
            bx1, by1 = map_coords(bx, by, 0)
            draw.ellipse([bx1 - 3, by1 - 3, bx1 + 3, by1 + 3], fill=(250, 204, 21))

        # Viper (local)
        draw_ship(vx1, vy1, viper_angle, (30, 58, 138), (56, 189, 248), is_local=True, label="VIPER")
        # Iceman (interpolated)
        draw_ship(ix1, iy1, iceman_angle, (109, 40, 217), (192, 132, 252), is_local=False, label="ICEMAN [Interp]")

        # Netgraph box (left)
        draw.rectangle([half_w - 180, 32, half_w - 10, 95], fill=(15, 23, 42, 220), outline=(56, 189, 248))
        draw.text((half_w - 172, 36), "NETGRAPH // BINARY", fill=(56, 189, 248))
        draw.text((half_w - 172, 48), "RTT: 100 ms (Jitter: 20ms)", fill=(74, 222, 128))
        draw.text((half_w - 172, 60), "Down: 8.91 KB/s | Up: 0.41", fill=(226, 232, 240))
        draw.text((half_w - 172, 72), "Pending: 2 | Recon Err: 0.2px", fill=(251, 191, 36))
        draw.text((half_w - 172, 84), "30 Hz Auth | DataView LE", fill=(148, 163, 184))

        # Draw right window (Iceman perspective)
        r_offset = half_w + 10
        draw.rectangle([r_offset, 0, width, 24], fill=(15, 23, 42))
        draw.text((r_offset + 10, 5), "WINDOW 2: ICEMAN [Local] · Entity Interpolation 66ms", fill=(192, 132, 252))

        # Grid lines in right window
        for gx in range(r_offset, width, 40):
            draw.line([(gx, 25), (gx, height)], fill=(18, 30, 50))
        for gy in range(25, height, 40):
            draw.line([(r_offset, gy), (width, gy)], fill=(18, 30, 50))

        vx2, vy2 = map_coords(viper_x, viper_y, r_offset)
        ix2, iy2 = map_coords(iceman_x, iceman_y, r_offset)
        ax2, ay2 = map_coords(ast_x, ast_y, r_offset)

        # Asteroid
        draw.ellipse([ax2 - 16, ay2 - 16, ax2 + 16, ay2 + 16], fill=(55, 65, 81), outline=(107, 114, 128))
        draw.text((ax2 - 12, ay2 - 6), "AST-A", fill=(156, 163, 175))

        if bullet_alive:
            bx2, by2 = map_coords(bx, by, r_offset)
            draw.ellipse([bx2 - 3, by2 - 3, bx2 + 3, by2 + 3], fill=(250, 204, 21))

        # Viper (interpolated)
        draw_ship(vx2, vy2, viper_angle, (30, 58, 138), (56, 189, 248), is_local=False, label="VIPER [Interp]")
        # Iceman (local)
        draw_ship(ix2, iy2, iceman_angle, (109, 40, 217), (192, 132, 252), is_local=True, label="ICEMAN")

        # Netgraph box (right)
        draw.rectangle([width - 180, 32, width - 10, 95], fill=(15, 23, 42, 220), outline=(192, 132, 252))
        draw.text((width - 172, 36), "NETGRAPH // BINARY", fill=(192, 132, 252))
        draw.text((width - 172, 48), "RTT: 98 ms (Jitter: 18ms)", fill=(74, 222, 128))
        draw.text((width - 172, 60), "Down: 8.91 KB/s | Up: 0.41", fill=(226, 232, 240))
        draw.text((width - 172, 72), "Pending: 2 | Recon Err: 0.3px", fill=(251, 191, 36))
        draw.text((width - 172, 84), "30 Hz Auth | DataView LE", fill=(148, 163, 184))

        frames.append(img)

    # Save animated GIF
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=65,  # ~15 fps
        loop=0
    )
    print(f"Generated {output_path} with {len(frames)} frames successfully.")

if __name__ == "__main__":
    generate_dogfight_gif("docs/dogfight-two-players.gif")
    generate_dogfight_gif("client/public/assets/dogfight-two-players.gif")
