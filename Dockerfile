# ── Stage 1: Build ──────────────────────────────────────────────────────────
# Use Node 20 LTS (slim) to install dependencies and compile the Vite app.
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first so Docker can cache the npm install layer separately.
COPY package.json package-lock.json ./

RUN npm ci

# Copy the rest of the source code and build.
COPY . .

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
# Use minimal nginx image. Final image contains ONLY nginx + compiled static files.
# Node.js is NOT present in the final image — keeps the image small (~25 MB).
FROM nginx:alpine AS runner

# Remove the default nginx welcome page.
RUN rm -rf /usr/share/nginx/html/*

# Copy the compiled Vite output from the build stage.
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom nginx config (port 8080, SPA fallback).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run requires the container to listen on port 8080.
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
