FROM node:24-bookworm-slim

ARG PI_VERSION=latest
ARG PI_ACP_VERSION=latest

# fd + ripgrep preinstalled: pi would otherwise download them from GitHub,
# which the sandbox network policy blocks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates fd-find git ripgrep \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g --ignore-scripts \
      "@earendil-works/pi-coding-agent@${PI_VERSION}" \
      "pi-acp@${PI_ACP_VERSION}"

# Default pi settings, copied into PI_CODING_AGENT_DIR on first start
# (/tmp is one of the few writable paths in an OpenShell sandbox).
COPY pi-settings.json /usr/local/share/pi-defaults/settings.json
COPY pi-acp-start /usr/local/bin/pi-acp-start
RUN chmod 755 /usr/local/bin/pi-acp-start

RUN mkdir -p /workspace && chown node:node /workspace
USER node
WORKDIR /workspace

ENV PI_CODING_AGENT_DIR=/tmp/pi-agent
