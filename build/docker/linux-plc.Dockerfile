FROM ubuntu:24.04

ARG GO_VERSION=1.23.10
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        curl \
        git \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        npm \
        pkg-config \
        tar \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="${TARGETARCH:-amd64}"; \
    case "${arch}" in \
      amd64) goarch="amd64" ;; \
      arm64) goarch="arm64" ;; \
      *) echo "Unsupported Docker target arch: ${arch}" >&2; exit 1 ;; \
    esac; \
    curl --fail --location --show-error \
      --output /tmp/go.tgz \
      "https://go.dev/dl/go${GO_VERSION}.linux-${goarch}.tar.gz"; \
    tar -C /usr/local -xzf /tmp/go.tgz; \
    rm /tmp/go.tgz

RUN GOBIN=/usr/local/bin go install github.com/wailsapp/wails/v2/cmd/wails@v2.10.0

WORKDIR /workspace
CMD ["./scripts/package-linux-plc-deb.sh"]
