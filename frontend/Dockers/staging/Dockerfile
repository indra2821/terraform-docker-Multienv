# Staging Dockerfile
FROM node:23-alpine AS build

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy entire project
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy build files to nginx (changed from dist to build)
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx configuration for staging
COPY nginx.staging.conf /etc/nginx/conf.d/default.conf

# Expose staging port (changed from 80)
EXPOSE 8083

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
