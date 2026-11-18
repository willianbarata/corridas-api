# Corridas API — renderiza corridas de animais 3D (Godot 4.7.2) a partir de JSON.
# Servidor sem GPU: Godot roda numa tela virtual (Xvfb) com OpenGL por software (Mesa llvmpipe).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg xvfb xauth \
      libgl1 libgl1-mesa-dri libglx-mesa0 libegl1 libgles2 \
      libxcursor1 libxinerama1 libxrandr2 libxi6 libxkbcommon0 libxrender1 libxext6 libx11-6 \
      libasound2 libpulse0 libfontconfig1 libdbus-1-3 libudev1 \
      ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

# Godot oficial, conferido por SHA-256 (release 4.7.2-stable no GitHub)
ARG GODOT_URL=https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip
ARG GODOT_SHA256=cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4
RUN curl -fsSL -o /tmp/godot.zip "$GODOT_URL" \
  && echo "$GODOT_SHA256  /tmp/godot.zip" | sha256sum -c - \
  && unzip -q /tmp/godot.zip -d /tmp/godot \
  && mv /tmp/godot/Godot_v4.7.2-stable_linux.x86_64 /usr/local/bin/godot \
  && chmod +x /usr/local/bin/godot && rm -rf /tmp/godot /tmp/godot.zip

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    RENDER_WRAPPER=xvfb-run \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe

RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
