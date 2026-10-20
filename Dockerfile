FROM node:20-bookworm

WORKDIR /app

# Install build tools needed for native Node.js modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Force sqlite3 to compile from source for this exact environment
RUN npm rebuild sqlite3 --build-from-source

# Copy the rest of your backend code
COPY . .

# Expose the port (Render will inject the PORT env variable)
EXPOSE 3000

CMD ["node", "server.js"]