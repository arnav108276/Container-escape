#include <uapi/linux/ptrace.h>
#include <net/sock.h>
#include <bcc/proto.h>
#include <linux/sched.h>
#include "common.h"

BPF_RINGBUF_OUTPUT(detections, 256);

/* Detection rule: Capability modification */
TRACEPOINT_PROBE(syscalls, sys_enter_capset) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&detections, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_CAP_CHANGE;
    event->risk_level = RISK_HIGH;
    event->syscall_nr = 326; /* capset */
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Detection rule: Process clone/fork detection for suspicious child processes */
TRACEPOINT_PROBE(syscalls, sys_enter_clone) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&detections, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->syscall_nr = 56; /* clone */
    event->risk_level = RISK_LOW;
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Detection rule: Detect ptrace usage (process tracing) */
TRACEPOINT_PROBE(syscalls, sys_enter_ptrace) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&detections, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->syscall_nr = 101; /* ptrace */
    event->risk_level = RISK_HIGH;
    event->syscall_arg0 = args->request;
    event->syscall_arg1 = args->pid;
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Detection rule: Socket creation - network-based escape attempts */
TRACEPOINT_PROBE(syscalls, sys_enter_socket) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&detections, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->syscall_nr = 41; /* socket */
    event->syscall_arg0 = args->family;
    event->syscall_arg1 = args->type;
    event->risk_level = RISK_LOW;
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}
