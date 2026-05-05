FROM alpine
RUN apk add --no-cache stress-ng
CMD ["stress-ng", "--cpu", "1", "--cpu-load", "80", "--timeout", "1h"]
