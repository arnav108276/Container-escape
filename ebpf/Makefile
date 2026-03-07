# Makefile for eBPF kernel programs

CLANG ?= clang
LLC ?= llc
STRIP ?= llvm-strip
VMLINUX_BTF ?= /sys/kernel/btf/vmlinux
LIBBPF_DIR ?= /usr/include/bpf
INCLUDES := -I/usr/include/bpf -I.

CLANG_BPF_SYS_INCLUDES = $(shell clang -v -E - </dev/null 2>&1 | sed -n '/^#include <...>/,/^End/p' | grep -oF '/' | head -1)

TARGETS = monitor.o detections.o

all: $(TARGETS)

monitor.o: monitor.c common.h
	$(CLANG) -O2 -g -target bpf \
		-c monitor.c -o monitor.o

detections.o: detections.c common.h
	$(CLANG) -O2 -g -target bpf \
		-c detections.c -o detections.o

clean:
	rm -f *.o *.d

install: $(TARGETS)
	install -D monitor.o /usr/local/lib/ebpf/monitor.o
	install -D detections.o /usr/local/lib/ebpf/detections.o

.PHONY: all clean install
