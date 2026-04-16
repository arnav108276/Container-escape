/*
 * Tetragon LSM Hook Program
 * 
 * Real-time security enforcement using Linux Security Module hooks.
 * Provides synchronous blocking of dangerous syscalls at the kernel level.
 * 
 * Supported eBPF LSM hooks:
 *  - bpf_lsm_file_open: Block sensitive file access
 *  - bpf_lsm_bprm_check_security: Block unauthorized program execution
 *  - bpf_lsm_capable: Block unauthorized capability usage
 * 
 * Return values:
 *  - 0: ALLOW syscall to proceed
 *  - -EPERM (1): BLOCK syscall (kernel will fail with "Operation not permitted")
 * 
 * Kernel requirement: Linux 5.8+ with CONFIG_BPF_LSM=y
 * Compile: clang -O2 -target bpf -c lsm_hooks.c -o lsm_hooks.o
 */

#include "vmlinux.h"  /* Generated from kernel types */
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

/* License declaration - required by kernel */
char LICENSE[] SEC("license") = "Dual BSD/GPL";

/* ============================================================================
 * BPF MAPS: Kernel <-> Userspace Communication
 * ============================================================================
 */

/* Ring buffer for events (userspace reads from this) */
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024);  /* 256KB ring buffer */
} events SEC(".maps");

/* Array map for block list (paths to deny) */
struct block_entry {
    char path[256];
    __u32 action;  /* 0: log only, 1: block */
};

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 100);
    __type(key, __u32);
    __type(value, struct block_entry);
} blocked_paths SEC(".maps");

/* Capability denylists */
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 64);  /* One per capability */
    __type(key, __u32);
    __type(value, __u32);  /* 1 if blocked, 0 if allowed */
} blocked_capabilities SEC(".maps");

/* Configuration map */
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 10);
    __type(key, __u32);
    __type(value, __u32);
} config_map SEC(".maps");

#define CONFIG_LSM_ENABLED 0
#define CONFIG_LOG_LEVEL 1
#define EPERM 1

/* ============================================================================
 * EVENT STRUCTURES
 * ============================================================================
 */

struct file_access_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 gid;
    __u8 event_type;      /* 1: file_open, 2: file_read, etc */
    __u8 action;          /* 0: allowed, 1: blocked */
    char filepath[64];
    char comm[16];
};

struct capability_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 cap;
    __u8 action;
    char comm[16];
};

struct exec_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 ppid;
    __u32 uid;
    char filename[64];
    char args[128];
    __u8 action;
    char comm[16];
};

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

/*
 * Safe string copy from kernel pointer to buffer
 * Returns: number of bytes copied (not including null terminator)
 */
static __always_inline __u32 safe_strncpy(char *dst, const char *src, __u32 len) {
    __u32 i = 0;
    
    #pragma unroll
    for (i = 0; i < len - 1; i++) {
        char c = 0;
        
        /* Safe read from kernel memory */
        if (bpf_probe_read_kernel(&c, 1, &src[i])) {
            break;
        }
        
        if (c == '\0') {
            break;
        }
        
        dst[i] = c;
    }
    
    dst[i] = '\0';
    return i;
}

/*
 * Get current process context
 */
static __always_inline void get_current_task_info(__u32 *pid, __u32 *uid, __u32 *gid) {
    __u64 uid_gid = bpf_get_current_uid_gid();
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    
    *pid = pid_tgid >> 32;
    *uid = uid_gid & 0xFFFFFFFF;
    *gid = uid_gid >> 32;
}

/*
 * Check if path is in blocked list
 * Returns: 1 if blocked, 0 if allowed
 */
static __always_inline int is_path_blocked(const char *filepath) {
    /* Check against each blocked path in map */
    #pragma unroll
    for (__u32 i = 0; i < 100; i++) {
        struct block_entry *entry = bpf_map_lookup_elem(&blocked_paths, &i);
        if (!entry) {
            continue;
        }
        
        if (entry->action == 0) {  /* Empty slot */
            break;
        }
        
        /* Compare paths - kernel string comparison */
        char tmp[64] = {};
        safe_strncpy(tmp, filepath, 64);

        if (!__builtin_strcmp(tmp, entry->path)) {
            return 1;  /* BLOCK */
        }
    }

    return 0;  /* ALLOW */
}

/* ============================================================================
 * Submit event to ring buffer for userspace processing
 * ============================================================================
 */
static __always_inline void submit_event(void *data, __u32 size) {
    bpf_ringbuf_output(&events, data, size, 0);
}

/* ============================================================================
 * LSM HOOK: FILE OPEN
 * ============================================================================
 */

SEC("lsm/file_open")
int BPF_PROG(lsm_file_open, struct file *file) {
    /* Get file path from struct file */
    struct dentry *dentry = file->f_path.dentry;
    if (!dentry) {
        return 0;  /* Allow if we can't read dentry */
    }
    
    struct inode *inode = dentry->d_inode;
    if (!inode) {
        return 0;
    }
    
    /* Get current process info */
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    /* Build event */
    struct file_access_event event = {
        .timestamp_ns = bpf_ktime_get_ns(),
        .pid = pid,
        .uid = uid,
        .gid = gid,
        .event_type = 1,  /* FILE_OPEN */
    };
    
    /* Get process name */
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    /* Get file path - kernel string read */
    const char *f = (const char *)file->f_path.dentry->d_name.name;
    if (f) {
        safe_strncpy(event.filepath, f, 256);
    }
    
    /* Check if path is blocked */
    if (is_path_blocked(event.filepath)) {
        event.action = 1;  /* BLOCKED */
        submit_event(&event, sizeof(event));
        return -EPERM;  /* Synchronous block! */
    }
    
    event.action = 0;  /* ALLOWED */
    
    /* Only log for sensitive paths even if allowed */
    if (__builtin_strstr(event.filepath, "/etc/") ||
        __builtin_strstr(event.filepath, "/root/") ||
        __builtin_strstr(event.filepath, ".env")) {
        submit_event(&event, sizeof(event));
    }
    
    return 0;  /* Allow */
}

/* ============================================================================
 * LSM HOOK: CAPABILITY CHECK
 * ============================================================================
 */

SEC("lsm/capable")
int BPF_PROG(lsm_capable, const struct cred *cred, struct user_namespace *ns, int cap) {
    /* Get current process info */
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    /* Check if this capability is blocked */
    __u32 *blocked = bpf_map_lookup_elem(&blocked_capabilities, (void *)(__u64)cap);
    if (blocked && *blocked == 1) {
        /* Create event */
        struct capability_event event = {
            .timestamp_ns = bpf_ktime_get_ns(),
            .pid = pid,
            .uid = uid,
            .cap = cap,
            .action = 1,  /* BLOCKED */
        };
        
        bpf_get_current_comm(&event.comm, sizeof(event.comm));
        submit_event(&event, sizeof(event));
        
        return -EPERM;  /* Synchronous block! */
    }
    
    return 0;  /* Allow */
}

/* ============================================================================
 * LSM HOOK: PROGRAM EXECUTION CHECK
 * ============================================================================
 */

SEC("lsm/bprm_check_security")
int BPF_PROG(lsm_bprm_check_security, struct linux_binprm *bprm) {
    /* Get current process info */
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    /* Build event */
    struct exec_event event = {
        .timestamp_ns = bpf_ktime_get_ns(),
        .pid = pid,
        .uid = uid,
        .ppid = 0,  /* Would need to traverse task_struct to get PPID */
        .action = 0,
    };
    
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    /* Get program filename */
    if (bprm->filename) {
        safe_strncpy(event.filename, bprm->filename, 256);
    }
    
    /* Note: Full args parsing would require reading more of bprm structure
     * and handling argument pages - simplified here for clarity */
    
    /* Check if executable is suspicious */
    if (__builtin_strstr(event.filename, "nc") ||      /* netcat */
        __builtin_strstr(event.filename, "socat") ||   /* socat */
        __builtin_strstr(event.filename, "/tmp/") ||   /* /tmp execution */
        __builtin_strstr(event.filename, "/dev/shm/")) { /* /dev/shm execution */
        
        event.action = 1;  /* BLOCKED */
        submit_event(&event, sizeof(event));
        
        /* Optionally block (depends on policy) */
        // return -EPERM;
    }
    
    event.action = 0;  /* Log and allow for now */
    submit_event(&event, sizeof(event));
    
    return 0;  /* Allow */
}

/* ============================================================================
 * DEBUG/TEST HOOK (remove in production)
 * ============================================================================
 */

SEC("tracepoint/syscalls/sys_enter_openat")
int trace_openat(struct trace_event_raw_sys_enter *ctx) {
    /* This is called for ALL openat syscalls
     * Demonstrates basic tracepoint usage
     * Can be removed once LSM hooks are working
     */
    
    __u64 offset;
    const char *filename;
    unsigned int flags;
    
    /* Read syscall arguments from ctx->args[N] */
    // filename = (const char *)ctx->args[1];  /* Second arg is filename */
    
    /* Note: Real implementation reads from user space safely */
    
    return 0;
}

/* ============================================================================
 * TODO: ADDITIONAL HOOKS FOR PRODUCTION
 * 
 * - bpf_lsm_socket_connect: Block outbound to malicious IPs/domains
 * - bpf_lsm_setuid: Block privilege escalation
 * - bpf_lsm_setgid: Block group privilege changes
 * - bpf_lsm_task_setpgid: Block process group changes
 * 
 * ============================================================================
 */
