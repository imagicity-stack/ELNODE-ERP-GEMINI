# Use a lightweight Node.js 22 image (matches your current runtime)
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package management files
COPY package*.json ./

# Install exact dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Vite application
RUN npm run build

# Expose the internal container port
EXPOSE 3000

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
