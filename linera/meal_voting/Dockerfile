# Use a base image with Rust installed
FROM rust:1.76-bullseye as builder

# Install system dependencies required for Linera
RUN apt-get update && apt-get install -y \
    clang \
    protobuf-compiler \
    libssl-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install the Linera Toolchain
# We specify the version to match your local environment (0.15.8)
RUN cargo install linera-service --version 0.15.8 --features storage-service

# Create a new stage for the runtime to keep the image smaller
FROM debian:bullseye-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl1.1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the linera binary from the builder stage
COPY --from=builder /usr/local/cargo/bin/linera /usr/local/bin/linera

# Set the working directory
WORKDIR /app

# Copy the wallet configuration from your local machine
# IMPORTANT: This assumes you have committed .linera_conway to your repo
# or typically for Render, these would be separate, but for this MVP workflow
# we are baking them in.
COPY .linera_conway /app/.linera_conway

# Expose the requested port
EXPOSE 8081

# Set the default command to run the Linera service
# We use a shell script to allow using the PORT env var provided by Render
# Render typically sets $PORT. We default to 8081 if not set.
CMD ["sh", "-c", "linera --wallet .linera_conway/wallet.json --storage rocksdb:.linera_conway/storage.db --keystore .linera_conway/keystore.json service --port ${PORT:-8081}"]
