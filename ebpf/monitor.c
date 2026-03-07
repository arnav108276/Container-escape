#include <uapi/linux/ptrace.h>
#include <net/sock.h>
#include <bcc/proto.h>
#include <linux/sched.h>
#include <linux/fs.h>
#include "common.h"

BPF_RINGBUF_OUTPUT(events, 256);
BPF_HASH(container_map, u32, u64);

/* Helper function to extract container ID from cgroup */
static __always_inline int get_container_id(char *container_id) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    unsigned int inum;
    struct css_set *cgroups;
    struct cgroup_subsys_state *subsys;
    
    // Placeholder: In real implementation, parse cgroup path to extract container ID
    // For now, read from populated map or cgroup interface
    bpf_probe_read_kernel_str(container_id, MAX_CONTAINER_ID_LEN, "unknown");
    return 0;
}

/* Trace setuid syscall - potential privilege escalation */
TRACEPOINT_PROBE(syscalls, sys_enter_setuid) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&events, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_PRIVILEGE_ESCALATION;
    event->risk_level = RISK_HIGH;
    event->syscall_nr = 105; /* setuid */
    event->syscall_arg0 = args->uid;
    
    get_container_id(event->container_id);
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Trace setgid syscall */
TRACEPOINT_PROBE(syscalls, sys_enter_setgid) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&events, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_PRIVILEGE_ESCALATION;
    event->risk_level = RISK_HIGH;
    event->syscall_nr = 106; /* setgid */
    event->syscall_arg0 = args->gid;
    
    get_container_id(event->container_id);
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Trace open/openat syscall - detect unauthorized filesystem access */
TRACEPOINT_PROBE(syscalls, sys_enter_openat) {
    struct security_event *event;
    const char *filename;
    const char *dangerous_paths[] = {
        "/proc/sys",
        "/sys",
        "/dev",
        "/etc/shadow",
        "/etc/passwd"
    };
    
    filename = (const char *)args->filename;
    
    event = bpf_ringbuf_reserve(&events, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_UNAUTHORIZED_FILE_ACCESS;
    event->syscall_nr = 257; /* openat */
    event->syscall_arg0 = args->dirfd;
    
    bpf_probe_read_user_str(event->filepath, MAX_FILENAME_LEN, filename);
    get_container_id(event->container_id);
    
    /* Risk assessment (basic) */
    if (bpf_strncmp(event->filepath, 8, "/proc/sy") == 0 ||
        bpf_strncmp(event->filepath, 4, "/sys") == 0 ||
        bpf_strncmp(event->filepath, 11, "/etc/shadow") == 0) {
        event->risk_level = RISK_CRITICAL;
    } else if (bpf_strncmp(event->filepath, 4, "/dev") == 0) {
        event->risk_level = RISK_HIGH;
    } else {
        event->risk_level = RISK_LOW;
    }
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Trace mount syscall - detect container breakout attempts */
TRACEPOINT_PROBE(syscalls, sys_enter_mount) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&events, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_MOUNT_ATTEMPT;
    event->risk_level = RISK_CRITICAL;
    event->syscall_nr = 165; /* mount */
    
    bpf_probe_read_user_str(event->filepath, MAX_FILENAME_LEN, (const char *)args->source);
    get_container_id(event->container_id);
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}

/* Trace execve - detect suspicious process execution */
TRACEPOINT_PROBE(syscalls, sys_enter_execve) {
    struct security_event *event;
    
    event = bpf_ringbuf_reserve(&events, sizeof(*event), 0);
    if (!event)
        return 0;
    
    event->timestamp_ns = bpf_ktime_get_ns();
    event->pid = bpf_get_current_pid_tgid() >> 32;
    event->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event->gid = bpf_get_current_uid_gid() >> 32;
    event->event_type = EVENT_EXEC;
    event->risk_level = RISK_LOW;
    event->syscall_nr = 59; /* execve */
    
    bpf_probe_read_user_str(event->filepath, MAX_FILENAME_LEN, (const char *)args->filename);
    get_container_id(event->container_id);
    
    bpf_ringbuf_submit(event, 0);
    return 0;
}
