FROM alpine
RUN apk add --no-cache bash netcat-openbsd
COPY shell.sh /shell.sh
RUN chmod +x /shell.sh
CMD ["bash", "/shell.sh"]
