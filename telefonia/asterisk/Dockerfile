FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends asterisk ca-certificates && rm -rf /var/lib/apt/lists/*
CMD ["asterisk", "-f", "-vvv", "-U", "asterisk", "-G", "asterisk"]
