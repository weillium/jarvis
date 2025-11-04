FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.20.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose ports
EXPOSE 3001 8080

# Start the server
CMD ["pnpm", "start"]



