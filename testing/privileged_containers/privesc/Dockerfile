FROM alpine
RUN apk add --no-cache bash
RUN cp /bin/sh /bin/suid-sh && chmod +s /bin/suid-sh
CMD ["/bin/suid-sh", "-p", "-c", "whoami; id; sleep 1000"]
