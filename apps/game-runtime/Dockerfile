FROM rust:1.99.1-bookworm@sha256:e6f2cff35d0f309acf8433b4f05878ed77092602c5065cc81801177da0bb3a9c AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/game-runtime/Cargo.toml apps/game-runtime/Cargo.toml
COPY apps/game-runtime/src apps/game-runtime/src
COPY crates/vl-protocol crates/vl-protocol
COPY proto/native proto/native
RUN cargo build --release --locked --package vl-game-runtime

FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
ARG SOURCE_REVISION
LABEL org.opencontainers.image.title="VirtualLife game runtime foundation"
LABEL org.opencontainers.image.revision="${SOURCE_REVISION}"
COPY --from=build /build/target/release/vl-game-runtime /usr/local/bin/vl-game-runtime
USER 65532:65532
ENV VL_RUNTIME_BIND=0.0.0.0:4400 VL_GAMEPLAY_ENABLED=0
EXPOSE 4400
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=3 CMD ["/usr/local/bin/vl-game-runtime", "--healthcheck"]
ENTRYPOINT ["/usr/local/bin/vl-game-runtime"]
